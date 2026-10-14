package quota

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/lab34/llm-proxy/internal/models"
)

// ModelsDriver fetches available models from the provider's /v1/models endpoint
// and formats them as quota buckets, allowing users to see online model lists
// even if numeric quota tracking is not supported by the upstream.
type ModelsDriver struct {
	client *http.Client
}

func NewModelsDriver() *ModelsDriver {
	return &ModelsDriver{
		client: &http.Client{Timeout: 5 * time.Second},
	}
}

func (d *ModelsDriver) Type() string {
	return "models"
}

func (d *ModelsDriver) Fetch(ctx context.Context, p *models.Provider) (*Result, error) {
	// 1. Try /v1/quota first if upstream supports it (e.g. gemini-web2api)
	quotaURL := strings.TrimRight(p.BaseURL, "/") + "/v1/quota"
	if qReq, err := http.NewRequestWithContext(ctx, http.MethodGet, quotaURL, nil); err == nil {
		if p.APIKey != "" {
			qReq.Header.Set("Authorization", "Bearer "+p.APIKey)
		}
		if qResp, err := d.client.Do(qReq); err == nil {
			defer qResp.Body.Close()
			if qResp.StatusCode == http.StatusOK {
				var qResult struct {
					Status    string   `json:"status"`
					Account   string   `json:"account"`
					Buckets   []Bucket `json:"buckets"`
					Message   string   `json:"message"`
					UpdatedAt string   `json:"updated_at"`
				}
				if body, err := io.ReadAll(qResp.Body); err == nil {
					if err := json.Unmarshal(body, &qResult); err == nil && len(qResult.Buckets) > 0 {
						return &Result{
							Status:   qResult.Status,
							Account:  qResult.Account,
							Buckets:  qResult.Buckets,
							Message:  qResult.Message,
						}, nil
					}
				}
			}
		}
	}

	// 2. Fallback to /v1/models to at least show all online models
	upstreamURL := strings.TrimRight(p.BaseURL, "/") + "/v1/models"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, upstreamURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create models request: %w", err)
	}
	if p.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+p.APIKey)
	}

	resp, err := d.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch models: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("upstream returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read models response: %w", err)
	}

	var res struct {
		Data []struct {
			ID          string `json:"id"`
			Description string `json:"description"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &res); err != nil {
		return nil, fmt.Errorf("parse models response: %w", err)
	}

	hundred := 100.0
	one := 1.0
	buckets := make([]Bucket, 0, len(res.Data))
	for _, m := range res.Data {
		if m.ID == "" {
			continue
		}
		desc := m.Description
		if desc == "" {
			desc = "在线可用"
		}
		buckets = append(buckets, Bucket{
			ModelID:            m.ID,
			RemainingPercent:   &hundred,
			RemainingFraction:  &one,
			ResetTimeFormatted: desc,
		})
	}

	accountStr := "在线会话 (Active)"
	if strings.Contains(p.Name, "gemini") || strings.Contains(p.BaseURL, "8081") {
		accountStr = "Gemini Web 会话"
	}

	return &Result{
		Status:  "ok",
		Account: accountStr,
		Buckets: buckets,
		Message: fmt.Sprintf("已成功获取 %d 个可用模型", len(buckets)),
	}, nil
}
