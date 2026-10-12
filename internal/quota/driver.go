package quota

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/lab34/llm-proxy/internal/models"
)

// Bucket represents a quota bucket for a specific model (e.g. Antigravity rate limits).
type Bucket struct {
	ModelID           string     `json:"model_id"`
	RemainingFraction *float64   `json:"remaining_fraction,omitempty"` // 0.0 ~ 1.0
	RemainingPercent  *float64   `json:"remaining_percent,omitempty"`  // 0.0 ~ 100.0
	ResetTime         *time.Time `json:"reset_time,omitempty"`
	ResetTimeFormatted string    `json:"reset_time_formatted,omitempty"`
}

// Result is the universal quota report for a provider.
type Result struct {
	ProviderID   string    `json:"provider_id"`
	ProviderName string    `json:"provider_name"`
	QuotaType    string    `json:"quota_type"` // e.g. "antigravity", "balance", "none"
	Account      string    `json:"account,omitempty"`
	Status       string    `json:"status"` // "ok", "warning", "error", "unsupported"
	Message      string    `json:"message,omitempty"`
	Balance      *float64  `json:"balance,omitempty"`
	Currency     string    `json:"currency,omitempty"`
	Buckets      []Bucket  `json:"buckets,omitempty"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// Driver is the interface for fetching upstream quota/balance information.
type Driver interface {
	Type() string
	Fetch(ctx context.Context, p *models.Provider) (*Result, error)
}

// Manager orchestrates quota drivers.
type Manager struct {
	mu      sync.RWMutex
	drivers map[string]Driver
}

func NewManager() *Manager {
	m := &Manager{
		drivers: make(map[string]Driver),
	}
	m.Register(&AntigravityDriver{})
	m.Register(&BalanceDriver{})
	return m
}

func (m *Manager) Register(d Driver) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.drivers[d.Type()] = d
}

func (m *Manager) Fetch(ctx context.Context, p *models.Provider) (*Result, error) {
	m.mu.RLock()
	driver, exists := m.drivers[p.QuotaType]
	m.mu.RUnlock()

	if !exists || p.QuotaType == "" || p.QuotaType == "none" {
		return &Result{
			ProviderID:   p.ID,
			ProviderName: p.Name,
			QuotaType:    p.QuotaType,
			Status:       "unsupported",
			Message:      fmt.Sprintf("quota fetching not configured or unsupported for type %q", p.QuotaType),
			UpdatedAt:    time.Now().UTC(),
		}, nil
	}

	res, err := driver.Fetch(ctx, p)
	if err != nil {
		return &Result{
			ProviderID:   p.ID,
			ProviderName: p.Name,
			QuotaType:    p.QuotaType,
			Status:       "error",
			Message:      err.Error(),
			UpdatedAt:    time.Now().UTC(),
		}, nil
	}
	res.ProviderID = p.ID
	res.ProviderName = p.Name
	res.QuotaType = p.QuotaType
	res.UpdatedAt = time.Now().UTC()
	return res, nil
}
