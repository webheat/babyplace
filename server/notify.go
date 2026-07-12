package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

// 企业微信通知模块

var (
	wecomCorpID  string
	wecomSecret  string
	wecomAgentID string
	wecomToUser  string
	wecomClient  *http.Client

	// token 缓存
	wecomToken     string
	wecomTokenExp  time.Time
	wecomTokenLock sync.Mutex
)

func initWecomNotify() {
	wecomCorpID = os.Getenv("WECOM_CORPID")
	wecomSecret = os.Getenv("WECOM_SECRET")
	wecomAgentID = os.Getenv("WECOM_AGENTID")
	wecomToUser = os.Getenv("WECOM_TO_USER")
	wecomClient = &http.Client{Timeout: 10 * time.Second}

	if wecomCorpID == "" || wecomSecret == "" || wecomAgentID == "" || wecomToUser == "" {
		log.Println("[wecom] 企微通知未配置（缺少 WECOM_CORPID/WECOM_SECRET/WECOM_AGENTID/WECOM_TO_USER）")
		return
	}
	log.Printf("[wecom] 企微通知已启用，接收人: %s", wecomToUser)
}

// getWecomToken 获取 access_token，带内存缓存
func getWecomToken() (string, error) {
	wecomTokenLock.Lock()
	defer wecomTokenLock.Unlock()

	// 缓存有效（提前 5 分钟刷新）
	if wecomToken != "" && time.Now().Before(wecomTokenExp.Add(-5*time.Minute)) {
		return wecomToken, nil
	}

	url := fmt.Sprintf("https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=%s&corpsecret=%s",
		wecomCorpID, wecomSecret)

	resp, err := wecomClient.Get(url)
	if err != nil {
		return "", fmt.Errorf("gettoken request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
		ErrCode     int    `json:"errcode"`
		ErrMsg      string `json:"errmsg"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("parse gettoken response failed: %w", err)
	}
	if result.ErrCode != 0 {
		return "", fmt.Errorf("gettoken error: %d %s", result.ErrCode, result.ErrMsg)
	}

	wecomToken = result.AccessToken
	wecomTokenExp = time.Now().Add(time.Duration(result.ExpiresIn) * time.Second)
	return wecomToken, nil
}

// sendWecomNotify 发送企业微信应用消息
func sendWecomNotify(title, content string) {
	if wecomCorpID == "" {
		log.Println("[wecom] 通知未配置，跳过发送")
		return
	}

	token, err := getWecomToken()
	if err != nil {
		log.Printf("[wecom] 获取 token 失败: %v", err)
		return
	}

	fullContent := fmt.Sprintf("【%s】\n\n%s", title, content)

	msgBody := map[string]interface{}{
		"touser":  wecomToUser,
		"msgtype": "text",
		"agentid": mustAtoi(wecomAgentID),
		"text":    map[string]string{"content": fullContent},
	}

	bodyBytes, _ := json.Marshal(msgBody)
	url := fmt.Sprintf("https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=%s", token)

	resp, err := wecomClient.Post(url, "application/json", bytes.NewReader(bodyBytes))
	if err != nil {
		log.Printf("[wecom] 发送消息失败: %v", err)
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var result struct {
		ErrCode int    `json:"errcode"`
		ErrMsg  string `json:"errmsg"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		log.Printf("[wecom] 解析发送响应失败: %v", err)
		return
	}
	if result.ErrCode != 0 {
		log.Printf("[wecom] 发送失败: %d %s", result.ErrCode, result.ErrMsg)
		return
	}

	log.Printf("[wecom] 通知发送成功: %s", title)
}

func mustAtoi(s string) int {
	n := 0
	for _, c := range s {
		if c >= '0' && c <= '9' {
			n = n*10 + int(c-'0')
		}
	}
	return n
}
