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


func TestQuotaManager_AntigravitySummaryDriver(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/v1internal:retrieveUserQuotaSummary", r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"groups": []map[string]interface{}{
				{
					"displayName": "Gemini Models",
					"description": "Models within this group: Gemini Flash, Gemini Pro",
					"buckets": []map[string]interface{}{
						{
							"bucketId":          "gemini-weekly",
							"displayName":       "Weekly Limit Remaining",
							"window":            "weekly",
							"remainingFraction": 0.158,
							"resetTime":         "2026-10-16T04:09:00Z",
						},
						{
							"bucketId":          "gemini-5h",
							"displayName":       "Five Hour Limit Remaining",
							"window":            "5h",
							"remainingFraction": 0.961,
							"resetTime":         "2026-10-15T23:23:00Z",
						},
					},
				},
				{
					"displayName": "Claude and GPT models",
					"description": "Models within this group: Claude Sonnet, Claude Opus",
					"buckets": []map[string]interface{}{
						{
							"bucketId":          "3p-weekly",
							"displayName":       "Weekly Limit Remaining",
							"window":            "weekly",
							"remainingFraction": 0.986,
						},
						{
							"bucketId":          "3p-5h",
							"displayName":       "Five Hour Limit Remaining",
							"window":            "5h",
							"remainingFraction": 1.0,
						},
					},
				},
			},
		})
	}))
	defer srv.Close()

	tmpDir := t.TempDir()
	authPath := filepath.Join(tmpDir, "antigravity-summary-test.json")
	authContent := `{"client_id":"cid","client_secret":"csec","refresh_token":"rt","access_token":"at","email":"test@example.com"}`
	require.NoError(t, os.WriteFile(authPath, []byte(authContent), 0600))

	m := NewManager()
	p := &models.Provider{
		ID:          "p4",
		Name:        "ag-summary",
		QuotaType:   "antigravity",
		QuotaConfig: `{"auth_file":"` + authPath + `","proxy_url":"direct","base_url":"` + srv.URL + `"}`,
	}

	res, err := m.Fetch(context.Background(), p)
	require.NoError(t, err)
	assert.Equal(t, "warning", res.Status)
	assert.Equal(t, "test@example.com", res.Account)
	require.Len(t, res.Buckets, 4)
	assert.Equal(t, "gemini-5h", res.Buckets[0].ModelID)
	assert.Equal(t, "Gemini 5小时额度", res.Buckets[0].DisplayName)
	assert.Equal(t, "gemini-weekly", res.Buckets[1].ModelID)
	assert.Equal(t, "Gemini 周限额", res.Buckets[1].DisplayName)
	assert.Contains(t, res.Buckets[0].Models, "gemini-3.8-flash-high")
	assert.Contains(t, res.Buckets[2].Models, "claude-sonnet-4-6")
}

// summaryHost returns a test server answering retrieveUserQuotaSummary with the
// given groups, counting how often it was asked.
func summaryHost(t *testing.T, calls *int, groups []map[string]interface{}) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*calls++
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"groups": groups})
	}))
	t.Cleanup(srv.Close)
	return srv
}

func geminiGroup(fraction float64) map[string]interface{} {
	return map[string]interface{}{
		"displayName": "Gemini Models",
		"buckets": []map[string]interface{}{
			{"bucketId": "gemini-5h", "displayName": "Five Hour Limit Remaining",
				"window": "5h", "remainingFraction": fraction},
		},
	}
}

func claudeOnlyGroup() map[string]interface{} {
	return map[string]interface{}{
		"displayName": "Claude and GPT models",
		"buckets": []map[string]interface{}{
			{"bucketId": "3p-5h", "displayName": "Five Hour Limit Remaining",
				"window": "5h", "remainingFraction": 0.5},
		},
	}
}

func fetchWithHosts(t *testing.T, hosts []string) *Result {
	t.Helper()
	orig := antigravityQuotaHosts
	antigravityQuotaHosts = hosts
	t.Cleanup(func() { antigravityQuotaHosts = orig })

	authPath := filepath.Join(t.TempDir(), "ag-hosts.json")
	require.NoError(t, os.WriteFile(authPath, []byte(
		`{"client_id":"cid","client_secret":"csec","refresh_token":"rt","access_token":"at","email":"hosts@example.com"}`), 0600))

	m := NewManager()
	p := &models.Provider{
		ID:          "p-hosts",
		Name:        "ag-hosts",
		QuotaType:   "antigravity",
		QuotaConfig: `{"auth_file":"` + authPath + `","proxy_url":"direct"}`,
	}
	res, err := m.Fetch(context.Background(), p)
	require.NoError(t, err)
	return res
}

// A host that already reports Gemini is authoritative: the remaining hosts must
// not be queried, otherwise every refresh pays for the whole list.
func TestAntigravityQuotaStopsAtFirstHostWithGemini(t *testing.T) {
	var first, second int
	primary := summaryHost(t, &first, []map[string]interface{}{geminiGroup(0.42), claudeOnlyGroup()})
	backup := summaryHost(t, &second, []map[string]interface{}{geminiGroup(0.99)})

	res := fetchWithHosts(t, []string{primary.URL, backup.URL})

	assert.Equal(t, 1, first)
	assert.Equal(t, 0, second, "backup host must not be queried")
	assert.Equal(t, "gemini-5h", res.Buckets[0].ModelID)
	require.NotNil(t, res.Buckets[0].RemainingFraction)
	assert.InDelta(t, 0.42, *res.Buckets[0].RemainingFraction, 1e-9)
}

// Accounts whose usage is accounted on another environment answer without a
// Gemini group; those responses must be skipped rather than shown as full quota.
func TestAntigravityQuotaSkipsHostWithoutGemini(t *testing.T) {
	var stale, real int
	withoutGemini := summaryHost(t, &stale, []map[string]interface{}{claudeOnlyGroup()})
	withGemini := summaryHost(t, &real, []map[string]interface{}{geminiGroup(0.31), claudeOnlyGroup()})

	res := fetchWithHosts(t, []string{withoutGemini.URL, withGemini.URL})

	assert.Equal(t, 1, stale)
	assert.Equal(t, 1, real)
	require.NotEmpty(t, res.Buckets)
	assert.Equal(t, "gemini-5h", res.Buckets[0].ModelID)
	require.NotNil(t, res.Buckets[0].RemainingFraction)
	assert.InDelta(t, 0.31, *res.Buckets[0].RemainingFraction, 1e-9)
}
