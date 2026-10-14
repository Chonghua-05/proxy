package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/lab34/llm-proxy/internal/middleware"
	"github.com/lab34/llm-proxy/internal/models"
	"github.com/lab34/llm-proxy/internal/proxy"
	"github.com/lab34/llm-proxy/internal/store"
	"github.com/labstack/echo/v4"
)

type ProxyHandler struct {
	forwarder *proxy.Forwarder
	providers *store.ProviderStore
}

func NewProxyHandler(f *proxy.Forwarder, p *store.ProviderStore) *ProxyHandler {
	return &ProxyHandler{forwarder: f, providers: p}
}

func (h *ProxyHandler) resolveProviderAndRewriteBody(c echo.Context, apiKey *models.APIKey, defaultProvider *models.Provider) (*models.Provider, error) {
	req := c.Request()
	if req.Body == nil {
		return defaultProvider, nil
	}

	body, err := io.ReadAll(req.Body)
	if err != nil {
		return defaultProvider, err
	}
	defer req.Body.Close()

	if len(body) == 0 {
		req.Body = io.NopCloser(bytes.NewReader(body))
		return defaultProvider, nil
	}

	var payload map[string]json.RawMessage
	if err := json.Unmarshal(body, &payload); err != nil {
		req.Body = io.NopCloser(bytes.NewReader(body))
		return defaultProvider, nil
	}

	var modelStr string
	if rawModel, ok := payload["model"]; ok {
		_ = json.Unmarshal(rawModel, &modelStr)
	}

	if modelStr == "" {
		req.Body = io.NopCloser(bytes.NewReader(body))
		return defaultProvider, nil
	}

	cleanModel, targetName := routeModel(modelStr)
	targetProvider := defaultProvider

	if targetName != "" {
		p, err := h.providers.GetByName(targetName)
		if err == nil && p != nil {
			targetProvider = p
		}
	}

	// Enforce provider permission check for this API key
	if !apiKey.IsProviderAllowed(targetProvider.ID) {
		if apiKey.AllowedProviders != "" {
			return nil, echo.NewHTTPError(http.StatusForbidden, fmt.Sprintf("model %q targets provider %q which is not permitted for this API key", modelStr, targetProvider.Name))
		}
		// If no explicit allowed_providers list, strictly use defaultProvider
		targetProvider = defaultProvider
	}

	// Rewrite model if prefix was stripped
	if cleanModel != modelStr {
		newModelRaw, _ := json.Marshal(cleanModel)
		payload["model"] = newModelRaw
		if newBody, err := json.Marshal(payload); err == nil {
			body = newBody
		}
	}

	req.Body = io.NopCloser(bytes.NewReader(body))
	req.ContentLength = int64(len(body))
	return targetProvider, nil
}

func routeModel(model string) (cleanModel string, targetProviderName string) {
	// 1. Explicit prefix
	if strings.HasPrefix(model, "web/") {
		return strings.TrimPrefix(model, "web/"), "gemini-web"
	}
	if strings.HasPrefix(model, "ag/") {
		return strings.TrimPrefix(model, "ag/"), "antigravity-local"
	}
	if strings.HasPrefix(model, "antigravity/") {
		return strings.TrimPrefix(model, "antigravity/"), "antigravity-local"
	}

	// 2. Heuristic model matching
	lower := strings.ToLower(model)
	if strings.HasPrefix(lower, "gemini-4") ||
		strings.HasPrefix(lower, "argon") ||
		strings.HasPrefix(lower, "gemini-3.1-pro") {
		return model, "gemini-web"
	}

	// Default to antigravity
	return model, "antigravity-local"
}

func (h *ProxyHandler) ChatCompletion(c echo.Context) error {
	apiKey := middleware.GetAPIKey(c)
	if apiKey == nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "missing api key")
	}

	defaultProvider, err := h.providers.GetByID(apiKey.ProviderID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to look up provider")
	}
	if defaultProvider == nil {
		return echo.NewHTTPError(http.StatusBadGateway, "provider not found for this key")
	}

	provider, err := h.resolveProviderAndRewriteBody(c, apiKey, defaultProvider)
	if err != nil {
		return err
	}

	if err := h.forwarder.ForwardChatCompletion(c.Response().Writer, c.Request(), provider, apiKey); err != nil {
		var grErr *proxy.GuardrailRejectedError
		if errors.As(err, &grErr) {
			return c.JSON(http.StatusBadRequest, map[string]interface{}{
				"error": map[string]interface{}{
					"message": grErr.Error(),
					"type":    "guardrail_rejected",
					"code":    "guardrail_rejected",
				},
			})
		}
		return echo.NewHTTPError(http.StatusBadGateway, err.Error())
	}
	return nil
}

func (h *ProxyHandler) Responses(c echo.Context) error {
	apiKey := middleware.GetAPIKey(c)
	if apiKey == nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "missing api key")
	}

	defaultProvider, err := h.providers.GetByID(apiKey.ProviderID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to look up provider")
	}
	if defaultProvider == nil {
		return echo.NewHTTPError(http.StatusBadGateway, "provider not found for this key")
	}

	provider, err := h.resolveProviderAndRewriteBody(c, apiKey, defaultProvider)
	if err != nil {
		return err
	}

	if err := h.forwarder.ForwardResponses(c.Response().Writer, c.Request(), provider, apiKey); err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, err.Error())
	}
	return nil
}

func (h *ProxyHandler) ListModels(c echo.Context) error {
	apiKey := middleware.GetAPIKey(c)
	if apiKey == nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "missing api key")
	}

	all, err := h.providers.List()
	if err != nil || len(all) == 0 {
		provider, err := h.providers.GetByID(apiKey.ProviderID)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to look up provider")
		}
		if provider == nil {
			return echo.NewHTTPError(http.StatusBadGateway, "provider not found for this key")
		}
		if err := h.forwarder.ForwardListModels(c.Response().Writer, c.Request(), provider); err != nil {
			return echo.NewHTTPError(http.StatusBadGateway, err.Error())
		}
		return nil
	}

	// Filter down to only providers permitted for this API key
	var allowed []models.Provider
	for _, p := range all {
		if apiKey.IsProviderAllowed(p.ID) {
			allowed = append(allowed, p)
		}
	}

	if len(allowed) == 0 {
		return echo.NewHTTPError(http.StatusForbidden, "no allowed providers for this API key")
	}

	merged := h.forwarder.FetchAndMergeModels(c.Request().Context(), allowed)
	return c.JSON(http.StatusOK, merged)
}
