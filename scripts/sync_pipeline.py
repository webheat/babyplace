#!/usr/bin/env python3
"""
数据管线脚本：公众号文章采集 → LLM 摘要生成 → Dify 知识库同步

用法:
  python3 scripts/sync_pipeline.py                    # 执行完整管线
  python3 scripts/sync_pipeline.py --step fetch       # 只执行采集
  python3 scripts/sync_pipeline.py --step enrich      # 只执行摘要
  python3 scripts/sync_pipeline.py --step sync        # 只执行同步
  python3 scripts/sync_pipeline.py --dry-run          # 干跑模式
"""

import argparse
import json
import logging
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = BASE_DIR / "scripts" / "config.json"
LOG_DIR = Path("/var/log/babyplace")
LOG_FILE = LOG_DIR / "sync.log"


# ---------------------------------------------------------------------------
# 日志配置
# ---------------------------------------------------------------------------

def setup_logging():
    """配置日志：同时输出到文件和控制台"""
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    logger = logging.getLogger("sync_pipeline")
    logger.setLevel(logging.INFO)

    # 文件日志
    fh = logging.FileHandler(LOG_FILE, encoding="utf-8")
    fh.setLevel(logging.INFO)
    fh.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))
    logger.addHandler(fh)

    # 控制台日志
    ch = logging.StreamHandler()
    ch.setLevel(logging.INFO)
    ch.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    ))
    logger.addHandler(ch)

    return logger


log = setup_logging()


# ---------------------------------------------------------------------------
# 配置加载
# ---------------------------------------------------------------------------

def load_config():
    """加载 scripts/config.json"""
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(f"配置文件不存在: {CONFIG_PATH}")
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# HTTP 工具
# ---------------------------------------------------------------------------

def http_request(url, method="GET", data=None, headers=None, timeout=30, retries=3):
    """通用 HTTP 请求，带重试"""
    headers = headers or {}
    if data is not None and isinstance(data, dict):
        data = json.dumps(data, ensure_ascii=False).encode("utf-8")
        headers.setdefault("Content-Type", "application/json")

    last_error = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, data=data, headers=headers, method=method)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            last_error = e
            if attempt < retries:
                time.sleep(1.5 * attempt)
    raise last_error


def post_json(url, payload, headers=None, timeout=60):
    """POST JSON 请求"""
    return http_request(url, method="POST", data=payload, headers=headers, timeout=timeout)


def get_json(url, params=None, timeout=30):
    """GET 请求"""
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    return http_request(url, method="GET", timeout=timeout)


# ---------------------------------------------------------------------------
# 微信公众号 API
# ---------------------------------------------------------------------------

class WechatMPClient:
    """微信公众号 API 客户端"""

    def __init__(self, app_id, app_secret):
        self.app_id = app_id
        self.app_secret = app_secret
        self.access_token = ""
        self.token_expires = 0

    def get_access_token(self):
        """获取 access_token（自动缓存）"""
        now = time.time()
        if self.access_token and now < self.token_expires - 60:
            return self.access_token

        url = "https://api.weixin.qq.com/cgi-bin/token"
        params = {
            "grant_type": "client_credential",
            "appid": self.app_id,
            "secret": self.app_secret,
        }
        result = get_json(url, params)
        if "access_token" not in result:
            raise RuntimeError(f"获取 access_token 失败: {result}")

        self.access_token = result["access_token"]
        self.token_expires = now + result.get("expires_in", 7200)
        log.info("获取微信 access_token 成功")
        return self.access_token

    def fetch_materials(self, offset=0, count=20):
        """获取图文素材列表"""
        token = self.get_access_token()
        url = f"https://api.weixin.qq.com/cgi-bin/material/batchget_material?access_token={token}"
        payload = {
            "type": "news",
            "offset": offset,
            "count": min(count, 20),
        }
        result = post_json(url, payload)
        if "item" not in result:
            raise RuntimeError(f"获取素材失败: {result}")
        return result

    def fetch_all_materials(self):
        """获取所有图文素材"""
        all_items = []
        offset = 0
        count = 20

        while True:
            result = self.fetch_materials(offset=offset, count=count)
            items = result.get("item", [])
            total = result.get("total_count", 0)

            all_items.extend(items)
            log.info(f"已获取素材 {len(all_items)}/{total}")

            if not items or len(all_items) >= total:
                break

            offset += count
            time.sleep(0.5)  # 避免频率限制

        return all_items

    def extract_article_content(self, news_item):
        """从图文素材中提取文章内容"""
        content = news_item.get("content", "")
        title = news_item.get("title", "")
        url = news_item.get("url", "")
        digest = news_item.get("digest", "")
        cover = news_item.get("thumb_media_id", "")

        # 从 HTML 中提取纯文本
        content_text = self._html_to_text(content)

        return {
            "title": title,
            "url": url,
            "digest": digest,
            "content_html": content,
            "content_text": content_text,
            "cover_image": cover,
        }

    def _html_to_text(self, html):
        """简单 HTML 转纯文本"""
        import re
        text = re.sub(r"<[^>]+>", "", html)
        text = re.sub(r"\s+", " ", text).strip()
        return text


