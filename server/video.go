package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var (
	remotionServerURL string
	aiAPIURL          string
	aiAPIKey          string
)

func initVideo() {
	remotionServerURL = os.Getenv("REMOTION_SERVER_URL")
	if remotionServerURL == "" {
		remotionServerURL = "http://lanes.ymxt.top:3010"
	}
	aiAPIURL = os.Getenv("AI_API_URL")
	if aiAPIURL == "" {
		aiAPIURL = "https://aikey.aixifs.com/v1"
	}
	aiAPIKey = os.Getenv("AI_API_KEY")
	if aiAPIKey == "" {
		aiAPIKey = "t7npV6raGbd2f4HOMR4RRi0gsK2MbvPWk5TMs4i8Q9eJ80cG"
	}
	initRemotionClient()
}

// remotionClient 是 Remotion 服务专用 HTTP 客户端
// 使用短连接超时 + 每次请求重新解析 DNS，适配 DDNS-GO 动态 IPv6 场景
var remotionClient *http.Client

func initRemotionClient() {
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			// 每次拨号都重新解析 DNS，避免缓存旧的 IPv6 地址
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}
			resolver := &net.Resolver{}
			addrs, err := resolver.LookupIPAddr(ctx, host)
			if err != nil {
				return nil, fmt.Errorf("DNS 解析 %s 失败: %w", host, err)
			}
			if len(addrs) == 0 {
				return nil, fmt.Errorf("DNS 解析 %s 无结果", host)
			}
			// 优先 IPv6，回退 IPv4
			var chosen net.IP
			for _, a := range addrs {
				if a.IP.To4() == nil {
					chosen = a.IP
					break
				}
			}
			if chosen == nil {
				chosen = addrs[0].IP
			}
			dialer := &net.Dialer{Timeout: 10 * time.Second}
			return dialer.DialContext(ctx, "tcp", net.JoinHostPort(chosen.String(), port))
		},
		MaxIdleConns:        2,
		MaxIdleConnsPerHost: 1,
		IdleConnTimeout:     30 * time.Second, // 30秒后关闭空闲连接，强制重新拨号
	}
	remotionClient = &http.Client{
		Transport: transport,
		Timeout:   120 * time.Second,
	}
	log.Println("[video] Remotion 客户端初始化完成 (DNS 不缓存, 空闲连接 30s 超时)")
}

// ─── 请求/响应结构体 ────────────────────────────────────────

type VideoEnhanceRequest struct {
	Images []string `json:"images"`
	Style  string   `json:"style"`
}

type VideoRenderRequest struct {
	Images     []string `json:"images"`
	PoiName    string   `json:"poiName"`
	PoiAddress string   `json:"poiAddress"`
	Tags       []string `json:"tags"`
	Summary    string   `json:"summary"`
	AudioSrc   string   `json:"audioSrc"`
}

type VideoResponse struct {
	Status  string      `json:"status"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

// ─── 图片上传 ──────────────────────────────────────────────

func handleVideoUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeVideoError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// 解析 multipart 文件
	r.ParseMultipartForm(32 << 20) // 32MB max
	file, header, err := r.FormFile("file")
	if err != nil {
		writeVideoError(w, http.StatusBadRequest, "file is required")
		return
	}
	defer file.Close()

	// 写入临时文件
	tmpDir := os.TempDir()
	ext := filepath.Ext(header.Filename)
	if ext == "" {
		ext = ".jpg"
	}
	tmpPath := filepath.Join(tmpDir, fmt.Sprintf("babyplace-upload-%d%s", time.Now().UnixNano(), ext))
	tmpFile, err := os.Create(tmpPath)
	if err != nil {
		log.Printf("[videoUpload] create temp file failed: %v", err)
		writeVideoError(w, http.StatusInternalServerError, "Failed to save file")
		return
	}
	defer os.Remove(tmpPath)
	defer tmpFile.Close()

	if _, err := io.Copy(tmpFile, file); err != nil {
		log.Printf("[videoUpload] write temp file failed: %v", err)
		writeVideoError(w, http.StatusInternalServerError, "Failed to save file")
		return
	}
	tmpFile.Close()

	// 上传到 Remotion 服务的 /api/assets/upload
	remotionURL, err := uploadToRemotion(tmpPath, header.Filename)
	if err != nil {
		log.Printf("[videoUpload] upload to remotion failed: %v", err)
		writeVideoError(w, http.StatusBadGateway, "Failed to upload to render service")
		return
	}

	writeVideoJSON(w, http.StatusOK, VideoResponse{
		Status: "ok",
		Data: map[string]string{
			"url": remotionURL,
		},
	})
}

func uploadToRemotion(filePath, filename string) (string, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(part, f); err != nil {
		return "", err
	}
	writer.Close()

	url := remotionServerURL + "/api/assets/upload"
	req, err := http.NewRequest(http.MethodPost, url, &body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := remotionClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		AssetID string `json:"assetId"`
		URL     string `json:"url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if result.URL == "" {
		return "", fmt.Errorf("remotion returned empty URL")
	}

	return result.URL, nil
}

// ─── AI 图片增强 ────────────────────────────────────────────

func getStylePrompt(style string) string {
	prompts := map[string]string{
		"enhance":    "high quality, detailed, vibrant colors, professional photography",
		"cartoon":    "cartoon style, anime, colorful, cute, child-friendly",
		"watercolor": "watercolor painting, soft colors, artistic, dreamy",
		"sketch":     "pencil sketch, hand-drawn, artistic, detailed linework",
	}
	if p, ok := prompts[style]; ok {
		return p
	}
	return prompts["enhance"]
}

