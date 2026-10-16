package quota

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/lab34/llm-proxy/internal/models"
)



type AntigravityDriver struct{}

func (d *AntigravityDriver) Type() string {
	return "antigravity"
}

type antigravityConfig struct {
	AuthFile string `json:"auth_file"`
	ProxyURL string `json:"proxy_url"`
	Project  string `json:"project"`
	BaseURL  string `json:"base_url"`
}

type antigravityAuthJSON struct {
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	RefreshToken string `json:"refresh_token"`
	AccessToken  string `json:"access_token"`
	Email        string `json:"email"`
}

type userQuotaSummaryResponse struct {
	Groups []struct {
		DisplayName string `json:"displayName"`
		Description string `json:"description"`
		Buckets     []struct {
			BucketID          string   `json:"bucketId"`
			DisplayName       string   `json:"displayName"`
			Window            string   `json:"window"`
			ResetTime         string   `json:"resetTime"`
			Description       string   `json:"description"`
			RemainingFraction *float64 `json:"remainingFraction"`
		} `json:"buckets"`
	} `json:"groups"`
}

type userQuotaResponse struct {
	Buckets []struct {
		ModelID           string   `json:"modelId"`
		RemainingFraction *float64 `json:"remainingFraction"`
		ResetTime         string   `json:"resetTime"`
	} `json:"buckets"`
}

var (
	geminiGroupModels = []string{
		"gemini-3.8-flash-high",
		"gemini-3.8-flash-medium",
		"gemini-3.8-flash-low",
		"gemini-3.8-flash-tiered",
		"gemini-3.7-flash-high",
		"gemini-3.7-flash-medium",
		"gemini-3.7-flash-low",
		"gemini-3.6-flash-high",
		"gemini-3.6-flash-medium",
		"gemini-3.6-flash-low",
		"gemini-3.5-flash-lite",
		"gemini-3.5-flash-low",
		"gemini-3.5-flash-extra-low",
		"gemini-3.1-pro-high",
		"gemini-3.1-pro-low",
		"gemini-3.1-flash-lite",
		"gemini-3.1-flash-image",
		"gemini-3-flash",
		"gemini-3-flash-agent",
		"gemini-2.5-pro",
		"gemini-2.5-flash",
		"gemini-2.5-flash-lite",
		"gemini-2.5-flash-thinking",
		"gemini-pro-agent",
	}

	claudeGPTGroupModels = []string{
		"claude-opus-4-6-thinking",
		"claude-sonnet-4-6",
		"gpt-oss-120b-medium",
	}
)

