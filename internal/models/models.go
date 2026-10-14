package models

import (
	"strings"
	"time"
)

// Provider represents an upstream LLM provider configuration.
type Provider struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	BaseURL     string    `json:"base_url"`
	APIKey      string    `json:"-"` // never serialised to clients
	QuotaType   string    `json:"quota_type"`
	QuotaConfig string    `json:"quota_config,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// APIKey represents a proxy API key issued to a client.
type APIKey struct {
	ID               string     `json:"id"`
	Name             string     `json:"name"`
	KeyHash          string     `json:"-"` // SHA-256 hash stored in DB
	ProviderID       string     `json:"provider_id"`
	AllowedProviders string     `json:"allowed_providers"`
	RateLimitRPM     int        `json:"rate_limit_rpm"`
	CreatedAt        time.Time  `json:"created_at"`
	RevokedAt        *time.Time `json:"revoked_at,omitempty"`
}

// IsProviderAllowed checks if a provider ID is allowed for this API key.
// If AllowedProviders is empty, it strictly allows only the primary ProviderID.
func (k *APIKey) IsProviderAllowed(providerID string) bool {
	if k.AllowedProviders == "" {
		return k.ProviderID == providerID
	}
	if k.AllowedProviders == "*" {
		return true
	}
	parts := strings.Split(k.AllowedProviders, ",")
	for _, p := range parts {
		if strings.TrimSpace(p) == providerID {
			return true
		}
	}
	return false
}

// UsageRecord represents a single proxied request's token usage.
type UsageRecord struct {
	ID               string    `json:"id"`
	APIKeyID         string    `json:"api_key_id"`
	ProviderID       string    `json:"provider_id"`
	Model            string    `json:"model"`
	PromptTokens     int       `json:"prompt_tokens"`
	CompletionTokens int       `json:"completion_tokens"`
	TotalTokens      int       `json:"total_tokens"`
	CreatedAt        time.Time `json:"created_at"`
}

// Guardrail represents a content filtering rule applied to outgoing LLM requests.
type Guardrail struct {
	ID        string    `json:"id"`
	Pattern   string    `json:"pattern"`              // regular expression
	Mode      string    `json:"mode"`                 // "reject" or "replace"
	ReplaceBy string    `json:"replace_by,omitempty"` // replacement text when mode=replace
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// GuardrailEvent records when a "reject" guardrail was triggered.
type GuardrailEvent struct {
	ID          string    `json:"id"`
	GuardrailID string    `json:"guardrail_id"`
	APIKeyID    string    `json:"api_key_id"`
	Pattern     string    `json:"pattern"`
	Mode        string    `json:"mode"`
	InputText   string    `json:"input_text"` // full message content that triggered the guardrail
	CreatedAt   time.Time `json:"created_at"`
}
