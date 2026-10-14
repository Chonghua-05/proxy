package db

import "database/sql"

// migrate runs all schema migrations in order. Idempotent.
func migrate(db *sql.DB) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS providers (
			id           TEXT PRIMARY KEY,
			name         TEXT NOT NULL UNIQUE,
			base_url     TEXT NOT NULL,
			api_key      TEXT NOT NULL,
			quota_type   TEXT NOT NULL DEFAULT 'none',
			quota_config TEXT NOT NULL DEFAULT '',
			created_at   DATETIME NOT NULL DEFAULT (datetime('now')),
			updated_at   DATETIME NOT NULL DEFAULT (datetime('now'))
		)`,

		`CREATE TABLE IF NOT EXISTS api_keys (
			id             TEXT PRIMARY KEY,
			name           TEXT NOT NULL,
			key_hash       TEXT NOT NULL UNIQUE,
			provider_id    TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
			rate_limit_rpm INTEGER NOT NULL DEFAULT 0,
			created_at     DATETIME NOT NULL DEFAULT (datetime('now')),
			revoked_at     DATETIME
		)`,

		`CREATE TABLE IF NOT EXISTS usage (
			id                TEXT PRIMARY KEY,
			api_key_id        TEXT NOT NULL REFERENCES api_keys(id),
			provider_id       TEXT NOT NULL REFERENCES providers(id),
			model             TEXT NOT NULL,
			prompt_tokens     INTEGER NOT NULL DEFAULT 0,
			completion_tokens INTEGER NOT NULL DEFAULT 0,
			total_tokens      INTEGER NOT NULL DEFAULT 0,
			created_at        DATETIME NOT NULL DEFAULT (datetime('now'))
		)`,

		`CREATE INDEX IF NOT EXISTS idx_usage_api_key_id ON usage(api_key_id)`,
		`CREATE INDEX IF NOT EXISTS idx_usage_provider_id ON usage(provider_id)`,
		`CREATE INDEX IF NOT EXISTS idx_usage_created_at ON usage(created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash)`,

		`CREATE TABLE IF NOT EXISTS guardrails (
			id         TEXT PRIMARY KEY,
			pattern    TEXT NOT NULL,
			mode       TEXT NOT NULL CHECK(mode IN ('reject','replace')),
			replace_by TEXT NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL DEFAULT (datetime('now')),
			updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
		)`,

		`CREATE TABLE IF NOT EXISTS guardrail_events (
			id           TEXT PRIMARY KEY,
			guardrail_id TEXT NOT NULL REFERENCES guardrails(id) ON DELETE CASCADE,
			api_key_id   TEXT NOT NULL REFERENCES api_keys(id),
			pattern      TEXT NOT NULL,
			mode         TEXT NOT NULL,
			input_text   TEXT NOT NULL,
			created_at   DATETIME NOT NULL DEFAULT (datetime('now'))
		)`,

		`CREATE INDEX IF NOT EXISTS idx_guardrail_events_guardrail_id ON guardrail_events(guardrail_id)`,
		`CREATE INDEX IF NOT EXISTS idx_guardrail_events_api_key_id ON guardrail_events(api_key_id)`,
		`CREATE INDEX IF NOT EXISTS idx_guardrail_events_created_at ON guardrail_events(created_at)`,
	}

	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			return err
		}
	}

	// Migration: add ON DELETE CASCADE to usage and guardrail_events foreign keys.
	// SQLite does not support ALTER TABLE to modify FK constraints, so we
	// recreate the tables. We use marker tables to make this idempotent.
	if err := migrateUsageCascade(db); err != nil {
		return err
	}
	if err := migrateGuardrailEventsCascade(db); err != nil {
		return err
	}
	if err := migrateProviderQuota(db); err != nil {
		return err
	}
	if err := migrateAPIKeyAllowedProviders(db); err != nil {
		return err
	}

	return nil
}

// migrateAPIKeyAllowedProviders adds allowed_providers column to api_keys if it does not exist.
func migrateAPIKeyAllowedProviders(db *sql.DB) error {
	rows, err := db.Query(`PRAGMA table_info(api_keys)`)
	if err != nil {
		return err
	}
	defer rows.Close()

	hasCol := false
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull, pk int
		var dfltValue interface{}
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dfltValue, &pk); err != nil {
			return err
		}
		if name == "allowed_providers" {
			hasCol = true
			break
		}
	}

	if !hasCol {
		if _, err := db.Exec(`ALTER TABLE api_keys ADD COLUMN allowed_providers TEXT NOT NULL DEFAULT ''`); err != nil {
			return err
		}
	}
	return nil
}

// migrateProviderQuota adds quota_type and quota_config columns to providers if they do not exist.
func migrateProviderQuota(db *sql.DB) error {
	rows, err := db.Query(`PRAGMA table_info(providers)`)
	if err != nil {
		return err
	}
	defer rows.Close()

	hasQuotaType := false
	hasQuotaConfig := false
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull, pk int
		var dfltValue interface{}
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dfltValue, &pk); err != nil {
			return err
		}
		if name == "quota_type" {
			hasQuotaType = true
		}
		if name == "quota_config" {
			hasQuotaConfig = true
		}
	}

	if !hasQuotaType {
		if _, err := db.Exec(`ALTER TABLE providers ADD COLUMN quota_type TEXT NOT NULL DEFAULT 'none'`); err != nil {
			return err
		}
	}
	if !hasQuotaConfig {
		if _, err := db.Exec(`ALTER TABLE providers ADD COLUMN quota_config TEXT NOT NULL DEFAULT ''`); err != nil {
			return err
		}
	}
	return nil
}

// migrateUsageCascade recreates the usage table with ON DELETE CASCADE on both
// api_key_id and provider_id foreign keys. Idempotent via a marker table.
func migrateUsageCascade(db *sql.DB) error {
	var n int
	err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='_migration_usage_cascade_v1'`).Scan(&n)
	if err != nil {
		return err
	}
	if n > 0 {
		return nil // already applied
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmts := []string{
		`CREATE TABLE usage_new (
			id                TEXT PRIMARY KEY,
			api_key_id        TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
			provider_id       TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
			model             TEXT NOT NULL,
			prompt_tokens     INTEGER NOT NULL DEFAULT 0,
			completion_tokens INTEGER NOT NULL DEFAULT 0,
			total_tokens      INTEGER NOT NULL DEFAULT 0,
			created_at        DATETIME NOT NULL DEFAULT (datetime('now'))
		)`,
		`INSERT INTO usage_new SELECT * FROM usage`,
		`DROP TABLE usage`,
		`ALTER TABLE usage_new RENAME TO usage`,
		`CREATE INDEX IF NOT EXISTS idx_usage_api_key_id ON usage(api_key_id)`,
		`CREATE INDEX IF NOT EXISTS idx_usage_provider_id ON usage(provider_id)`,
		`CREATE INDEX IF NOT EXISTS idx_usage_created_at ON usage(created_at)`,
		`CREATE TABLE _migration_usage_cascade_v1 (applied_at DATETIME NOT NULL DEFAULT (datetime('now')))`,
		`INSERT INTO _migration_usage_cascade_v1 DEFAULT VALUES`,
	}

	for _, s := range stmts {
		if _, err := tx.Exec(s); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// migrateGuardrailEventsCascade recreates the guardrail_events table with
// ON DELETE CASCADE on api_key_id. Idempotent via a marker table.
func migrateGuardrailEventsCascade(db *sql.DB) error {
	var n int
	err := db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='_migration_guardrail_events_cascade_v1'`).Scan(&n)
	if err != nil {
		return err
	}
	if n > 0 {
		return nil // already applied
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmts := []string{
		`CREATE TABLE guardrail_events_new (
			id           TEXT PRIMARY KEY,
			guardrail_id TEXT NOT NULL REFERENCES guardrails(id) ON DELETE CASCADE,
			api_key_id   TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
			pattern      TEXT NOT NULL,
			mode         TEXT NOT NULL,
			input_text   TEXT NOT NULL,
			created_at   DATETIME NOT NULL DEFAULT (datetime('now'))
		)`,
		`INSERT INTO guardrail_events_new SELECT * FROM guardrail_events`,
		`DROP TABLE guardrail_events`,
		`ALTER TABLE guardrail_events_new RENAME TO guardrail_events`,
		`CREATE INDEX IF NOT EXISTS idx_guardrail_events_guardrail_id ON guardrail_events(guardrail_id)`,
		`CREATE INDEX IF NOT EXISTS idx_guardrail_events_api_key_id ON guardrail_events(api_key_id)`,
		`CREATE INDEX IF NOT EXISTS idx_guardrail_events_created_at ON guardrail_events(created_at)`,
		`CREATE TABLE _migration_guardrail_events_cascade_v1 (applied_at DATETIME NOT NULL DEFAULT (datetime('now')))`,
		`INSERT INTO _migration_guardrail_events_cascade_v1 DEFAULT VALUES`,
	}

	for _, s := range stmts {
		if _, err := tx.Exec(s); err != nil {
			return err
		}
	}

	return tx.Commit()
}
