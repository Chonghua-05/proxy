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

	// Resolve upstream model ID based on thinking / reasoning_effort parameters
	finalModel := resolveUpstreamModel(cleanModel, payload, targetProvider)
	if finalModel != modelStr {
		newModelRaw, _ := json.Marshal(finalModel)
		payload["model"] = newModelRaw
		if newBody, err := json.Marshal(payload); err == nil {
			body = newBody
		}
	}

	req.Body = io.NopCloser(bytes.NewReader(body))
	req.ContentLength = int64(len(body))
	return targetProvider, nil
}

func normalizeModelID(model string) string {
	lower := strings.ToLower(strings.TrimSpace(model))
	switch lower {
	case "gemini4argon", "gemini-4-argon", "argon":
		return "gemini-4-argon"
	}
	return model
}

func extractReasoningEffort(payload map[string]json.RawMessage) string {
	if raw, ok := payload["reasoning_effort"]; ok {
		var s string
		if err := json.Unmarshal(raw, &s); err == nil && s != "" {
			return strings.ToLower(strings.TrimSpace(s))
		}
	}
	// Check nested thinking object (e.g. {"thinking": {"effort": "high"}})
	if raw, ok := payload["thinking"]; ok {
		var th struct {
			Effort string `json:"effort"`
			Level  string `json:"level"`
		}
		if err := json.Unmarshal(raw, &th); err == nil {
			if th.Effort != "" {
				return strings.ToLower(strings.TrimSpace(th.Effort))
			}
			if th.Level != "" {
				return strings.ToLower(strings.TrimSpace(th.Level))
			}
		}
	}
	return ""
}

// resolveUpstreamModel maps clean base model IDs (e.g. gemini-4-argon, gemini-3.8-flash)
// to upstream tiered IDs when targeting antigravity, controlled by reasoning_effort.
func resolveUpstreamModel(model string, payload map[string]json.RawMessage, p *models.Provider) string {
	// If the provider is not antigravity, return the clean model as-is
	if p == nil || (p.QuotaType != "antigravity" && !strings.Contains(strings.ToLower(p.Name), "antigravity")) {
		return model
	}

	effort := extractReasoningEffort(payload)
	// Normalize effort to one of: low, medium, high
	var level string
	switch effort {
	case "low", "minimal":
		level = "low"
	case "medium":
		level = "medium"
	case "high", "xhigh", "max":
		level = "high"
	}

	lower := strings.ToLower(model)
	// If already explicitly suffixed with tiered level, preserve it
	if strings.HasSuffix(lower, "-low") || strings.HasSuffix(lower, "-medium") || strings.HasSuffix(lower, "-high") {
		return model
	}

	switch lower {
	case "gemini-4-argon", "gemini4argon", "argon":
		if level == "" {
			level = "medium" // Official default for Gemini 4 Argon
		}
		return "gemini-4-argon-" + level

	case "gemini-4-hydrogen", "gemini4hydrogen", "hydrogen":
		if level == "" {
			level = "high"
		} else if effort == "xhigh" || effort == "max" {
			level = "xhigh"
		}
		return "gemini-4-hydrogen-" + level

	case "gemini-3.8-flash":
		if level == "" {
			level = "high"
		}
		return "gemini-3.8-flash-" + level

	case "claude-opus-5-5":
		if level == "" {
			level = "high"
		}
		return "claude-opus-5-5-" + level

	case "claude-sonnet-5-5":
		if level == "" {
			level = "high"
		}
		return "claude-sonnet-5-5-" + level
	}

	return model
}

func routeModel(model string) (cleanModel string, targetProviderName string) {
	// 1. Explicit prefix
	if strings.HasPrefix(model, "ag/") {
		return normalizeModelID(strings.TrimPrefix(model, "ag/")), "antigravity-local"
	}
	if strings.HasPrefix(model, "antigravity/") {
		return normalizeModelID(strings.TrimPrefix(model, "antigravity/")), "antigravity-local"
	}
	if strings.HasPrefix(model, "opencode/") {
		return strings.TrimPrefix(model, "opencode/"), "opencode-free"
	}
	if strings.HasPrefix(model, "zen/") {
		return strings.TrimPrefix(model, "zen/"), "opencode-free"
	}
	if strings.HasPrefix(model, "free/") {
		return strings.TrimPrefix(model, "free/"), "opencode-free"
	}

	// 2. Heuristic model matching
	lower := strings.ToLower(model)
	if strings.HasSuffix(lower, "-free") ||
		strings.HasPrefix(lower, "deepseek") ||
		strings.HasPrefix(lower, "mimo") ||
		strings.HasPrefix(lower, "nemotron") ||
		strings.HasPrefix(lower, "longcat") ||
		strings.HasPrefix(lower, "muse-spark") ||
		lower == "big-pickle" ||
		lower == "space-bunny" ||
		lower == "beam" ||
		lower == "ll-alpha" {
		return model, "opencode-free"
	}

	// Default to key's defaultProvider
	return normalizeModelID(model), ""
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