# ---------------------------------------------------------------------------
# Dify API
# ---------------------------------------------------------------------------

class DifyClient:
    """Dify 知识库 API 客户端"""

    def __init__(self, api_url, api_key, dataset_id):
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key
        self.dataset_id = dataset_id

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def create_document(self, name, text, metadata=None):
        """创建文档到知识库"""
        url = f"{self.api_url}/v1/datasets/{self.dataset_id}/documents/create-by-text"
        payload = {
            "name": name,
            "text": text,
            "metadata": metadata or {},
        }
        result = post_json(url, payload, headers=self._headers())
        return result

    def update_document(self, document_id, name, text, metadata=None):
        """更新知识库文档"""
        url = f"{self.api_url}/v1/datasets/{self.dataset_id}/documents/{document_id}"
        payload = {
            "name": name,
            "text": text,
            "metadata": metadata or {},
        }
        result = http_request(url, method="PUT", data=payload, headers=self._headers())
        return result

    def list_documents(self, page=1, limit=20):
        """列出知识库文档"""
        url = f"{self.api_url}/v1/datasets/{self.dataset_id}/documents"
        params = {"page": page, "limit": limit}
        result = get_json(url, params=params)
        # 需要带 Authorization header
        req = urllib.request.Request(
            f"{url}?{urllib.parse.urlencode(params)}",
            headers=self._headers(),
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def delete_document(self, document_id):
        """删除知识库文档"""
        url = f"{self.api_url}/v1/datasets/{self.dataset_id}/documents/{document_id}"
        req = urllib.request.Request(url, headers=self._headers(), method="DELETE")
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))


# ---------------------------------------------------------------------------
# LLM API（OpenAI 兼容）
# ---------------------------------------------------------------------------

class LLMClient:
    """LLM 客户端（OpenAI 兼容接口）"""

    def __init__(self, base_url, api_key, model):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model

    def chat(self, system_prompt, user_prompt, temperature=0.4):
        """调用 LLM 生成回复"""
        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        result = post_json(url, payload, headers=headers, timeout=120)
        choices = result.get("choices") or []
        if not choices:
            raise RuntimeError(f"LLM 返回为空: {result}")
        return choices[0].get("message", {}).get("content", "")

    def generate_poi_summary(self, poi_name, articles):
        """为 POI 生成结构化摘要"""
        articles_text = "\n\n".join([
            f"文章标题: {a['title']}\n内容摘要: {a['content_text'][:500]}"
            for a in articles[:5]
        ])

        system_prompt = (
            "你是一个专业的亲子地点编辑。请根据提供的公众号文章，为地点生成结构化摘要。"
            "输出严格的 JSON 格式，不要包含 markdown 代码块标记。"
        )

        user_prompt = (
            f"地点名称: {poi_name}\n\n"
            f"相关文章:\n{articles_text}\n\n"
            "请输出 JSON，包含以下字段:\n"
            "- summary: 一句话摘要（20-40字）\n"
            "- recommend_reason: 推荐理由（50-100字）\n"
            "- notice: 注意事项（30-80字，可为空）\n"
            "- tags: 标签数组（3-6个）"
        )

        content = self.chat(system_prompt, user_prompt)
        # 清理可能的 markdown 代码块标记
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[-1]
        if content.endswith("```"):
            content = content.rsplit("```", 1)[0]
        content = content.strip()

        try:
            return json.loads(content)
        except json.JSONDecodeError:
            log.warning(f"LLM 返回非 JSON: {content[:200]}")
            return {
                "summary": "",
                "recommend_reason": "",
                "notice": "",
                "tags": [],
            }