func handleVideoEnhance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeVideoError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req VideoEnhanceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeVideoError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if len(req.Images) == 0 {
		writeVideoError(w, http.StatusBadRequest, "images is required")
		return
	}

	style := req.Style
	if style == "" {
		style = "enhance"
	}

	enhancedImages := make([]string, 0, len(req.Images))
	for i, imageURL := range req.Images {
		enhanced, err := enhanceSingleImage(imageURL, style)
		if err != nil {
			log.Printf("[videoEnhance] image %d failed: %v, using original", i, err)
			enhancedImages = append(enhancedImages, imageURL)
		} else {
			enhancedImages = append(enhancedImages, enhanced)
		}
	}

	writeVideoJSON(w, http.StatusOK, VideoResponse{
		Status: "ok",
		Data: map[string]interface{}{
			"images": enhancedImages,
		},
	})
}

func enhanceSingleImage(imageURL, style string) (string, error) {
	payload := map[string]interface{}{
		"model":               "stable-diffusion-xl",
		"prompt":              getStylePrompt(style),
		"image":               imageURL,
		"strength":            0.3,
		"num_inference_steps": 30,
	}

	body, _ := json.Marshal(payload)
	url := aiAPIURL + "/images/generations"

	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+aiAPIKey)

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		Data []struct {
			URL string `json:"url"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if len(result.Data) == 0 || result.Data[0].URL == "" {
		return "", fmt.Errorf("AI API returned no image")
	}

	return result.Data[0].URL, nil
}

// ─── 提交 Remotion 渲染 ────────────────────────────────────

func handleVideoRender(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeVideoError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req VideoRenderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeVideoError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	log.Printf("[videoRender] 收到渲染请求: poi=%s images=%d tags=%v", req.PoiName, len(req.Images), req.Tags)

	if len(req.Images) == 0 {
		writeVideoError(w, http.StatusBadRequest, "images is required")
		return
	}

	if req.PoiName == "" {
		req.PoiName = "遛娃好去处"
	}
	if req.Tags == nil {
		req.Tags = []string{"亲子", "遛娃", "推荐"}
	}
	if req.Summary == "" {
		req.Summary = "适合带小朋友来玩的好地方"
	}

	// 构建 Remotion 请求
	remotionReq := map[string]interface{}{
		"templateId": "BabyplacePoi",
		"inputProps": map[string]interface{}{
			"poiName":    req.PoiName,
			"poiAddress": req.PoiAddress,
			"images":     req.Images,
			"tags":       req.Tags,
			"summary":    req.Summary,
			"audioSrc":   req.AudioSrc,
		},
	}

	body, _ := json.Marshal(remotionReq)
	url := remotionServerURL + "/api/renders"

	httpReq, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		writeVideoError(w, http.StatusInternalServerError, "Failed to create request")
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := remotionClient.Do(httpReq)
	if err != nil {
		log.Printf("[videoRender] remotion request failed: %v", err)
		writeVideoError(w, http.StatusBadGateway, "Render service unavailable")
		return
	}
	defer resp.Body.Close()

	var result struct {
		RenderID string `json:"renderId"`
		Status   string `json:"status"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		writeVideoError(w, http.StatusBadGateway, "Invalid render service response")
		return
	}

	if result.RenderID == "" {
		writeVideoError(w, http.StatusBadGateway, "Render service returned no renderId")
		return
	}

	log.Printf("[videoRender] 渲染任务已创建: renderId=%s status=%s", result.RenderID, result.Status)

	writeVideoJSON(w, http.StatusOK, VideoResponse{
		Status: "ok",
		Data: map[string]string{
			"renderId": result.RenderID,
			"status":   result.Status,
		},
	})
}

// ─── 查询渲染状态 ──────────────────────────────────────────

func handleVideoRenderStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeVideoError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// 从 URL 路径提取 renderId: /api/video/render/{id}
	renderID := strings.TrimPrefix(r.URL.Path, "/api/video/render/")
	if renderID == "" {
		writeVideoError(w, http.StatusBadRequest, "renderId is required")
		return
	}

	url := fmt.Sprintf("%s/api/renders/%s", remotionServerURL, renderID)
	resp, err := remotionClient.Get(url)
	if err != nil {
		log.Printf("[videoRenderStatus] request failed: %v", err)
		writeVideoError(w, http.StatusBadGateway, "Render service unavailable")
		return
	}
	defer resp.Body.Close()

	var result struct {
		RenderID string  `json:"renderId"`
		Status   string  `json:"status"`
		Progress float64 `json:"progress"`
		VideoURL string  `json:"videoUrl"`
		Error    string  `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		writeVideoError(w, http.StatusBadGateway, "Invalid render service response")
		return
	}

	// 将 Remotion 内部 URL 替换为 HTTPS 代理 URL
	videoURL := result.VideoURL
	if videoURL != "" {
		videoURL = strings.Replace(videoURL, "http://lanes.ymxt.top:3010/api/", "https://oc.aixifs.com/api/remotion/", 1)
	}

	log.Printf("[videoRenderStatus] 查询渲染状态: renderId=%s status=%s progress=%.2f videoURL=%s", renderID, result.Status, result.Progress, videoURL)

	writeVideoJSON(w, http.StatusOK, VideoResponse{
		Status: "ok",
		Data: map[string]interface{}{
			"renderId": result.RenderID,
			"status":   result.Status,
			"progress": result.Progress,
			"videoUrl": videoURL,
			"error":    result.Error,
		},
	})
}

// ─── 工具函数 ──────────────────────────────────────────────

func writeVideoJSON(w http.ResponseWriter, code int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(data)
}

func writeVideoError(w http.ResponseWriter, code int, message string) {
	writeVideoJSON(w, code, VideoResponse{Status: "error", Message: message})
}
