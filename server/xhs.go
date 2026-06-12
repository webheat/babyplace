package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ============================================================
// XHS Config & Token
// ============================================================

var (
	xhsAppID     string
	xhsAppSecret string
	xhsRedirectURI string
	xhsTokenFile string
)

type XHSToken struct {
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token"`
	OpenID       string    `json:"openid"`
	ExpiresAt    time.Time `json:"expires_at"`
	Scope        string    `json:"scope"`
}

type XHSAPIResponse struct {
	Code   int             `json:"code"`
	Msg    string          `json:"msg"`
	Data   json.RawMessage `json:"data"`
}

// ============================================================
// Init
// ============================================================

func initXHS() {
	xhsAppID = os.Getenv("XHS_APP_ID")
	xhsAppSecret = os.Getenv("XHS_APP_SECRET")
	xhsRedirectURI = os.Getenv("XHS_REDIRECT_URI")
	xhsTokenFile = filepath.Join(".", ".xhs-token.json")

	if xhsAppID == "" || xhsAppSecret == "" {
		log.Println("[XHS] 未配置 XHS_APP_ID 或 XHS_APP_SECRET，小红书功能不可用")
		return
	}
	log.Printf("[XHS] 已加载配置 (app_id=%s...)", xhsAppID[:8])
}

// ============================================================
// Token 持久化
// ============================================================

func loadXHSToken() *XHSToken {
	data, err := os.ReadFile(xhsTokenFile)
	if err != nil {
		return nil
	}
	var token XHSToken
	if err := json.Unmarshal(data, &token); err != nil {
		return nil
	}
	return &token
}

func saveXHSToken(token *XHSToken) error {
	data, err := json.MarshalIndent(token, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(xhsTokenFile, data, 0600)
}

func isXHSTokenValid(token *XHSToken) bool {
	if token == nil || token.AccessToken == "" {
		return false
	}
	return time.Now().Before(token.ExpiresAt)
}

// ============================================================
// Handlers
// ============================================================

// GET /api/xhs/status - 检查 XHS 是否已配置且已授权
func handleXHSStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]interface{}{
			"status":  "error",
			"message": "Method not allowed",
		})
		return
	}

	configured := xhsAppID != "" && xhsAppSecret != ""
	token := loadXHSToken()
	authorized := isXHSTokenValid(token)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":     "ok",
		"configured": configured,
		"authorized": authorized,
	})
}

// GET /api/xhs/auth - 返回小红书 OAuth 授权 URL
func handleXHSAuth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]interface{}{
			"status":  "error",
			"message": "Method not allowed",
		})
		return
	}

	if xhsAppID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{
			"status":  "error",
			"message": "小红书 API 未配置",
		})
		return
	}

	// 小红书 OAuth 2.0 授权 URL
	authURL := fmt.Sprintf(
		"https://ark.xiaohongshu.com/ark/open_api/v0/auth?app_id=%s&redirect_uri=%s&scope=video_upload+note_publish&response_type=code&state=babyplace",
		xhsAppID,
		xhsRedirectURI,
	)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":   "ok",
		"auth_url": authURL,
	})
}

// GET /api/xhs/callback?code=xxx - OAuth 回调，用 code 换 token
func handleXHSCallback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]interface{}{
			"status":  "error",
			"message": "Method not allowed",
		})
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{
			"status":  "error",
			"message": "缺少 authorization code",
		})
		return
	}

	// 用 code 换 access_token
	token, err := xhsExchangeCode(code)
	if err != nil {
		log.Printf("[XHS] 换取 token 失败: %v", err)
		writeJSON(w, http.StatusBadGateway, map[string]interface{}{
			"status":  "error",
			"message": fmt.Sprintf("换取 token 失败: %v", err),
		})
		return
	}

	// 保存 token
	if err := saveXHSToken(token); err != nil {
		log.Printf("[XHS] 保存 token 失败: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]interface{}{
			"status":  "error",
			"message": "保存 token 失败",
		})
		return
	}

	log.Printf("[XHS] 授权成功 (openid=%s)", token.OpenID)

	// 返回成功页面（可选：重定向到小程序页面）
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `<!DOCTYPE html>
<html><head><title>授权成功</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5;}
.card{background:#fff;padding:40px;border-radius:16px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,0.1);}
h1{color:#10b981;font-size:24px;}p{color:#6b7280;margin-top:12px;}</style>
</head><body><div class="card"><h1>✅ 小红书授权成功</h1><p>可以关闭此页面，返回小程序发布视频</p></div></body></html>`)
}