# ---------------------------------------------------------------------------
# Babyplace Admin API
# ---------------------------------------------------------------------------

class BabyplaceAdminClient:
    """babyplace-admin 云函数 HTTP 客户端"""

    def __init__(self, admin_url, seed_secret):
        self.admin_url = admin_url
        self.seed_secret = seed_secret

    def call_action(self, action, params=None):
        """调用 babyplace-admin action"""
        payload = {"action": action, **(params or {})}
        result = post_json(self.admin_url, payload, timeout=60)
        return result

    def list_pois(self, page=1, page_size=50, status="published"):
        """获取 POI 列表"""
        return self.call_action("poi.list", {
            "page": page,
            "pageSize": page_size,
            "status": status,
        })

    def update_poi(self, poi_id, data):
        """更新 POI"""
        return self.call_action("poi.update", {
            "id": poi_id,
            **data,
        })

    def list_articles(self, page=1, page_size=50):
        """获取文章列表"""
        return self.call_action("article.list", {
            "page": page,
            "pageSize": page_size,
        })

    def update_article(self, article_id, data):
        """更新文章"""
        return self.call_action("article.update", {
            "id": article_id,
            **data,
        })


# ---------------------------------------------------------------------------
# Step 1: 采集公众号文章
# ---------------------------------------------------------------------------

def fetch_articles(config, admin_client, dry_run=False):
    """
    Step 1: 采集公众号文章
    - 调用微信素材管理 API 获取图文消息
    - 提取文章内容
    - 调用 babyplace-seed-v2 入库
    """
    log.info("=" * 50)
    log.info("Step 1: 采集公众号文章")
    log.info("=" * 50)

    wechat_config = config.get("wechat_mp", {})
    app_id = wechat_config.get("app_id", "")
    app_secret = wechat_config.get("app_secret", "")

    if not app_id or app_id.startswith("<"):
        log.warning("微信公众号 app_id 未配置，跳过采集")
        return 0

    mp_client = WechatMPClient(app_id, app_secret)

    try:
        materials = mp_client.fetch_all_materials()
    except Exception as e:
        log.error(f"获取公众号素材失败: {e}")
        return 0

    log.info(f"共获取 {len(materials)} 条图文素材")

    article_count = 0
    for item in materials:
        content_list = item.get("content", {}).get("news_item", [])
        for news_item in content_list:
            try:
                article_data = mp_client.extract_article_content(news_item)
                if not article_data["title"]:
                    continue

                if dry_run:
                    log.info(f"[DRY-RUN] 将入库: {article_data['title']}")
                    article_count += 1
                    continue

                # 调用 seed 入库
                result = admin_client.call_action("seed.upsertPoiBatch", {
                    "articles": [article_data],
                })

                if result.get("code") == 0:
                    article_count += 1
                    log.info(f"文章入库成功: {article_data['title']}")
                else:
                    log.warning(f"文章入库失败: {article_data['title']} - {result.get('message')}")

            except Exception as e:
                log.error(f"处理文章失败: {e}")
                continue

        time.sleep(0.3)  # 避免频率限制

    log.info(f"Step 1 完成: 共入库 {article_count} 篇文章")
    return article_count


# ---------------------------------------------------------------------------
# Step 2: LLM 生成摘要
# ---------------------------------------------------------------------------

