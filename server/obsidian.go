package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const defaultObsidianOutputDir = `C:\Users\Admin\Documents\MyVault\22.workbuddy专栏\周末遛娃派`

// obsidianOutputDir 优先从 .env 的 OBSIDIAN_OUTPUT_DIR 读取；未配置时使用当前约定的绝对路径。
func obsidianOutputDir() string {
	if dir := strings.TrimSpace(os.Getenv("OBSIDIAN_OUTPUT_DIR")); dir != "" {
		return dir
	}
	return defaultObsidianOutputDir
}

// exportArticleToObsidian 将抓取文章同步为 Obsidian 可直接打开的 Markdown 文件。
func exportArticleToObsidian(articleID string, article *Article) (string, error) {
	if articleID == "" || article == nil {
		return "", fmt.Errorf("article id is required for Obsidian export")
	}

	dir := obsidianOutputDir()
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("create Obsidian output directory: %w", err)
	}

	publishedAt := ""
	if article.PublishTime > 0 {
		publishedAt = time.UnixMilli(article.PublishTime).Format(time.RFC3339)
	}

	var content strings.Builder
	content.WriteString("---\n")
	content.WriteString("title: ")
	content.WriteString(strconv.Quote(article.Title))
	content.WriteString("\nsource_account: ")
	content.WriteString(strconv.Quote(article.SourceAccount))
	content.WriteString("\nsource_url: ")
	content.WriteString(strconv.Quote(article.URL))
	content.WriteString("\npublished_at: ")
	content.WriteString(strconv.Quote(publishedAt))
	content.WriteString("\narticle_id: ")
	content.WriteString(strconv.Quote(articleID))
	content.WriteString("\n---\n\n# ")
	content.WriteString(article.Title)
	content.WriteString("\n\n")
	if article.URL != "" {
		content.WriteString("原文：")
		content.WriteString(article.URL)
		content.WriteString("\n\n")
	}
	if article.CoverImage != "" {
		content.WriteString("![](")
		content.WriteString(article.CoverImage)
		content.WriteString(")\n\n")
	}
	if article.ContentHTML != "" {
		content.WriteString(article.ContentHTML)
	} else {
		content.WriteString(article.ContentText)
	}
	content.WriteString("\n")

	outputPath := filepath.Join(dir, articleID+".md")
	tempPath := outputPath + ".tmp"
	if err := os.WriteFile(tempPath, []byte(content.String()), 0644); err != nil {
		return "", fmt.Errorf("write Obsidian temporary file: %w", err)
	}
	if err := os.Rename(tempPath, outputPath); err != nil {
		if removeErr := os.Remove(outputPath); removeErr != nil && !os.IsNotExist(removeErr) {
			_ = os.Remove(tempPath)
			return "", fmt.Errorf("replace Obsidian file: %w", err)
		}
		if err := os.Rename(tempPath, outputPath); err != nil {
			_ = os.Remove(tempPath)
			return "", fmt.Errorf("publish Obsidian file: %w", err)
		}
	}

	return outputPath, nil
}
