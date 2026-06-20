package main

import (
	"log"
	"os"
	"strings"
	"time"
)

// 定时抓取公众号文章
// 读取 MPTEXT_FAKEIDS 环境变量（逗号分隔的 fakeid 列表）
// 每 12 小时自动抓取一次最新文章

const (
	crawlInterval   = 12 * time.Hour // 抓取间隔
	crawlBatchSize  = 10             // 每个公众号每次抓取篇数
	crawlDelayPerArticle = 2 * time.Second // 每篇文章间隔，避免限流
)

func startArticleCrawler() {
	fakeidsStr := os.Getenv("MPTEXT_FAKEIDS")
	if fakeidsStr == "" {
		log.Println("[scheduler] MPTEXT_FAKEIDS not set, article crawler disabled")
		return
	}

	fakeids := strings.Split(fakeidsStr, ",")
	if len(fakeids) == 0 {
		log.Println("[scheduler] no fakeids configured, article crawler disabled")
		return
	}

	log.Printf("[scheduler] article crawler started, %d accounts, interval %s", len(fakeids), crawlInterval)

	// 启动时先跑一次（延迟 30 秒，等服务完全就绪）
	go func() {
		time.Sleep(30 * time.Second)
		runCrawl(fakeids)
	}()

	// 定时循环
	ticker := time.NewTicker(crawlInterval)
	go func() {
		for range ticker.C {
			runCrawl(fakeids)
		}
	}()
}

func runCrawl(fakeids []string) {
	log.Printf("[scheduler] === 开始定时文章抓取 ===")
	totalNew := 0
	totalErrors := 0

	for _, fakeid := range fakeids {
		fakeid = strings.TrimSpace(fakeid)
		if fakeid == "" {
			continue
		}

		count, err := crawlOneAccount(fakeid)
		if err != nil {
			log.Printf("[scheduler] account %s error: %v", fakeid, err)
			totalErrors++
			continue
		}
		totalNew += count
	}

	log.Printf("[scheduler] === 抓取完成: 新增 %d 篇, 错误 %d 个 ===", totalNew, totalErrors)
}

// crawlOneAccount 抓取单个公众号的最新文章
func crawlOneAccount(fakeid string) (int, error) {
	log.Printf("[scheduler] 抓取公众号: %s", fakeid)

	// 1. 获取文章列表
	data, err := mptextGetArticleList(fakeid, 0, crawlBatchSize)
	if err != nil {
		return 0, err
	}

	// 2. 提取文章 URL
	articlesRaw, ok := data["data"].(map[string]interface{})
	if !ok {
		log.Printf("[scheduler] unexpected response format for %s", fakeid)
		return 0, nil
	}

	articlesList, ok := articlesRaw["articles"].([]interface{})
	if !ok || len(articlesList) == 0 {
		log.Printf("[scheduler] no articles for %s", fakeid)
		return 0, nil
	}

	saved := 0
	for _, item := range articlesList {
		articleMap, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		link, _ := articleMap["link"].(string)
		if link == "" || !strings.Contains(link, "mp.weixin.qq.com") {
			continue
		}

		// 3. 抓取并保存
		if err := fetchAndSaveArticle(link); err != nil {
			log.Printf("[scheduler] ✗ %s: %v", link, err)
			continue
		}

		title, _ := articleMap["title"].(string)
		if len(title) > 50 {
			title = title[:50]
		}
		log.Printf("[scheduler] ✓ 已保存: %s", title)
		saved++

		time.Sleep(crawlDelayPerArticle)
	}

	log.Printf("[scheduler] 公众号 %s: 抓取 %d 篇", fakeid, saved)
	return saved, nil
}

// fetchAndSaveArticle 抓取单篇文章并存入数据库
func fetchAndSaveArticle(articleURL string) error {
	// 调用 mptext API 获取文章内容
	data, err := mptextFetchArticle(articleURL, "json")
	if err != nil {
		return err
	}

	// 检查 API 返回
	if baseResp, ok := data["base_resp"].(map[string]interface{}); ok {
		if ret, ok := baseResp["ret"].(float64); ok && ret != 0 {
			return nil // 静默跳过错误文章
		}
	}

	// 解析文章
	article, err := parseMptextArticle(data)
	if err != nil {
		return err
	}

	// 存入数据库（URL 去重，已存在则更新）
	_, err = saveArticleToDB(article)
	return err
}
