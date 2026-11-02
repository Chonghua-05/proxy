package store

import (
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/lab34/llm-proxy/internal/models"
)

type UsageStore struct {
	db *sql.DB
}

func NewUsageStore(db *sql.DB) *UsageStore {
	return &UsageStore{db: db}
}

func (s *UsageStore) Record(apiKeyID, providerID, model string, promptTokens, completionTokens, totalTokens int) error {
	_, err := s.db.Exec(
		`INSERT INTO usage (id, api_key_id, provider_id, model, prompt_tokens, completion_tokens, total_tokens, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		uuid.New().String(), apiKeyID, providerID, model, promptTokens, completionTokens, totalTokens, time.Now().UTC(),
	)
	return err
}

type UsageQuery struct {
	APIKeyID      string
	ProviderID    string
	Start         *time.Time
	End           *time.Time
	Limit         int
	Offset        int
	TimelineRange string // "24h", "7d", "30d", "all"
	Interval      string // "hour", "day"
	TzOffset      int    // minutes offset from UTC (e.g. +480 for UTC+8)
}

type UsageResult struct {
	Records          []models.UsageRecord `json:"records"`
	Total            int                  `json:"total"`
	PromptTokens     int                  `json:"prompt_tokens"`
	CompletionTokens int                  `json:"completion_tokens"`
	TotalTokens      int                  `json:"total_tokens"`
}

func (s *UsageStore) Query(q UsageQuery) (*UsageResult, error) {
	var where []string
	var args []interface{}

	if q.APIKeyID != "" {
		where = append(where, "api_key_id = ?")
		args = append(args, q.APIKeyID)
	}
	if q.ProviderID != "" {
		where = append(where, "provider_id = ?")
		args = append(args, q.ProviderID)
	}
	if q.Start != nil {
		where = append(where, "created_at >= ?")
		args = append(args, *q.Start)
	}
	if q.End != nil {
		where = append(where, "created_at <= ?")
		args = append(args, *q.End)
	}

	whereClause := ""
	if len(where) > 0 {
		whereClause = " WHERE " + strings.Join(where, " AND ")
	}

	// Count total and aggregate token sums across all matching records.
	var total, sumPrompt, sumCompletion, sumTotal int
	countQ := "SELECT COUNT(*), COALESCE(SUM(prompt_tokens),0), COALESCE(SUM(completion_tokens),0), COALESCE(SUM(total_tokens),0) FROM usage" + whereClause
	if err := s.db.QueryRow(countQ, args...).Scan(&total, &sumPrompt, &sumCompletion, &sumTotal); err != nil {
		return nil, fmt.Errorf("count usage: %w", err)
	}

	// Fetch page.
	limit := q.Limit
	if limit <= 0 {
		limit = 100
	}
	dataQ := "SELECT id, api_key_id, provider_id, model, prompt_tokens, completion_tokens, total_tokens, created_at FROM usage" +
		whereClause + " ORDER BY created_at DESC LIMIT ? OFFSET ?"
	dataArgs := append(args, limit, q.Offset)

	rows, err := s.db.Query(dataQ, dataArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []models.UsageRecord
	for rows.Next() {
		var r models.UsageRecord
		if err := rows.Scan(&r.ID, &r.APIKeyID, &r.ProviderID, &r.Model, &r.PromptTokens, &r.CompletionTokens, &r.TotalTokens, &r.CreatedAt); err != nil {
			return nil, err
		}
		records = append(records, r)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return &UsageResult{
		Records:          records,
		Total:            total,
		PromptTokens:     sumPrompt,
		CompletionTokens: sumCompletion,
		TotalTokens:      sumTotal,
	}, nil
}

type TimelinePoint struct {
	Timestamp        string `json:"timestamp"`
	Requests         int    `json:"requests"`
	PromptTokens     int    `json:"prompt_tokens"`
	CompletionTokens int    `json:"completion_tokens"`
	TotalTokens      int    `json:"total_tokens"`
}

type ModelStat struct {
	Model       string `json:"model"`
	Requests    int    `json:"requests"`
	TotalTokens int    `json:"total_tokens"`
}

type KeyStat struct {
	APIKeyID    string `json:"api_key_id"`
	Requests    int    `json:"requests"`
	TotalTokens int    `json:"total_tokens"`
}

type UsageSummary struct {
	TotalRequests    int             `json:"total_requests"`
	TotalPrompt      int             `json:"total_prompt"`
	TotalCompletion  int             `json:"total_completion"`
	TotalTokens      int             `json:"total_tokens"`
	Timeline         []TimelinePoint `json:"timeline"`
	TopModels        []ModelStat     `json:"top_models"`
	TopKeys          []KeyStat       `json:"top_keys"`
}

func (s *UsageStore) GetSummary(q UsageQuery) (*UsageSummary, error) {
	var where []string
	var args []interface{}

	if q.APIKeyID != "" {
		where = append(where, "api_key_id = ?")
		args = append(args, q.APIKeyID)
	}
	if q.ProviderID != "" {
		where = append(where, "provider_id = ?")
		args = append(args, q.ProviderID)
	}
	if q.Start != nil {
		where = append(where, "created_at >= ?")
		args = append(args, *q.Start)
	}
	if q.End != nil {
		where = append(where, "created_at <= ?")
		args = append(args, *q.End)
	}

	whereClause := ""
	if len(where) > 0 {
		whereClause = " WHERE " + strings.Join(where, " AND ")
	}

	// 1. Overall stats
	var total, sumPrompt, sumCompletion, sumTotal int
	countQ := "SELECT COUNT(*), COALESCE(SUM(prompt_tokens),0), COALESCE(SUM(completion_tokens),0), COALESCE(SUM(total_tokens),0) FROM usage" + whereClause
	if err := s.db.QueryRow(countQ, args...).Scan(&total, &sumPrompt, &sumCompletion, &sumTotal); err != nil {
		return nil, fmt.Errorf("summary overall: %w", err)
	}

	// 2. Timeline
	isHour := false
	if q.Interval == "hour" || q.TimelineRange == "24h" {
		isHour = true
	} else if q.Interval == "day" {
		isHour = false
	} else if q.Start != nil && q.End != nil && q.End.Sub(*q.Start) <= 72*time.Hour {
		isHour = true
	} else if q.Start != nil && q.End == nil && time.Since(*q.Start) <= 72*time.Hour {
		isHour = true
	}

	format := "%Y-%m-%d"
	fallbackSubstr := "substr(created_at, 1, 10)"
	if isHour {
		format = "%Y-%m-%d %H:00"
		fallbackSubstr = "substr(created_at, 1, 13) || ':00'"
	}

	modifier := fmt.Sprintf("%+d minutes", q.TzOffset)

	var timelineWhere []string
	var timelineArgs []interface{}
	timelineWhere = append(timelineWhere, where...)
	timelineArgs = append(timelineArgs, args...)

	if q.Start == nil && q.End == nil {
		switch q.TimelineRange {
		case "24h":
			timelineWhere = append(timelineWhere, "created_at >= datetime('now', '-24 hours')")
		case "7d":
			timelineWhere = append(timelineWhere, "created_at >= datetime('now', '-7 days')")
		case "30d":
			timelineWhere = append(timelineWhere, "created_at >= datetime('now', '-30 days')")
		case "all":
			// no bounds
		default:
			if q.TimelineRange == "" {
				timelineWhere = append(timelineWhere, "created_at >= datetime('now', '-7 days')")
			}
		}
	}

	timelineWhereClause := ""
	if len(timelineWhere) > 0 {
		timelineWhereClause = " WHERE " + strings.Join(timelineWhere, " AND ")
	}

	timeQ := fmt.Sprintf(`SELECT COALESCE(strftime('%s', datetime(substr(created_at, 1, 19), ?)), %s) as t,
		COUNT(*), COALESCE(SUM(prompt_tokens),0), COALESCE(SUM(completion_tokens),0), COALESCE(SUM(total_tokens),0)
		FROM usage%s GROUP BY t ORDER BY t ASC`, format, fallbackSubstr, timelineWhereClause)

	queryArgs := append([]interface{}{modifier}, timelineArgs...)
	tRows, err := s.db.Query(timeQ, queryArgs...)
	if err != nil {
		return nil, fmt.Errorf("summary timeline: %w", err)
	}
	defer tRows.Close()

	var timeline []TimelinePoint
	for tRows.Next() {
		var tp TimelinePoint
		if err := tRows.Scan(&tp.Timestamp, &tp.Requests, &tp.PromptTokens, &tp.CompletionTokens, &tp.TotalTokens); err != nil {
			return nil, err
		}
		timeline = append(timeline, tp)
	}

	// 3. By model
	modelQ := `SELECT model, COUNT(*), COALESCE(SUM(total_tokens),0)
		FROM usage ` + whereClause + ` GROUP BY model ORDER BY SUM(total_tokens) DESC LIMIT 10`
	mRows, err := s.db.Query(modelQ, args...)
	if err != nil {
		return nil, fmt.Errorf("summary models: %w", err)
	}
	defer mRows.Close()

	var topModels []ModelStat
	for mRows.Next() {
		var ms ModelStat
		if err := mRows.Scan(&ms.Model, &ms.Requests, &ms.TotalTokens); err != nil {
			return nil, err
		}
		topModels = append(topModels, ms)
	}

	// 4. By key
	keyQ := `SELECT api_key_id, COUNT(*), COALESCE(SUM(total_tokens),0)
		FROM usage ` + whereClause + ` GROUP BY api_key_id ORDER BY SUM(total_tokens) DESC LIMIT 10`
	kRows, err := s.db.Query(keyQ, args...)
	if err != nil {
		return nil, fmt.Errorf("summary keys: %w", err)
	}
	defer kRows.Close()

	var topKeys []KeyStat
	for kRows.Next() {
		var ks KeyStat
		if err := kRows.Scan(&ks.APIKeyID, &ks.Requests, &ks.TotalTokens); err != nil {
			return nil, err
		}
		topKeys = append(topKeys, ks)
	}

	return &UsageSummary{
		TotalRequests:   total,
		TotalPrompt:     sumPrompt,
		TotalCompletion: sumCompletion,
		TotalTokens:     sumTotal,
		Timeline:        timeline,
		TopModels:       topModels,
		TopKeys:         topKeys,
	}, nil
}

