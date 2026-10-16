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
	"sync"
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
	// Only the models actually served through cli-proxy-api are listed. Older
	// ids (3.7/3.6 flash, 3.1-pro, 2.5-*, pro-agent, effort aliases) were
	// retired upstream and now answer "unknown provider for model", so they are
	// deliberately omitted to keep the quota dialog aligned with reality.
	geminiGroupModels = []string{
		"gemini-3.8-flash-high",
		"gemini-3-flash",
		"gemini-3.5-flash-lite",
		"gemini-3.1-flash-lite",
		"gemini-3.1-flash-image",
	}

	claudeGPTGroupModels = []string{
		"claude-opus-4-6-thinking",
		"claude-sonnet-4-6",
		"gpt-oss-120b-medium",
	}
)

// antigravityQuotaHosts lists the Cloud Code Assist environments in preference
// order. Google binds personal ("personal_consumer", gcpManaged=false) accounts to
// the daily host, which is where their usage is accounted; enterprise/PayGo
// accounts are accounted on production. A host whose response carries no Gemini
// group is skipped, so an account bound either way resolves to the ledger that
// actually moves.
var antigravityQuotaHosts = []string{
	"https://daily-cloudcode-pa.googleapis.com",
	"https://daily-cloudcode-pa.sandbox.googleapis.com",
	"https://cloudcode-pa.googleapis.com",
}

var (
	httpClientMu sync.Mutex
	httpClients  = make(map[string]*http.Client)
)

// sharedHTTPClient caches one client per proxy URL so repeated refreshes reuse the
// pooled connections. Building a fresh transport every call redoes the SOCKS+TLS
// handshake, which measured 1.1-6.0s through the US exit.
func sharedHTTPClient(proxyURL string) *http.Client {
	httpClientMu.Lock()
	defer httpClientMu.Unlock()
	if c, ok := httpClients[proxyURL]; ok {
		return c
	}
	c := &http.Client{Timeout: 30 * time.Second}
	if proxyURL != "" && proxyURL != "direct" && proxyURL != "none" {
		if u, err := url.Parse(proxyURL); err == nil {
			c.Transport = &http.Transport{
				Proxy:               http.ProxyURL(u),
				MaxIdleConns:        8,
				IdleConnTimeout:     90 * time.Second,
				TLSHandshakeTimeout: 20 * time.Second,
			}
		}
	}
	httpClients[proxyURL] = c
	return c
}

func resolveProxyURL(configured string) string {
	if configured != "" {
		return configured
	}
	if env := os.Getenv("ANTIGRAVITY_PROXY_URL"); env != "" {
		return env
	}
	return "socks5://127.0.0.1:1081"
}

// queryQuotaSummary walks the candidate hosts and returns the first response that
// reports the Gemini group, falling back to the first valid response when none does.
func queryQuotaSummary(ctx context.Context, client *http.Client, hosts []string, token, project string) (*userQuotaSummaryResponse, error) {
	var firstValid *userQuotaSummaryResponse
	var lastErr error
	for _, host := range hosts {
		data, err := queryUserQuotaSummary(ctx, client, host, token, project)
		if err != nil {
			lastErr = err
			continue
		}
		if firstValid == nil {
			firstValid = data
		}
		if hasGeminiGroup(data) {
			return data, nil
		}
	}
	if firstValid != nil {
		return firstValid, nil
	}
	return nil, lastErr
}

func hasGeminiGroup(resp *userQuotaSummaryResponse) bool {
	if resp == nil {
		return false
	}
	for _, g := range resp.Groups {
		if len(g.Buckets) > 0 && strings.Contains(strings.ToLower(g.DisplayName), "gemini") {
			return true
		}
	}
	return false
}

func queryQuotaLegacy(ctx context.Context, client *http.Client, hosts []string, token, project string) (*userQuotaResponse, error) {
	var lastErr error
	for _, host := range hosts {
		data, err := queryUserQuota(ctx, client, host, token, project)
		if err == nil && len(data.Buckets) > 0 {
			return data, nil
		}
		if err == nil {
			err = fmt.Errorf("%s returned no buckets", host)
		}
		lastErr = err
	}
	return nil, lastErr
}

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

	httpClient := sharedHTTPClient(resolveProxyURL(cfg.ProxyURL))

	hosts := antigravityQuotaHosts
	if cfg.BaseURL != "" {
		hosts = []string{cfg.BaseURL}
	}

	// 1. Try querying summary with existing access token
	curToken := auth.AccessToken
	summaryData, sErr := queryQuotaSummary(ctx, httpClient, hosts, curToken, cfg.Project)
	if isAuthError(sErr) {
		// Token expired or invalid, refresh it
		newToken, refErr := refreshGoogleToken(ctx, httpClient, clientID, clientSecret, auth.RefreshToken)
		if refErr == nil && newToken != "" {
			curToken = newToken
			summaryData, sErr = queryQuotaSummary(ctx, httpClient, hosts, curToken, cfg.Project)
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
		legacyData, lErr := queryQuotaLegacy(ctx, httpClient, hosts, curToken, cfg.Project)
		if isAuthError(lErr) {
			newToken, refErr := refreshGoogleToken(ctx, httpClient, clientID, clientSecret, auth.RefreshToken)
			if refErr == nil && newToken != "" {
				curToken = newToken
				legacyData, lErr = queryQuotaLegacy(ctx, httpClient, hosts, curToken, cfg.Project)
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
