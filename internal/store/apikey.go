package store

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/lab34/llm-proxy/internal/models"
)

type APIKeyStore struct {
	db *sql.DB
}

func NewAPIKeyStore(db *sql.DB) *APIKeyStore {
	return &APIKeyStore{db: db}
}

// Create generates a new proxy API key. It returns the model (with hash) and
// the raw key string. The raw key is never stored.
func (s *APIKeyStore) Create(name, providerID string, rateLimitRPM int) (*models.APIKey, string, error) {
	return s.CreateWithAllowedProviders(name, providerID, rateLimitRPM, "")
}

func (s *APIKeyStore) CreateWithAllowedProviders(name, providerID string, rateLimitRPM int, allowedProviders string) (*models.APIKey, string, error) {
	rawKey, err := generateKey()
	if err != nil {
		return nil, "", fmt.Errorf("generate key: %w", err)
	}
	hash := hashKey(rawKey)

	k := &models.APIKey{
		ID:               uuid.New().String(),
		Name:             name,
		KeyHash:          hash,
		ProviderID:       providerID,
		AllowedProviders: allowedProviders,
		RateLimitRPM:     rateLimitRPM,
		CreatedAt:        time.Now().UTC(),
	}

	_, err = s.db.Exec(
		`INSERT INTO api_keys (id, name, key_hash, provider_id, allowed_providers, rate_limit_rpm, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		k.ID, k.Name, k.KeyHash, k.ProviderID, k.AllowedProviders, k.RateLimitRPM, k.CreatedAt,
	)
	if err != nil {
		return nil, "", fmt.Errorf("insert api key: %w", err)
	}
	return k, rawKey, nil
}

func (s *APIKeyStore) List() ([]models.APIKey, error) {
	rows, err := s.db.Query(
		`SELECT id, name, key_hash, provider_id, allowed_providers, rate_limit_rpm, created_at, revoked_at FROM api_keys ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.APIKey
	for rows.Next() {
		var k models.APIKey
		if err := rows.Scan(&k.ID, &k.Name, &k.KeyHash, &k.ProviderID, &k.AllowedProviders, &k.RateLimitRPM, &k.CreatedAt, &k.RevokedAt); err != nil {
			return nil, err
		}
		out = append(out, k)
	}
	return out, rows.Err()
}

// Lookup finds a non-revoked API key by its raw key string.
func (s *APIKeyStore) Lookup(rawKey string) (*models.APIKey, error) {
	hash := hashKey(rawKey)
	var k models.APIKey
	err := s.db.QueryRow(
		`SELECT id, name, key_hash, provider_id, allowed_providers, rate_limit_rpm, created_at, revoked_at
		   FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL`, hash,
	).Scan(&k.ID, &k.Name, &k.KeyHash, &k.ProviderID, &k.AllowedProviders, &k.RateLimitRPM, &k.CreatedAt, &k.RevokedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &k, nil
}

func (s *APIKeyStore) Revoke(id string) error {
	now := time.Now().UTC()
	res, err := s.db.Exec(`UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`, now, id)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *APIKeyStore) Update(id string, name *string, providerID *string, rateLimitRPM *int) (*models.APIKey, error) {
	return s.UpdateWithAllowedProviders(id, name, providerID, nil, rateLimitRPM)
}

func (s *APIKeyStore) UpdateWithAllowedProviders(id string, name *string, providerID *string, allowedProviders *string, rateLimitRPM *int) (*models.APIKey, error) {
	var sets []string
	var args []interface{}

	if name != nil {
		sets = append(sets, "name = ?")
		args = append(args, *name)
	}
	if providerID != nil {
		sets = append(sets, "provider_id = ?")
		args = append(args, *providerID)
	}
	if allowedProviders != nil {
		sets = append(sets, "allowed_providers = ?")
		args = append(args, *allowedProviders)
	}
	if rateLimitRPM != nil {
		sets = append(sets, "rate_limit_rpm = ?")
		args = append(args, *rateLimitRPM)
	}

	if len(sets) == 0 {
		return s.GetByID(id)
	}

	args = append(args, id)
	query := fmt.Sprintf("UPDATE api_keys SET %s WHERE id = ?", strings.Join(sets, ", "))
	res, err := s.db.Exec(query, args...)
	if err != nil {
		return nil, fmt.Errorf("update api key: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return nil, sql.ErrNoRows
	}

	return s.GetByID(id)
}

func (s *APIKeyStore) GetByID(id string) (*models.APIKey, error) {
	var k models.APIKey
	err := s.db.QueryRow(
		`SELECT id, name, key_hash, provider_id, allowed_providers, rate_limit_rpm, created_at, revoked_at FROM api_keys WHERE id = ?`, id,
	).Scan(&k.ID, &k.Name, &k.KeyHash, &k.ProviderID, &k.AllowedProviders, &k.RateLimitRPM, &k.CreatedAt, &k.RevokedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &k, nil
}


// generateKey creates a "llmp-" prefixed random key.
func generateKey() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "llmp-" + hex.EncodeToString(b), nil
}

func hashKey(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:])
}
