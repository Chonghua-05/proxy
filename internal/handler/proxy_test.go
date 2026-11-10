package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/lab34/llm-proxy/internal/db"
	"github.com/lab34/llm-proxy/internal/middleware"
	"github.com/lab34/llm-proxy/internal/models"
	"github.com/lab34/llm-proxy/internal/proxy"
	"github.com/lab34/llm-proxy/internal/store"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestChatCompletion_NoAPIKey(t *testing.T) {
	database, err := db.Open(":memory:")
	require.NoError(t, err)
	defer database.Close()

	ps := store.NewProviderStore(database)
	us := store.NewUsageStore(database)
	gs := store.NewGuardrailStore(database)
	ges := store.NewGuardrailEventStore(database)
	f := proxy.NewForwarder(us, gs, ges)
	h := NewProxyHandler(f, ps)

	e := echo.New()
	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err = h.ChatCompletion(c)
	assert.Error(t, err)
	he, ok := err.(*echo.HTTPError)
	require.True(t, ok)
	assert.Equal(t, http.StatusUnauthorized, he.Code)
}

func TestResponses_NoAPIKey(t *testing.T) {
	database, err := db.Open(":memory:")
	require.NoError(t, err)
	defer database.Close()

	ps := store.NewProviderStore(database)
	us := store.NewUsageStore(database)
	gs := store.NewGuardrailStore(database)
	ges := store.NewGuardrailEventStore(database)
	f := proxy.NewForwarder(us, gs, ges)
	h := NewProxyHandler(f, ps)

	e := echo.New()
	req := httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err = h.Responses(c)
	assert.Error(t, err)
	he, ok := err.(*echo.HTTPError)
	require.True(t, ok)
	assert.Equal(t, http.StatusUnauthorized, he.Code)
}

func TestChatCompletion_ProviderNotFound(t *testing.T) {
	database, err := db.Open(":memory:")
	require.NoError(t, err)
	defer database.Close()

	ps := store.NewProviderStore(database)
	us := store.NewUsageStore(database)
	gs := store.NewGuardrailStore(database)
	ges := store.NewGuardrailEventStore(database)
	f := proxy.NewForwarder(us, gs, ges)
	h := NewProxyHandler(f, ps)

	e := echo.New()
	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	// Set a key with a non-existent provider.
	c.Set(string(middleware.APIKeyContextKey), &models.APIKey{
		ID:         "key1",
		ProviderID: "nonexistent-provider",
	})

	err = h.ChatCompletion(c)
	assert.Error(t, err)
	he, ok := err.(*echo.HTTPError)
	require.True(t, ok)
	assert.Equal(t, http.StatusBadGateway, he.Code)
}

func TestListModels_NoAPIKey(t *testing.T) {
	database, err := db.Open(":memory:")
	require.NoError(t, err)
	defer database.Close()

	ps := store.NewProviderStore(database)
	us := store.NewUsageStore(database)
	gs := store.NewGuardrailStore(database)
	ges := store.NewGuardrailEventStore(database)
	f := proxy.NewForwarder(us, gs, ges)
	h := NewProxyHandler(f, ps)

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/v1/models", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	err = h.ListModels(c)
	assert.Error(t, err)
	he, ok := err.(*echo.HTTPError)
	require.True(t, ok)
	assert.Equal(t, http.StatusUnauthorized, he.Code)
}

func TestListModels_ProviderNotFound(t *testing.T) {
	database, err := db.Open(":memory:")
	require.NoError(t, err)
	defer database.Close()

	ps := store.NewProviderStore(database)
	us := store.NewUsageStore(database)
	gs := store.NewGuardrailStore(database)
	ges := store.NewGuardrailEventStore(database)
	f := proxy.NewForwarder(us, gs, ges)
	h := NewProxyHandler(f, ps)

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/v1/models", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	c.Set(string(middleware.APIKeyContextKey), &models.APIKey{
		ID:         "key1",
		ProviderID: "nonexistent-provider",
	})

	err = h.ListModels(c)
	assert.Error(t, err)
	he, ok := err.(*echo.HTTPError)
	require.True(t, ok)
	assert.Equal(t, http.StatusBadGateway, he.Code)
}

func TestRouteModel(t *testing.T) {
	tests := []struct {
		input       string
		wantClean   string
		wantTarget  string
	}{
		{"gemini-4-argon", "gemini-4-argon", ""},
		{"gemini4argon", "gemini-4-argon", ""},
		{"argon", "gemini-4-argon", ""},
		{"gemini-4-argon-high", "gemini-4-argon-high", ""},
		{"opencode/deepseek-v4.1", "deepseek-v4.1", "opencode-free"},
		{"free/mimo-v2.6-flash", "mimo-v2.6-flash", "opencode-free"},
		{"deepseek-v4.1-flash-free", "deepseek-v4.1-flash-free", "opencode-free"},
		{"deepseek-chat", "deepseek-chat", "opencode-free"},
		{"big-pickle", "big-pickle", "opencode-free"},
		{"ag/gemini-3.8-flash-high", "gemini-3.8-flash-high", "antigravity-local"},
		{"antigravity/claude-sonnet-4-6", "claude-sonnet-4-6", "antigravity-local"},
		{"gemini-3.8-flash-high", "gemini-3.8-flash-high", ""},
		{"claude-sonnet-4-6", "claude-sonnet-4-6", ""},
	}

	for _, tt := range tests {
		clean, target := routeModel(tt.input)
		assert.Equal(t, tt.wantClean, clean, "input: %s", tt.input)
		assert.Equal(t, tt.wantTarget, target, "input: %s", tt.input)
	}
}

func TestResolveUpstreamModel(t *testing.T) {
	agProvider := &models.Provider{
		Name:      "antigravity-local",
		QuotaType: "antigravity",
	}

	tests := []struct {
		model    string
		payload  map[string]json.RawMessage
		expected string
	}{
		// 1. Gemini 4 Argon default is medium
		{
			model:    "gemini-4-argon",
			payload:  map[string]json.RawMessage{},
			expected: "gemini-4-argon-medium",
		},
		// 2. Gemini 4 Argon with explicit reasoning_effort: high
		{
			model: "gemini-4-argon",
			payload: map[string]json.RawMessage{
				"reasoning_effort": json.RawMessage(`"high"`),
			},
			expected: "gemini-4-argon-high",
		},
		// 3. Gemini 4 Argon with explicit thinking: {"effort": "low"}
		{
			model: "gemini4argon",
			payload: map[string]json.RawMessage{
				"thinking": json.RawMessage(`{"effort":"low"}`),
			},
			expected: "gemini-4-argon-low",
		},
		// 4. Gemini 3.8 Flash default is high
		{
			model:    "gemini-3.8-flash",
			payload:  map[string]json.RawMessage{},
			expected: "gemini-3.8-flash-high",
		},
		// 5. Claude Opus 5.5 default is high, with effort: medium
		{
			model: "claude-opus-5-5",
			payload: map[string]json.RawMessage{
				"reasoning_effort": json.RawMessage(`"medium"`),
			},
			expected: "claude-opus-5-5-medium",
		},
		// 6. Already suffixed models stay intact
		{
			model: "gemini-4-argon-low",
			payload: map[string]json.RawMessage{
				"reasoning_effort": json.RawMessage(`"high"`),
			},
			expected: "gemini-4-argon-low",
		},
	}

	for _, tt := range tests {
		actual := resolveUpstreamModel(tt.model, tt.payload, agProvider)
		assert.Equal(t, tt.expected, actual, "model: %s", tt.model)
	}
}