def enrich_with_llm(config, admin_client, dry_run=False):
    """
    Step 2: LLM 生成摘要
    - 查询已发布的 POI
    - 收集每个 POI 的关联文章
    - 调用 LLM 生成结构化摘要
    - 更新 POI 的 summary、recommend_reason、notice 字段
    """
    log.info("=" * 50)
    log.info("Step 2: LLM 生成摘要")
    log.info("=" * 50)

    llm_config = config.get("llm", {})
    base_url = llm_config.get("base_url", "")
    api_key = llm_config.get("api_key", "")
    model = llm_config.get("model", "glm-4-flash")

    if not api_key or api_key.startswith("<"):
        log.warning("LLM API Key 未配置，跳过摘要生成")
        return 0

    llm_client = LLMClient(base_url, api_key, model)

    # 获取已发布的 POI
    try:
        result = admin_client.list_pois(page=1, page_size=100)
        pois = result.get("data", {}).get("list", [])
    except Exception as e:
        log.error(f"获取 POI 列表失败: {e}")
        return 0

    log.info(f"共 {len(pois)} 个已发布 POI")

    enriched_count = 0
    for poi in pois:
        poi_id = poi.get("_id")
        poi_name = poi.get("name", "")

        # 跳过已有摘要的 POI
        if poi.get("summary"):
            log.info(f"跳过已有摘要: {poi_name}")
            continue

        # 获取关联文章
        try:
            articles_result = admin_client.call_action("article.listByPoi", {
                "poi_id": poi_id,
            })
            articles = articles_result.get("data", {}).get("list", [])
        except Exception:
            articles = []

        if not articles:
            log.info(f"无关联文章，跳过: {poi_name}")
            continue

        log.info(f"为 {poi_name} 生成摘要（{len(articles)} 篇文章）")

        if dry_run:
            log.info(f"[DRY-RUN] 将生成摘要: {poi_name}")
            enriched_count += 1
            continue

        try:
            summary = llm_client.generate_poi_summary(poi_name, articles)

            # 更新 POI
            update_result = admin_client.update_poi(poi_id, {
                "summary": summary.get("summary", ""),
                "recommend_reason": summary.get("recommend_reason", ""),
                "notice": summary.get("notice", ""),
                "tags": summary.get("tags", []),
            })

            if update_result.get("code") == 0:
                enriched_count += 1
                log.info(f"摘要生成成功: {poi_name}")
            else:
                log.warning(f"摘要更新失败: {poi_name} - {update_result.get('message')}")

        except Exception as e:
            log.error(f"摘要生成失败 {poi_name}: {e}")
            continue

        time.sleep(1)  # 避免 LLM 频率限制

    log.info(f"Step 2 完成: 共生成 {enriched_count} 个摘要")
    return enriched_count


# ---------------------------------------------------------------------------
# Step 3: 同步到 Dify 知识库
# ---------------------------------------------------------------------------

def sync_to_dify(config, admin_client, dry_run=False):
    """
    Step 3: 同步到 Dify 知识库
    - 查询已发布且有摘要的 POI
    - 组装文档文本（名称+地址+摘要+推荐理由）
    - 调用 Dify API 创建/更新文档
    - 记录 dify_document_id
    """
    log.info("=" * 50)
    log.info("Step 3: 同步到 Dify 知识库")
    log.info("=" * 50)

    dify_config = config.get("dify", {})
    api_url = dify_config.get("api_url", "")
    api_key = dify_config.get("dataset_api_key", "")
    dataset_id = dify_config.get("dataset_id", "")

    if not api_key or api_key.startswith("<"):
        log.warning("Dify API Key 未配置，跳过同步")
        return 0

    if not dataset_id or dataset_id.startswith("<"):
        log.warning("Dify dataset_id 未配置，跳过同步")
        return 0

    dify_client = DifyClient(api_url, api_key, dataset_id)

    # 获取已发布且有摘要的 POI
    try:
        result = admin_client.list_pois(page=1, page_size=100)
        pois = result.get("data", {}).get("list", [])
    except Exception as e:
        log.error(f"获取 POI 列表失败: {e}")
        return 0

    # 过滤有摘要的 POI
    pois_with_summary = [p for p in pois if p.get("summary")]
    log.info(f"共 {len(pois_with_summary)} 个有摘要的 POI 待同步")

    synced_count = 0
    for poi in pois_with_summary:
        poi_id = poi.get("_id")
        poi_name = poi.get("name", "")

        # 组装文档文本
        doc_text = _build_document_text(poi)

        if dry_run:
            log.info(f"[DRY-RUN] 将同步: {poi_name}")
            synced_count += 1
            continue

        try:
            existing_doc_id = poi.get("dify_document_id", "")

            if existing_doc_id:
                # 更新现有文档
                dify_client.update_document(
                    existing_doc_id,
                    name=poi_name,
                    text=doc_text,
                    metadata={"poi_id": poi_id},
                )
                log.info(f"文档更新成功: {poi_name}")
            else:
                # 创建新文档
                create_result = dify_client.create_document(
                    name=poi_name,
                    text=doc_text,
                    metadata={"poi_id": poi_id},
                )
                new_doc_id = create_result.get("document", {}).get("id", "")
                if new_doc_id:
                    # 更新 POI 的 dify_document_id
                    admin_client.update_poi(poi_id, {
                        "dify_document_id": new_doc_id,
                    })
                    log.info(f"文档创建成功: {poi_name} (doc_id={new_doc_id})")
                else:
                    log.warning(f"文档创建返回无 ID: {poi_name} - {create_result}")

            # 更新 dify_synced_at
            admin_client.update_poi(poi_id, {
                "dify_synced_at": int(time.time() * 1000),
            })
            synced_count += 1

        except Exception as e:
            log.error(f"Dify 同步失败 {poi_name}: {e}")
            continue

        time.sleep(0.5)  # 避免频率限制

    log.info(f"Step 3 完成: 共同步 {synced_count} 个文档到 Dify")
    return synced_count


