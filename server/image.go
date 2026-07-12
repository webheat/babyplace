package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const picBaseDir = "/opt/babyplace/pic"

// downloadArticleImages 下载文章的所有图片到本地
// 返回本地相对路径：封面图 + 文章内图片列表
func downloadArticleImages(articleID string, coverURL string, imageURLs []string) (string, []string) {
	if articleID == "" {
		return "", nil
	}

	// 创建文章图片目录
	articleDir := filepath.Join(picBaseDir, articleID)
	if err := os.MkdirAll(articleDir, 0755); err != nil {
		log.Printf("[image] 创建目录失败 %s: %v", articleDir, err)
		return "", nil
	}

	client := &http.Client{Timeout: 30 * time.Second}

	// 下载封面图
	localCover := ""
	if coverURL != "" && strings.Contains(coverURL, "mmbiz.qpic.cn") {
		localPath := filepath.Join(articleDir, "cover.jpg")
		if err := downloadImage(client, coverURL, localPath); err != nil {
			log.Printf("[image] 封面下载失败: %v", err)
		} else {
			localCover = fmt.Sprintf("pic/%s/cover.jpg", articleID)
		}
	}

	// 下载文章内图片
	localImages := make([]string, 0, len(imageURLs))
	for i, url := range imageURLs {
		if url == "" || !strings.Contains(url, "mmbiz.qpic.cn") {
			continue
		}
		filename := fmt.Sprintf("%d.jpg", i)
		localPath := filepath.Join(articleDir, filename)
		if err := downloadImage(client, url, localPath); err != nil {
			log.Printf("[image] 图片[%d]下载失败: %v", i, err)
			continue
		}
		localImages = append(localImages, fmt.Sprintf("pic/%s/%s", articleID, filename))
	}

	if len(localImages) > 0 || localCover != "" {
		log.Printf("[image] 文章 %s: 封面 %s, 图片 %d/%d 张",
			articleID, boolStr(localCover != "", "✓", "✗"), len(localImages), len(imageURLs))
	}

	return localCover, localImages
}

// downloadImage 下载单张图片到指定路径
func downloadImage(client *http.Client, url, localPath string) error {
	// 已存在则跳过
	if _, err := os.Stat(localPath); err == nil {
		return nil
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Referer", "https://mp.weixin.qq.com/")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	// 写入临时文件，成功后重命名（避免下载中断产生空文件）
	tmpPath := localPath + ".tmp"
	f, err := os.Create(tmpPath)
	if err != nil {
		return err
	}

	written, err := io.Copy(f, resp.Body)
	f.Close()
	if err != nil {
		os.Remove(tmpPath)
		return err
	}

	if written < 100 {
		os.Remove(tmpPath)
		return fmt.Errorf("文件过小 (%d bytes)", written)
	}

	return os.Rename(tmpPath, localPath)
}

func boolStr(cond bool, yes, no string) string {
	if cond {
		return yes
	}
	return no
}
