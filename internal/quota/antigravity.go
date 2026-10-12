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

type userQuotaResponse struct {
	Buckets []struct {
		ModelID           string   `json:"modelId"`
		RemainingFraction *float64 `json:"remainingFraction"`
		ResetTime         string   `json:"resetTime"`
	} `json:"buckets"`
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

	// 1. Try querying with existing access token
	respData, err := queryUserQuota(ctx, httpClient, cfg.BaseURL, auth.AccessToken, cfg.Project)
	if err != nil || len(respData.Buckets) == 0 {
		// 2. Refresh token if expired or empty
		newToken, refErr := refreshGoogleToken(ctx, httpClient, auth.ClientID, auth.ClientSecret, auth.RefreshToken)
		if refErr != nil {
			if err != nil {
				return nil, fmt.Errorf("query failed (%v) and refresh failed (%v)", err, refErr)
			}
			return nil, fmt.Errorf("token refresh failed: %w", refErr)
		}
		respData, err = queryUserQuota(ctx, httpClient, cfg.BaseURL, newToken, cfg.Project)
		if err != nil {
			return nil, fmt.Errorf("query quota after refresh: %w", err)
		}
	}

	cstLoc := time.FixedZone("CST", 8*3600)
	var buckets []Bucket
	minFraction := 1.0

	for _, b := range respData.Buckets {
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
			ModelID:           b.ModelID,
			RemainingFraction: b.RemainingFraction,
			RemainingPercent:  pct,
			ResetTime:         resetT,
			ResetTimeFormatted: resetFmt,
		})
	}

	// Sort buckets by remaining fraction ascending (lowest quota first)
	sort.Slice(buckets, func(i, j int) bool {
		f1 := 999.0
		if buckets[i].RemainingFraction != nil {
			f1 = *buckets[i].RemainingFraction
		}
		f2 := 999.0
		if buckets[j].RemainingFraction != nil {
			f2 = *buckets[j].RemainingFraction
		}
		return f1 < f2
	})

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
