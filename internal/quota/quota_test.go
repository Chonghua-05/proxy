package quota

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/lab34/llm-proxy/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestQuotaManager_Unsupported(t *testing.T) {
	m := NewManager()
	p := &models.Provider{
		ID:        "p1",
		Name:      "test",
		QuotaType: "none",
	}
	res, err := m.Fetch(context.Background(), p)
	require.NoError(t, err)
	assert.Equal(t, "unsupported", res.Status)
}

func TestQuotaManager_BalanceDriver(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1/dashboard/billing/subscription", r.URL.Path)
		assert.Equal(t, "Bearer sk-test", r.Header.Get("Authorization"))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"hard_limit_usd": 120.5,
			"account_name":   "team-account",
		})
	}))
	defer srv.Close()

	m := NewManager()
	p := &models.Provider{
		ID:        "p2",
		Name:      "openai-proxy",
		BaseURL:   srv.URL,
		APIKey:    "sk-test",
		QuotaType: "balance",
	}
	res, err := m.Fetch(context.Background(), p)
	require.NoError(t, err)
	assert.Equal(t, "ok", res.Status)
	assert.Equal(t, "team-account", res.Account)
	require.NotNil(t, res.Balance)
	assert.Equal(t, 120.5, *res.Balance)
}

func TestQuotaManager_AntigravityDriver(t *testing.T) {
	// Mock CloudCode userQuota API
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		frac := 0.85
		json.NewEncoder(w).Encode(map[string]interface{}{
			"buckets": []map[string]interface{}{
				{
					"modelId":           "gemini-3.8-flash-high",
					"remainingFraction": frac,
					"resetTime":         "2026-10-13T12:00:00Z",
				},
			},
		})
	}))
	defer srv.Close()

	// Create temp auth file
	tmpDir := t.TempDir()
	authPath := filepath.Join(tmpDir, "antigravity-test.json")
	authContent := `{
		"client_id": "test_id",
		"client_secret": "test_secret",
		"refresh_token": "test_ref",
		"access_token": "test_acc",
		"email": "user@example.com"
	}`
	require.NoError(t, os.WriteFile(authPath, []byte(authContent), 0600))

	m := NewManager()
	customDriver := &AntigravityDriver{}
	m.Register(customDriver)

	p := &models.Provider{
		ID:          "p3",
		Name:        "antigravity-local",
		QuotaType:   "antigravity",
		QuotaConfig: `{"auth_file":"` + authPath + `","proxy_url":"direct","base_url":"` + srv.URL + `"}`,
	}

	res, err := m.Fetch(context.Background(), p)
	require.NoError(t, err)
	assert.Equal(t, "ok", res.Status)
	assert.Equal(t, "user@example.com", res.Account)
	require.Len(t, res.Buckets, 1)
	assert.Equal(t, "gemini-3.8-flash-high", res.Buckets[0].ModelID)
	assert.Equal(t, 0.85, *res.Buckets[0].RemainingFraction)
}