func (d *AntigravityDriver) Fetch(ctx context.Context, p *models.Provider) (*Result, error) {
	var cfg antigravityConfig
	if p.QuotaConfig != "" {
		_ = json.Unmarshal([]byte(p.QuotaConfig), &cfg)
	}
	if cfg.Project == "" {
		cfg.Project = "aicode-consumers"
	}

	authPath := cfg.AuthFile
	if authPath == "" {
		matches, _ := filepath.Glob("/root/.cli-proxy-api/antigravity-*.json")
		if len(matches) > 0 {
			sort.Strings(matches)
			authPath = matches[0]
		}
	}
	if authPath == "" {
		return nil, fmt.Errorf("no antigravity auth file found")
	}

	raw, err := os.ReadFile(authPath)
	if err != nil {
		return nil, fmt.Errorf("read auth file: %w", err)
	}

	var auth antigravityAuthJSON
	if err := json.Unmarshal(raw, &auth); err != nil {
		return nil, fmt.Errorf("parse auth file: %w", err)
	}

	clientID := auth.ClientID
	if clientID == "" {
		clientID = os.Getenv("ANTIGRAVITY_CLIENT_ID")
	}

	clientSecret := auth.ClientSecret
	if clientSecret == "" {
		clientSecret = os.Getenv("ANTIGRAVITY_CLIENT_SECRET")
	}

	httpClient := &http.Client{Timeout: 30 * time.Second}
	proxyURLStr := cfg.ProxyURL
	if proxyURLStr == "" {
		if env := os.Getenv("ANTIGRAVITY_PROXY_URL"); env != "" {
			proxyURLStr = env
		} else {
			proxyURLStr = "socks5://127.0.0.1:1081"
		}
	}
	if proxyURLStr != "" && proxyURLStr != "direct" && proxyURLStr != "none" {
		u, err := url.Parse(proxyURLStr)
		if err == nil {
			httpClient.Transport = &http.Transport{
				Proxy: http.ProxyURL(u),
			}
		}
	}

	// 1. Try querying summary with existing access token
	curToken := auth.AccessToken
	summaryData, sErr := queryUserQuotaSummary(ctx, httpClient, cfg.BaseURL, curToken, cfg.Project)
	if isAuthError(sErr) {
		// Token expired or invalid, refresh it
		newToken, refErr := refreshGoogleToken(ctx, httpClient, clientID, clientSecret, auth.RefreshToken)
		if refErr == nil && newToken != "" {
			curToken = newToken
			summaryData, sErr = queryUserQuotaSummary(ctx, httpClient, cfg.BaseURL, curToken, cfg.Project)
		}
	}

	cstLoc := time.FixedZone("CST", 8*3600)
	var buckets []Bucket
	minFraction := 1.0

	// If retrieveUserQuotaSummary succeeded, construct clean categorized buckets
	if sErr == nil && summaryData != nil && len(summaryData.Groups) > 0 {
		for _, g := range summaryData.Groups {
			isGemini := strings.Contains(strings.ToLower(g.DisplayName), "gemini")
			groupLabel := "Claude/GPT"
			modelsList := claudeGPTGroupModels
			if isGemini {
				groupLabel = "Gemini"
				modelsList = geminiGroupModels
			}

			// Sort buckets inside each group so 5h is first (left), weekly is second (right)
			sort.SliceStable(g.Buckets, func(i, j int) bool {
				b1 := g.Buckets[i]
				b2 := g.Buckets[j]
				is5h1 := b1.Window == "5h" || strings.Contains(b1.BucketID, "5h")
				is5h2 := b2.Window == "5h" || strings.Contains(b2.BucketID, "5h")
				if is5h1 && !is5h2 {
					return true
				}
				return false
			})

			for _, b := range g.Buckets {
				var pct *float64
				if b.RemainingFraction != nil {
					v := *b.RemainingFraction * 100
					pct = &v
					if *b.RemainingFraction < minFraction {
						minFraction = *b.RemainingFraction
					}
				}

				var resetT *time.Time
				var resetFmt string
				if b.ResetTime != "" {
					t, err := time.Parse(time.RFC3339, b.ResetTime)
					if err == nil {
						resetT = &t
						resetFmt = t.In(cstLoc).Format("01-02 15:04")
					} else {
						resetFmt = b.ResetTime
					}
				}

				dispName := fmt.Sprintf("%s 额度", groupLabel)
				if b.Window == "weekly" || strings.Contains(b.BucketID, "weekly") {
					dispName = fmt.Sprintf("%s 周限额", groupLabel)
				} else if b.Window == "5h" || strings.Contains(b.BucketID, "5h") {
					dispName = fmt.Sprintf("%s 5小时额度", groupLabel)
				}

				buckets = append(buckets, Bucket{
					ModelID:            b.BucketID,
					DisplayName:        dispName,
					GroupName:          groupLabel,
					Window:             b.Window,
					Models:             modelsList,
					RemainingFraction:  b.RemainingFraction,
					RemainingPercent:   pct,
					ResetTime:          resetT,
					ResetTimeFormatted: resetFmt,
				})
			}
		}
	} else {
		// Fallback to legacy retrieveUserQuota if summary endpoint is totally unavailable
		legacyData, lErr := queryUserQuota(ctx, httpClient, cfg.BaseURL, curToken, cfg.Project)
		if isAuthError(lErr) {
			newToken, refErr := refreshGoogleToken(ctx, httpClient, clientID, clientSecret, auth.RefreshToken)
			if refErr == nil && newToken != "" {
				curToken = newToken
				legacyData, lErr = queryUserQuota(ctx, httpClient, cfg.BaseURL, curToken, cfg.Project)
			}
		}
		if lErr != nil {
			return nil, fmt.Errorf("fetch quota failed: summary: %v, legacy: %v", sErr, lErr)
		}
		for _, b := range legacyData.Buckets {
			var pct *float64
			if b.RemainingFraction != nil {
				v := *b.RemainingFraction * 100
				pct = &v
				if *b.RemainingFraction < minFraction {
					minFraction = *b.RemainingFraction
				}
			}

			var resetT *time.Time
			var resetFmt string
			if b.ResetTime != "" {
				t, err := time.Parse(time.RFC3339, b.ResetTime)
				if err == nil {
					resetT = &t
					resetFmt = t.In(cstLoc).Format("01-02 15:04")
				} else {
					resetFmt = b.ResetTime
				}
			}

			buckets = append(buckets, Bucket{
				ModelID:            b.ModelID,
				DisplayName:        b.ModelID,
				RemainingFraction:  b.RemainingFraction,
				RemainingPercent:   pct,
				ResetTime:          resetT,
				ResetTimeFormatted: resetFmt,
			})
		}
	}

	status := "ok"
	if minFraction < 0.2 {
		status = "warning"
	}
	if minFraction == 0.0 {
		status = "exhausted"
	}

	return &Result{
		Account:   auth.Email,
		Status:    status,
		Buckets:   buckets,
		UpdatedAt: time.Now().UTC(),
	}, nil
}

