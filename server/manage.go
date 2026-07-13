package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var (
	managePassword string
	manageSecret   []byte
	manageStartTime int64
)

func initManage() {
	managePassword = os.Getenv("MANAGE_PASSWORD")
	if managePassword == "" {
		managePassword = "admin123"
	}
	manageStartTime = time.Now().UnixMilli()
	manageSecret = []byte(fmt.Sprintf("%s:%d", managePassword, manageStartTime))

	// 静态文件服务：/manage/ → static/manage/
	staticDir := filepath.Join("static", "manage")
	if _, err := os.Stat(filepath.Join(staticDir, "index.html")); err == nil {
		log.Printf("[manage] serving static files from %s", staticDir)
	} else {
		log.Printf("[manage] warning: %s/index.html not found, SPA will not load", staticDir)
	}

	fileServer := http.StripPrefix("/manage/", http.FileServer(http.Dir(staticDir)))

	http.HandleFunc("/manage/", func(w http.ResponseWriter, r *http.Request) {
		// API 路由不走静态文件
		if strings.HasPrefix(r.URL.Path, "/manage/api/") {
			http.NotFound(w, r)
			return
		}

		// 对于 SPA：如果文件不存在，返回 index.html
		reqPath := strings.TrimPrefix(r.URL.Path, "/manage/")
		if reqPath == "" || reqPath == "/" {
			reqPath = "index.html"
		}
		fullPath := filepath.Join(staticDir, filepath.Clean(reqPath))
		if _, err := os.Stat(fullPath); os.IsNotExist(err) {
			http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
			return
		}

		fileServer.ServeHTTP(w, r)
	})

	// 管理后台 API
	http.HandleFunc("/manage/api/login", corsMiddleware(handleManageLogin))
	http.HandleFunc("/manage/api/logout", corsMiddleware(handleManageLogout))
	http.HandleFunc("/manage/api/check", corsMiddleware(handleManageCheck))

	log.Printf("[manage] admin dashboard registered at /manage/")
}

// --- Session Token ---

func generateSessionToken(password string) string {
	mac := hmac.New(sha256.New, manageSecret)
	mac.Write([]byte(password))
	sig := hex.EncodeToString(mac.Sum(nil))
	// token = timestamp.signature
	return fmt.Sprintf("%d.%s", time.Now().UnixMilli(), sig)
}

func validateSessionToken(token string) bool {
	if token == "" {
		return false
	}
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return false
	}

	// 重新计算签名
	mac := hmac.New(sha256.New, manageSecret)
	mac.Write([]byte(managePassword))
	expectedSig := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(parts[1]), []byte(expectedSig)) {
		return false
	}

	// 检查过期（24 小时）
	var ts int64
	fmt.Sscanf(parts[0], "%d", &ts)
	if time.Now().UnixMilli()-ts > 24*3600*1000 {
		return false
	}

	return true
}

func getManageCookie(r *http.Request) string {
	cookie, err := r.Cookie("manage_session")
	if err != nil {
		return ""
	}
	return cookie.Value
}

// --- Handlers ---

func handleManageLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]interface{}{
			"code": 405, "message": "Method not allowed",
		})
		return
	}

	var req struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{
			"code": 400, "message": "invalid request body",
		})
		return
	}

	if req.Password != managePassword {
		log.Printf("[manage] login failed from %s", r.RemoteAddr)
		writeJSON(w, http.StatusUnauthorized, map[string]interface{}{
			"code": 401, "message": "密码错误",
		})
		return
	}

	token := generateSessionToken(req.Password)
	http.SetCookie(w, &http.Cookie{
		Name:     "manage_session",
		Value:    token,
		Path:     "/manage",
		HttpOnly: true,
		MaxAge:   24 * 3600,
		SameSite: http.SameSiteLaxMode,
	})

	log.Printf("[manage] login success from %s", r.RemoteAddr)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"code": 0, "message": "ok",
	})
}

func handleManageLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "manage_session",
		Value:    "",
		Path:     "/manage",
		HttpOnly: true,
		MaxAge:   -1,
		SameSite: http.SameSiteLaxMode,
	})
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"code": 0, "message": "ok",
	})
}

func handleManageCheck(w http.ResponseWriter, r *http.Request) {
	token := getManageCookie(r)
	if !validateSessionToken(token) {
		writeJSON(w, http.StatusUnauthorized, map[string]interface{}{
			"code": 401, "message": "未登录",
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"code": 0, "message": "ok",
	})
}