// POST /api/xhs/publish - 发布视频笔记
func handleXHSPublish(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]interface{}{
			"status":  "error",
			"message": "Method not allowed",
		})
		return
	}

	// 检查 token
	token := loadXHSToken()
	if !isXHSTokenValid(token) {
		writeJSON(w, http.StatusUnauthorized, map[string]interface{}{
			"status":  "error",
			"message": "小红书未授权，请先完成授权",
		})
		return
	}

	// 解析请求
	var req struct {
		VideoURL string   `json:"videoUrl"`
		Title    string   `json:"title"`
		Content  string   `json:"content"`
		Tags     []string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{
			"status":  "error",
			"message": "Invalid request body",
		})
		return
	}

	req.VideoURL = strings.TrimSpace(req.VideoURL)
	req.Title = strings.TrimSpace(req.Title)
	req.Content = strings.TrimSpace(req.Content)

	if req.VideoURL == "" {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{
			"status":  "error",
			"message": "videoUrl is required",
		})
		return
	}
	if req.Title == "" {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{
			"status":  "error",
			"message": "title is required",
		})
		return
	}

	// Step 1: 下载视频到临时文件
	log.Printf("[XHS] 下载视频: %s", req.VideoURL)
	tmpFile, err := downloadToTemp(req.VideoURL)
	if err != nil {
		log.Printf("[XHS] 下载视频失败: %v", err)
		writeJSON(w, http.StatusBadGateway, map[string]interface{}{
			"status":  "error",
			"message": fmt.Sprintf("下载视频失败: %v", err),
		})
		return
	}
	defer os.Remove(tmpFile)

	// Step 2: 上传视频到小红书
	log.Printf("[XHS] 上传视频到小红书...")
	videoID, err := xhsUploadVideo(token.AccessToken, tmpFile)
	if err != nil {
		log.Printf("[XHS] 上传视频失败: %v", err)
		writeJSON(w, http.StatusBadGateway, map[string]interface{}{
			"status":  "error",
			"message": fmt.Sprintf("上传视频失败: %v", err),
		})
		return
	}
	log.Printf("[XHS] 视频上传成功 (video_id=%s)", videoID)

	// Step 3: 创建视频笔记
	log.Printf("[XHS] 创建笔记...")
	noteID, err := xhsCreateNote(token.AccessToken, videoID, req.Title, req.Content, req.Tags)
	if err != nil {
		log.Printf("[XHS] 创建笔记失败: %v", err)
		writeJSON(w, http.StatusBadGateway, map[string]interface{}{
			"status":  "error",
			"message": fmt.Sprintf("创建笔记失败: %v", err),
		})
		return
	}
	log.Printf("[XHS] 笔记创建成功 (note_id=%s)", noteID)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":  "ok",
		"message": "发布成功",
		"data": map[string]string{
			"note_id":  noteID,
			"video_id": videoID,
		},
	})
}

// ============================================================
// XHS API 调用
// ============================================================

// 用 authorization code 换取 access_token
func xhsExchangeCode(code string) (*XHSToken, error) {
	payload := map[string]string{
		"app_id":      xhsAppID,
		"app_secret":  xhsAppSecret,
		"code":        code,
		"grant_type":  "authorization_code",
		"redirect_uri": xhsRedirectURI,
	}

	body, _ := json.Marshal(payload)
	resp, err := http.Post(
		"https://ark.xiaohongshu.com/ark/open_api/v0/token",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, fmt.Errorf("请求 token 接口失败: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	var apiResp struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
			OpenID       string `json:"open_id"`
			ExpiresIn    int    `json:"expires_in"`
			Scope        string `json:"scope"`
		} `json:"data"`
	}

	if err := json.Unmarshal(respBody, &apiResp); err != nil {
		return nil, fmt.Errorf("解析 token 响应失败: %w", err)
	}

	if apiResp.Code != 0 {
		return nil, fmt.Errorf("XHS API 错误: %s (code=%d)", apiResp.Msg, apiResp.Code)
	}

	expiresIn := apiResp.Data.ExpiresIn
	if expiresIn <= 0 {
		expiresIn = 7200 // 默认 2 小时
	}

	return &XHSToken{
		AccessToken:  apiResp.Data.AccessToken,
		RefreshToken: apiResp.Data.RefreshToken,
		OpenID:       apiResp.Data.OpenID,
		ExpiresAt:    time.Now().Add(time.Duration(expiresIn) * time.Second),
		Scope:        apiResp.Data.Scope,
	}, nil
}

