package quota

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/lab34/llm-proxy/internal/models"
)

// BalanceDriver handles standard balance/billing endpoints (OpenAI/New-API/One-API compatible).
type BalanceDriver struct{}

func (d *BalanceDriver) Type() string {
	return "balance"
}

func (d *BalanceDriver) Fetch(ctx context.Context, p *models.Provider) (*Result, error) {
	baseURL := strings.TrimRight(p.BaseURL, "/")
	billingURL := baseURL + "/v1/dashboard/billing/subscription"

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, billingURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+p.APIKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request billing info: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("billing endpoint status: %d", resp.StatusCode)
	}

	var data struct {
		HardLimitUSD float64 `json:"hard_limit_usd"`
		SystemHardLimitUSD float64 `json:"system_hard_limit_usd"`
		AccountName string  `json:"account_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, fmt.Errorf("decode billing response: %w", err)
	}

	bal := data.HardLimitUSD
	return &Result{
		Account:   data.AccountName,
		Status:    "ok",
		Balance:   &bal,
		Currency:  "USD",
		UpdatedAt: time.Now().UTC(),
	}, nil
}