def _build_document_text(poi):
    """组装 POI 的 Dify 文档文本"""
    parts = []

    parts.append(f"【{poi.get('name', '')}】")

    address = poi.get("address", "")
    if address:
        parts.append(f"地址: {address}")

    category = poi.get("category", "")
    if category:
        category_map = {
            "park": "公园", "mall": "商场", "playground": "游乐场",
            "museum": "博物馆", "zoo": "动物园", "farm": "农场", "mixed": "综合场馆",
        }
        parts.append(f"类型: {category_map.get(category, category)}")

    summary = poi.get("summary", "")
    if summary:
        parts.append(f"\n摘要: {summary}")

    recommend_reason = poi.get("recommend_reason", "")
    if recommend_reason:
        parts.append(f"推荐理由: {recommend_reason}")

    notice = poi.get("notice", "")
    if notice:
        parts.append(f"注意事项: {notice}")

    tags = poi.get("tags", [])
    if tags:
        parts.append(f"标签: {', '.join(tags)}")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------

def main():
    """数据管线：采集 → 摘要 → 同步"""
    parser = argparse.ArgumentParser(description="遛娃宝地数据管线")
    parser.add_argument("--step", choices=["fetch", "enrich", "sync"],
                        help="只执行指定步骤")
    parser.add_argument("--dry-run", action="store_true",
                        help="干跑模式，不实际执行写入")
    args = parser.parse_args()

    log.info("=" * 60)
    log.info(f"遛娃宝地数据管线启动 - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log.info(f"模式: {'干跑' if args.dry_run else '正式'}")
    log.info(f"步骤: {args.step or '全部'}")
    log.info("=" * 60)

    # 加载配置
    try:
        config = load_config()
    except Exception as e:
        log.error(f"加载配置失败: {e}")
        sys.exit(1)

    # 初始化客户端
    admin_config = config.get("babyplace_admin_url", "")
    seed_secret = config.get("babyplace_seed_secret", "")
    admin_client = BabyplaceAdminClient(admin_config, seed_secret)

    # 执行管线
    try:
        if args.step is None or args.step == "fetch":
            fetch_articles(config, admin_client, dry_run=args.dry_run)

        if args.step is None or args.step == "enrich":
            enrich_with_llm(config, admin_client, dry_run=args.dry_run)

        if args.step is None or args.step == "sync":
            sync_to_dify(config, admin_client, dry_run=args.dry_run)

    except Exception as e:
        log.error(f"管线执行失败: {e}")
        sys.exit(1)

    log.info("=" * 60)
    log.info("数据管线执行完成")
    log.info("=" * 60)


if __name__ == "__main__":
    main()