func queryUserQuotaSummary(ctx context.Context, client *http.Client, baseURL, token, project string) (*userQuotaSummaryResponse, error) {
	if token == "" {
		return nil, fmt.Errorf("empty access token")
	}
	if baseURL == "" {
		baseURL = "https://cloudcode-pa.googleapis.com"
	}
	endpoint := strings.TrimRight(baseURL, "/") + "/v1internal:retrieveUserQuotaSummary"
	payload, _ := json.Marshal(map[string]string{"project": project})
	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		endpoint,
		bytes.NewReader(payload),
	)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "antigravity/2.21.1 linux/amd64")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("status %d: %s", resp.StatusCode, string(b))
	}

	var data userQuotaSummaryResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}
	return &data, nil
}

func queryUserQuota(ctx context.Context, client *http.Client, baseURL, token, project string) (*userQuotaResponse, error) {
	if token == "" {
		return nil, fmt.Errorf("empty access token")
	}
	if baseURL == "" {
		baseURL = "https://cloudcode-pa.googleapis.com"
	}
	endpoint := strings.TrimRight(baseURL, "/") + "/v1internal:retrieveUserQuota"
	payload, _ := json.Marshal(map[string]string{"project": project})
	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		endpoint,
		bytes.NewReader(payload),
	)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "antigravity/2.21.1 linux/amd64")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("status %d: %s", resp.StatusCode, string(b))
	}

	var data userQuotaResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}
	return &data, nil
}

func refreshGoogleToken(ctx context.Context, client *http.Client, clientID, clientSecret, refreshToken string) (string, error) {
	data := url.Values{}
	data.Set("client_id", clientID)
	data.Set("client_secret", clientSecret)
	data.Set("refresh_token", refreshToken)
	data.Set("grant_type", "refresh_token")

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		"https://oauth2.googleapis.com/token",
		strings.NewReader(data.Encode()),
	)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var res struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
		Description string `json:"error_description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", err
	}
	if res.AccessToken == "" {
		return "", fmt.Errorf("oauth error: %s (%s)", res.Error, res.Description)
	}
	return res.AccessToken, nil
}

func isAuthError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "status 401") || strings.Contains(msg, "unauthenticated") || strings.Contains(msg, "empty access token")
}
