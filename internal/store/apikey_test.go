package store

import (
	"database/sql"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAPIKeyStore_Create(t *testing.T) {
	database := setupTestDB(t)
	ps := NewProviderStore(database)
	ks := NewAPIKeyStore(database)

	provider, err := ps.Create("test-provider", "https://test.com", "sk-test")
	require.NoError(t, err)

	key, rawKey, err := ks.Create("my-key", provider.ID, 60)
	require.NoError(t, err)
	assert.NotEmpty(t, key.ID)
	assert.Equal(t, "my-key", key.Name)
	assert.Equal(t, provider.ID, key.ProviderID)
	assert.Equal(t, 60, key.RateLimitRPM)
	assert.NotEmpty(t, key.KeyHash)
	assert.Nil(t, key.RevokedAt)
	assert.True(t, strings.HasPrefix(rawKey, "llmp-"))
	assert.Len(t, rawKey, 5+64) // "llmp-" + 64 hex chars
}

func TestAPIKeyStore_List(t *testing.T) {
	database := setupTestDB(t)
	ps := NewProviderStore(database)
	ks := NewAPIKeyStore(database)

	provider, err := ps.Create("test-provider", "https://test.com", "sk-test")
	require.NoError(t, err)

	// Empty.
	list, err := ks.List()
	require.NoError(t, err)
	assert.Empty(t, list)

	_, _, err = ks.Create("key1", provider.ID, 0)
	require.NoError(t, err)
	_, _, err = ks.Create("key2", provider.ID, 100)
	require.NoError(t, err)

	list, err = ks.List()
	require.NoError(t, err)
	assert.Len(t, list, 2)
}

func TestAPIKeyStore_Lookup(t *testing.T) {
	database := setupTestDB(t)
	ps := NewProviderStore(database)
	ks := NewAPIKeyStore(database)

	provider, err := ps.Create("test-provider", "https://test.com", "sk-test")
	require.NoError(t, err)

	_, rawKey, err := ks.Create("lookup-key", provider.ID, 30)
	require.NoError(t, err)

	// Lookup by raw key.
	found, err := ks.Lookup(rawKey)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, "lookup-key", found.Name)
}

func TestAPIKeyStore_Lookup_NotFound(t *testing.T) {
	database := setupTestDB(t)
	ks := NewAPIKeyStore(database)

	found, err := ks.Lookup("llmp-nonexistent")
	require.NoError(t, err)
	assert.Nil(t, found)
}

func TestAPIKeyStore_Lookup_Revoked(t *testing.T) {
	database := setupTestDB(t)
	ps := NewProviderStore(database)
	ks := NewAPIKeyStore(database)

	provider, err := ps.Create("test-provider", "https://test.com", "sk-test")
	require.NoError(t, err)

	key, rawKey, err := ks.Create("revoke-key", provider.ID, 30)
	require.NoError(t, err)

	// Revoke.
	err = ks.Revoke(key.ID)
	require.NoError(t, err)

	// Lookup should return nil for revoked key.
	found, err := ks.Lookup(rawKey)
	require.NoError(t, err)
	assert.Nil(t, found)
}

func TestAPIKeyStore_Revoke(t *testing.T) {
	database := setupTestDB(t)
	ps := NewProviderStore(database)
	ks := NewAPIKeyStore(database)

	provider, err := ps.Create("test-provider", "https://test.com", "sk-test")
	require.NoError(t, err)

	key, _, err := ks.Create("revoke-me", provider.ID, 0)
	require.NoError(t, err)

	err = ks.Revoke(key.ID)
	assert.NoError(t, err)

	// Revoking again should fail (already revoked).
	err = ks.Revoke(key.ID)
	assert.Equal(t, sql.ErrNoRows, err)
}

func TestAPIKeyStore_Revoke_NotFound(t *testing.T) {
	database := setupTestDB(t)
	ks := NewAPIKeyStore(database)

	err := ks.Revoke("nonexistent")
	assert.Equal(t, sql.ErrNoRows, err)
}

func TestHashKey(t *testing.T) {
	hash1 := hashKey("test-key")
	hash2 := hashKey("test-key")
	hash3 := hashKey("different-key")

	assert.Equal(t, hash1, hash2) // deterministic
	assert.NotEqual(t, hash1, hash3)
	assert.Len(t, hash1, 64) // SHA-256 hex = 64 chars
}

func TestGenerateKey(t *testing.T) {
	key1, err := generateKey()
	require.NoError(t, err)
	assert.True(t, strings.HasPrefix(key1, "llmp-"))

	key2, err := generateKey()
	require.NoError(t, err)
	assert.NotEqual(t, key1, key2) // should be unique
}

func TestAPIKeyStore_Update(t *testing.T) {
	database := setupTestDB(t)
	ps := NewProviderStore(database)
	ks := NewAPIKeyStore(database)

	p1, err := ps.Create("provider-1", "https://p1.com", "sk-1")
	require.NoError(t, err)
	p2, err := ps.Create("provider-2", "https://p2.com", "sk-2")
	require.NoError(t, err)

	key, _, err := ks.Create("initial-name", p1.ID, 30)
	require.NoError(t, err)

	// Update name only
	newName := "updated-name"
	updated, err := ks.Update(key.ID, &newName, nil, nil)
	require.NoError(t, err)
	assert.Equal(t, "updated-name", updated.Name)
	assert.Equal(t, p1.ID, updated.ProviderID)
	assert.Equal(t, 30, updated.RateLimitRPM)

	// Update provider and rate limit
	newRPM := 120
	updated2, err := ks.Update(key.ID, nil, &p2.ID, &newRPM)
	require.NoError(t, err)
	assert.Equal(t, "updated-name", updated2.Name)
	assert.Equal(t, p2.ID, updated2.ProviderID)
	assert.Equal(t, 120, updated2.RateLimitRPM)

	// Update nonexistent
	_, err = ks.Update("nonexistent-id", &newName, nil, nil)
	assert.Equal(t, sql.ErrNoRows, err)

	// No-op update returns current
	same, err := ks.Update(key.ID, nil, nil, nil)
	require.NoError(t, err)
	assert.Equal(t, updated2.ID, same.ID)
}