// 上传视频到小红书，返回 video_id
func xhsUploadVideo(accessToken, filePath string) (string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return "", fmt.Errorf("打开文件失败: %w", err)
	}
	defer file.Close()

	// 获取文件信息
	fileInfo, _ := file.Stat()

	// 构建 multipart 请求
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	// 添加 video 文件
	part, err := writer.CreateFormFile("video", filepath.Base(filePath))
	if err != nil {
		return "", fmt.Errorf("创建 form 文件失败: %w", err)
	}
	if _, err := io.Copy(part, file); err != nil {
		return "", fmt.Errorf("写入文件内容失败: %w", err)
	}

	writer.Close()

	req, err := http.NewRequest(
		"POST",
		"https://ark.xiaohongshu.com/ark/open_api/v0/video/upload",
		&buf,
	)
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %w", err)
	}

	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+accessToken)

	log.Printf("[XHS] 上传视频文件 (%d bytes)...", fileInfo.Size())

	client := &http.Client{Timeout: 300 * time.Second} // 视频上传可能较慢
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("上传请求失败: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	var apiResp struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			VideoID string `json:"video_id"`
		} `json:"data"`
	}

	if err := json.Unmarshal(respBody, &apiResp); err != nil {
		return "", fmt.Errorf("解析上传响应失败: %w (body=%s)", err, string(respBody))
	}

	if apiResp.Code != 0 {
		return "", fmt.Errorf("XHS 上传错误: %s (code=%d)", apiResp.Msg, apiResp.Code)
	}

	return apiResp.Data.VideoID, nil
}

// 创建视频笔记，返回 note_id
func xhsCreateNote(accessToken, videoID, title, content string, tags []string) (string, error) {
	// 构建笔记内容，附加话题标签
	noteContent := content
	if len(tags) > 0 {
		for _, tag := range tags {
			noteContent += " #" + tag
		}
	}

	payload := map[string]interface{}{
		"video_id": videoID,
		"title":    title,
		"content":  noteContent,
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequest(
		"POST",
		"https://ark.xiaohongshu.com/ark/open_api/v0/note/publish",
		bytes.NewReader(body),
	)
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+accessToken)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("发布请求失败: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	var apiResp struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			NoteID string `json:"note_id"`
			Status string `json:"status"`
		} `json:"data"`
	}

	if err := json.Unmarshal(respBody, &apiResp); err != nil {
		return "", fmt.Errorf("解析发布响应失败: %w (body=%s)", err, string(respBody))
	}

	if apiResp.Code != 0 {
		return "", fmt.Errorf("XHS 发布错误: %s (code=%d)", apiResp.Msg, apiResp.Code)
	}

	return apiResp.Data.NoteID, nil
}

// ============================================================
// 工具函数
// ============================================================

// 下载远程文件到临时目录
func downloadToTemp(url string) (string, error) {
	resp, err := http.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	// 创建临时文件
	tmpDir := os.TempDir()
	ext := ".mp4"
	if ct := resp.Header.Get("Content-Type"); strings.Contains(ct, "image") {
		ext = ".jpg"
	}
	tmpFile, err := os.CreateTemp(tmpDir, "babyplace-xhs-*"+ext)
	if err != nil {
		return "", fmt.Errorf("创建临时文件失败: %w", err)
	}

	if _, err := io.Copy(tmpFile, resp.Body); err != nil {
		tmpFile.Close()
		os.Remove(tmpFile.Name())
		return "", fmt.Errorf("写入临时文件失败: %w", err)
	}
	tmpFile.Close()

	return tmpFile.Name(), nil
}
