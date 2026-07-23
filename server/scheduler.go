package main

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// 定时抓取公众号文章
// 读取 MPTEXT_FAKEIDS 环境变量（逗号分隔的 fakeid 列表）
// 每 12 小时自动抓取一次最新文章

const (
	crawlInterval         = 12 * time.Hour      // 抓取间隔
	crawlBatchSize        = 10                  // 每个公众号每次抓取篇数
	crawlDelayPerAccount  = 3 * time.Second     // 公众号之间延迟，避免同时爆发请求
	crawlDelayPerArticle  = 1500 * time.Millisecond // 每篇文章间隔
	crawlDefaultParallel  = 3                   // 默认并发抓取公众号数
	crawlDefaultWorkers   = 2                   // 默认每公众号并发抓取文章数
	failThreshold         = 3                   // 连续失败 N 次后发送通知
)

// 抓取失败跟踪
var (
	crawlFailCount = map[string]int{}  // fakeid → 连续失败次数
	crawlNotified  = map[string]bool{} // fakeid → 是否已通知（避免重复发送）
	crawlFailLock  sync.Mutex
)

var (
	crawlAccountParallel int
	crawlArticleWorkers  int
)

func initCrawlerConfig() {
	// 环境变量配置并发数: MPTEXT_ACCOUNT_PARALLEL / MPTEXT_ARTICLE_WORKERS
	if v := os.Getenv("MPTEXT_ACCOUNT_PARALLEL"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			crawlAccountParallel = n
		}
	}
	if crawlAccountParallel == 0 {
		crawlAccountParallel = crawlDefaultParallel
	}

	if v := os.Getenv("MPTEXT_ARTICLE_WORKERS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			crawlArticleWorkers = n
		}
	}
	if crawlArticleWorkers == 0 {
		crawlArticleWorkers = crawlDefaultWorkers
	}

	log.Printf("[scheduler] crawler config: account_parallel=%d article_workers=%d",
		crawlAccountParallel, crawlArticleWorkers)
}

func startArticleCrawler() {
	initCrawlerConfig()

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

	log.Printf("[scheduler] article crawler started, %d accounts, interval %s, parallel=%d",
		len(fakeids), crawlInterval, crawlAccountParallel)

	// 启动时先跑一次（延迟 30 秒，等服务完全就绪）
	go func() {
		time.Sleep(30 * time.Second)
		runCrawlParallel(fakeids)
	}()

	// 定时循环
	ticker := time.NewTicker(crawlInterval)
	go func() {
		for range ticker.C {
			runCrawlParallel(fakeids)
		}
	}()
}

// runCrawlParallel 并发抓取所有公众号
func runCrawlParallel(fakeids []string) {
	log.Printf("[scheduler] === 开始并行文章抓取 ===")

	// 过滤空值
	var ids []string
	for _, f := range fakeids {
		f = strings.TrimSpace(f)
		if f != "" {
			ids = append(ids, f)
		}
	}
	if len(ids) == 0 {
		return
	}

	var (
		mu          sync.Mutex
		totalNew    int
		totalErrors int
		wg          sync.WaitGroup
		accountSem  = make(chan struct{}, crawlAccountParallel)
	)

	for _, fakeid := range ids {
		wg.Add(1)
		accountSem <- struct{}{} // 获取信号量，满则阻塞

		go func(fid string) {
			defer func() {
				<-accountSem // 释放信号量
				wg.Done()
			}()

			count, err := crawlOneAccountParallel(fid)
			mu.Lock()
			if err != nil {
				log.Printf("[scheduler] account %s error: %v", fid, err)
				totalErrors++
				onCrawlFailure(fid, err)
			} else {
				totalNew += count
				onCrawlSuccess(fid)
			}
			mu.Unlock()
		}(fakeid)

		// 公众号之间延迟，避免同时爆发请求
		time.Sleep(crawlDelayPerAccount)
	}

	wg.Wait()
	log.Printf("[scheduler] === 抓取完成: 新增 %d 篇, 错误 %d 个 ===", totalNew, totalErrors)
}

// onCrawlFailure 处理单个公众号抓取失败
func onCrawlFailure(fakeid string, err error) {
	crawlFailLock.Lock()
	defer crawlFailLock.Unlock()

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
				"请登录 https://down.dwqjk.top/dashboard/account 检查状态。",
			fakeid, count, err.Error(), crawlInterval)

		go sendWecomNotify(title, content)
	}
}

// onCrawlSuccess 处理单个公众号抓取成功
func onCrawlSuccess(fakeid string) {
	crawlFailLock.Lock()
	defer crawlFailLock.Unlock()

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

// crawlOneAccountParallel 并发抓取单个公众号的所有文章
func crawlOneAccountParallel(fakeid string) (int, error) {
	log.Printf("[scheduler] 抓取公众号: %s", fakeid)

	// 1. 获取文章列表
	data, err := mptextGetArticleList(fakeid, 0, crawlBatchSize)
	if err != nil {
		return 0, err
	}

	// 兼容两种响应格式:
	// dwqjk.top: {base_resp: {ret:0}, articles: [...]}
	// old mptext.top: {data: {articles: [...]}}
	var articlesList []interface{}
	if arts, ok := data["articles"].([]interface{}); ok {
		articlesList = arts
	} else if dataWrap, ok := data["data"].(map[string]interface{}); ok {
		articlesList, _ = dataWrap["articles"].([]interface{})
	}
	if len(articlesList) == 0 {
		log.Printf("[scheduler] no articles for %s", fakeid)
		return 0, nil
	}

	// 2. 并发抓取每篇文章
	type articleItem struct {
		link  string
		title string
	}

	var articles []articleItem
	for _, item := range articlesList {
		articleMap, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		link, _ := articleMap["link"].(string)
		if link == "" || !strings.Contains(link, "mp.weixin.qq.com") {
			continue
		}
		title, _ := articleMap["title"].(string)
		if len(title) > 50 {
			title = title[:50]
		}
		articles = append(articles, articleItem{link: link, title: title})
	}

	if len(articles) == 0 {
		log.Printf("[scheduler] no valid articles for %s", fakeid)
		return 0, nil
	}

	var (
		mu     sync.Mutex
		saved  int
		artWg  sync.WaitGroup
		artSem = make(chan struct{}, crawlArticleWorkers)
	)

	for _, art := range articles {
		artWg.Add(1)
		artSem <- struct{}{}

		go func(a articleItem) {
			defer func() {
				<-artSem
				artWg.Done()
			}()

			if err := fetchAndSaveArticle(a.link); err != nil {
				log.Printf("[scheduler] ✗ %s: %v", a.link, err)
				return
			}

			mu.Lock()
			saved++
			mu.Unlock()
			log.Printf("[scheduler] ✓ 已保存: %s", a.title)
		}(art)

		time.Sleep(crawlDelayPerArticle)
	}

	artWg.Wait()
	log.Printf("[scheduler] 公众号 %s: 抓取 %d/%d 篇", fakeid, saved, len(articles))
	return saved, nil
}

// fetchAndSaveArticle 抓取单篇文章并存入数据库
func fetchAndSaveArticle(articleURL string) error {
	data, err := mptextFetchArticle(articleURL, "json")
	if err != nil {
		return err
	}

	if baseResp, ok := data["base_resp"].(map[string]interface{}); ok {
		if ret, ok := baseResp["ret"].(float64); ok && ret != 0 {
			return nil // 静默跳过错误文章
		}
	}

	article, err := parseMptextArticle(data)
	if err != nil {
		return err
	}

	_, err = saveArticleToDB(article)
	return err
}
