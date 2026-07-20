package main

import (
	"fmt"
	"log"
	"os"
	"strings"
	"time"
)

// 定时抓取公众号文章
// 读取 MPTEXT_FAKEIDS 环境变量（逗号分隔的 fakeid 列表）
// 每 12 小时自动抓取一次最新文章

const (
	crawlInterval        = 12 * time.Hour  // 抓取间隔
	crawlBatchSize       = 10              // 每个公众号每次抓取篇数
	crawlDelayPerArticle = 2 * time.Second // 每篇文章间隔，避免限流
	failThreshold        = 3               // 连续失败 N 次后发送通知
)

// 抓取失败跟踪
var (
	crawlFailCount = map[string]int{}  // fakeid → 连续失败次数
	crawlNotified  = map[string]bool{} // fakeid → 是否已通知（避免重复发送）
	crawlFailLock  = make(chan struct{}, 1)
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
	ticker := newTicker(crawlInterval)
	go func() {
		for range ticker.C {
			runCrawl(fakeids)
		}
	}()
}

func newTicker(d time.Duration) *time.Ticker {
	return time.NewTicker(d)
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
		totalNew += count
		if err != nil {
			log.Printf("[scheduler] account %s error: %v", fakeid, err)
			totalErrors++
			onCrawlFailure(fakeid, err)
			continue
		}
		// 成功：重置失败计数和通知标记
		onCrawlSuccess(fakeid)
	}

	log.Printf("[scheduler] === 抓取完成: 新增 %d 篇, 错误 %d 个 ===", totalNew, totalErrors)
}

// onCrawlFailure 处理单个公众号抓取失败
func onCrawlFailure(fakeid string, err error) {
	crawlFailLock <- struct{}{}
	defer func() { <-crawlFailLock }()

	crawlFailCount[fakeid]++
	count := crawlFailCount[fakeid]

	log.Printf("[scheduler] %s 连续失败 %d 次 (阈值: %d)", fakeid, count, failThreshold)

	// 达到阈值且未通知过 → 发送企微告警
	if count >= failThreshold && !crawlNotified[fakeid] {
		crawlNotified[fakeid] = true

		title := "⚠️ 公众号抓取失败告警"
		content := fmt.Sprintf(
			"公众号抓取功能异常，请检查 mptext API 配置。\n\n"+
				"• 公众号: %s\n"+
				"• 连续失败: %d 次\n"+
				"• 最近错误: %s\n"+
				"• 抓取间隔: %s\n\n"+
				"可能原因：API Key 过期、mptext 服务不可用、网络异常。\n"+
				"请登录 https://down.mptext.top/dashboard/account 检查状态。",
			fakeid, count, err.Error(), crawlInterval)

		go sendWecomNotify(title, content)
	}
}

// onCrawlSuccess 处理单个公众号抓取成功
func onCrawlSuccess(fakeid string) {
	crawlFailLock <- struct{}{}
	defer func() { <-crawlFailLock }()

	if crawlFailCount[fakeid] > 0 {
		// 之前有失败记录 → 发送恢复通知
		if crawlNotified[fakeid] {
			title := "✅ 公众号抓取已恢复"
			content := fmt.Sprintf("公众号 %s 抓取已恢复正常。", fakeid)
			go sendWecomNotify(title, content)
		}

		crawlFailCount[fakeid] = 0
		crawlNotified[fakeid] = false
	}
}

// crawlOneAccount 抓取单个公众号的最新文章
func crawlOneAccount(fakeid string) (int, error) {
	log.Printf("[scheduler] 抓取公众号: %s", fakeid)

	// 1. 获取文章列表
	data, err := mptextGetArticleList(fakeid, 0, crawlBatchSize)
	if err != nil {
		return 0, err
	}

	// 2. 提取文章 URL（API 直接返回 articles 数组，无 data 包装层）
	articlesList, ok := data["articles"].([]interface{})
	if !ok {
		// 兼容 data 包装格式
		if dataWrap, ok := data["data"].(map[string]interface{}); ok {
			articlesList, ok = dataWrap["articles"].([]interface{})
		}
	}
	if !ok {
		log.Printf("[scheduler] unexpected response format for %s", fakeid)
		return 0, fmt.Errorf("unexpected article-list response format")
	}
	if !ok || len(articlesList) == 0 {
		log.Printf("[scheduler] no articles for %s", fakeid)
		return 0, nil
	}

	saved := 0
	failed := 0
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
			failed++
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
	if failed > 0 {
		return saved, fmt.Errorf("%d article(s) failed to fetch or save", failed)
	}
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
			return fmt.Errorf("mptext API error: ret=%v", ret)
		}
	}

	// 解析文章
	article, err := parseMptextArticle(data)
	if err != nil {
		return err
	}

	// 存入数据库（URL 去重，已存在则更新）
	articleID, err := saveArticleToDB(article)
	if err != nil {
		return err
	}

	// 下载图片到本地
	if articleID != "" {
		localCover, localImages := downloadArticleImages(articleID, article.CoverImage, article.Images)
		if localCover != "" || len(localImages) > 0 {
			article.LocalCoverImage = localCover
			article.LocalImages = localImages
			db.Exec(`UPDATE article SET local_cover_image = ?, local_images = ? WHERE id = ?`,
				localCover, jsonMarshal(localImages), articleID)
		}
	}
	if _, err := exportArticleToObsidian(articleID, article); err != nil {
		return err
	}

	return nil
}
