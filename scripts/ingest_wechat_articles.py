#!/usr/bin/env python3
"""Fetch WeChat articles, export Markdown, extract POIs with an Anthropic-compatible LLM, then enrich SQLite POIs."""
import argparse
import datetime as dt
import html
import json
import os
import re
import sqlite3
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from amap_enrich_poi import get_poi, query_amap_rich, upsert_poi

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = Path(r'C:\Users\Admin\a-weekend-kids\.env')
DEFAULT_DB = PROJECT_ROOT / 'server' / 'data' / 'babyplace.db'
DEFAULT_VAULT = Path(r'C:\Users\Admin\Documents\MyVault\22.workbuddy专栏\周末遛娃派')


def read_env(path):
    result = {}
    for raw in path.read_text(encoding='utf-8').splitlines():
        if not raw.strip() or raw.lstrip().startswith('#') or '=' not in raw:
            continue
        key, value = raw.split('=', 1)
        result[key.strip()] = value.strip()
    return result


def request_json(url, headers=None, body=None):
    request_headers = {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36',
    }
    request_headers.update(headers or {})
    request = urllib.request.Request(url, data=body, headers=request_headers)
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode('utf-8'))


def strip_html(value):
    value = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', value or '', flags=re.I | re.S)
    value = re.sub(r'<[^>]+>', ' ', value)
    return re.sub(r'\s+', ' ', html.unescape(value)).strip()


def fetch_articles(config, page_size):
    base = config.get('WECHAT_API_BASE', 'https://down.dwqjk.top').rstrip('/')
    key = config.get('x-auth-key') or config.get('WECHAT_AUTH_KEY')
    fakeids = [item.strip() for item in config.get('MPTEXT_FAKEIDS', '').split(',') if item.strip()]
    if not key or not fakeids:
        raise RuntimeError('x-auth-key and MPTEXT_FAKEIDS are required')
    for fakeid in fakeids:
        query = urllib.parse.urlencode({'id': fakeid, 'begin': 0, 'size': page_size})
        payload = request_json(f'{base}/api/web/mp/appmsgpublish?{query}', {'X-Auth-Key': key})
        if payload.get('base_resp', {}).get('ret') != 0:
            raise RuntimeError(f'article list failed: {fakeid}')
        page = json.loads(payload.get('publish_page') or '{}')
        for item in page.get('publish_list', []):
            info = item.get('publish_info')
            if not info:
                continue
            for article in json.loads(info).get('appmsgex', []):
                if article.get('link'):
                    yield fakeid, article


def fetch_article_content(config, article_url):
    base = config.get('WECHAT_API_BASE', 'https://down.dwqjk.top').rstrip('/')
    query = urllib.parse.urlencode({'url': article_url, 'format': 'json'})
    return request_json(f'{base}/api/public/v1/download?{query}')


def extract_pois(config, title, content):
    prompt = ('判断文章是否推荐亲子游玩、遛娃或家庭出行场所。招聘、政策、学校招生、房产、纯新闻一律不是。'
              '若相关，提取可被高德地图定位的具体场所名称，排除泛称、城市和非地点。'
              '仅返回 JSON：{"is_relevant":true,"poi_names":[...],"confidence":0-1,"evidence":"原文短句"}。\n\n'
              f'标题：{title}\n内容：{content[:6000]}')
    endpoint = config['LLM_BASE_URL'].rstrip('/') + '/v1/messages'
    payload = json.dumps({'model': config.get('LLM_MODEL', 'deepseek-v4-flash'), 'max_tokens': 800,
                          'temperature': 0, 'messages': [{'role': 'user', 'content': prompt}]}).encode()
    data = request_json(endpoint, {'x-api-key': config['LLM_API_KEY'], 'anthropic-version': '2023-06-01',
                                   'content-type': 'application/json'}, payload)
    raw = ''.join(item.get('text', '') for item in data.get('content', []) if item.get('type') == 'text').strip()
    raw = re.sub(r'^```(?:json)?\s*|\s*```$', '', raw, flags=re.I)
    parsed = json.loads(raw)
    names = list(dict.fromkeys(name.strip() for name in parsed.get('poi_names', []) if isinstance(name, str) and name.strip()))
    return bool(parsed.get('is_relevant')), names, float(parsed.get('confidence') or 0), str(parsed.get('evidence') or '')


def ensure_schema(conn):
    columns = {row[1] for row in conn.execute('PRAGMA table_info(poi)')}
    if 'sort_order' not in columns:
        conn.execute('ALTER TABLE poi ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0')
    conn.execute('CREATE INDEX IF NOT EXISTS idx_poi_sort_order ON poi(sort_order DESC, created_at DESC)')


def save_article(conn, article, content, names, confidence):
    now = int(time.time() * 1000)
    url = article['link']
    row = conn.execute('SELECT id FROM article WHERE url = ?', (url,)).fetchone()
    if row:
        article_id = row[0]
        conn.execute('UPDATE article SET content_text=?, content_html=?, extracted_poi_names=?, parse_confidence=?, status=?, updated_at=? WHERE id=?',
                     (strip_html(content), content, json.dumps(names, ensure_ascii=False), confidence, 'parsed', now, article_id))
        return article_id
    article_id = f'{now:x}{abs(hash(url)) & 0xffffffff:08x}'
    conn.execute('INSERT INTO article (id,title,source_account_id,publish_time,url,cover_image,content_text,content_html,images,local_images,extracted_poi_names,parse_result,status,parse_confidence,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                 (article_id, article.get('title', ''), article.get('fakeid', ''), int(article.get('create_time') or 0) * 1000, url,
                  article.get('cover', ''), strip_html(content), content, '[]', '[]', json.dumps(names, ensure_ascii=False), '{}', 'parsed', confidence, now, now))
    return article_id


def export_markdown(vault, article, content, names):
    vault.mkdir(parents=True, exist_ok=True)
    date = dt.datetime.fromtimestamp(int(article.get('create_time') or time.time())).strftime('%Y-%m-%d')
    safe_title = re.sub(r'[\\/:*?"<>|]', '_', article.get('title', 'untitled'))[:120]
    frontmatter = {'title': article.get('title', ''), 'source_url': article.get('link', ''), 'poi_names': names}
    (vault / f'{date} {safe_title}.md').write_text('---\n' + json.dumps(frontmatter, ensure_ascii=False, indent=2) + '\n---\n\n# ' + article.get('title', '') + '\n\n' + content + '\n', encoding='utf-8')


def enrich_pois(conn, names, article_id, confidence, evidence, dry_run):
    for name in names:
        amap, error = query_amap_rich(name, '广州')
        if error:
            print(f'  skip {name}: {error}')
            continue
        existing = get_poi(conn.cursor(), name, '广州')
        action, _, poi_id = upsert_poi(conn.cursor(), conn, amap, existing, dry_run)
        if action == 'created' and not dry_run:
            next_order = conn.execute('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM poi').fetchone()[0]
            conn.execute('UPDATE poi SET status=?, sort_order=? WHERE id=?', ('published', next_order, poi_id))
        if poi_id and not dry_run:
            now = int(time.time() * 1000)
            conn.execute('INSERT OR IGNORE INTO content_source (id,poi_id,article_id,source_type,quoted_text,support_fields,confidence_score,is_primary,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                         (f'{now:x}{abs(hash((poi_id, article_id))) & 0xffffffff:08x}', poi_id, article_id, 'article', evidence, '["name"]', confidence, 0, 'pending', now, now))
            conn.commit()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=Path, default=DEFAULT_CONFIG)
    parser.add_argument('--db', type=Path, default=DEFAULT_DB)
    parser.add_argument('--limit', type=int, default=20)
    parser.add_argument('--max-articles', type=int, default=0, help='0 means no limit')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    config = read_env(args.config)
    for name in ('LLM_BASE_URL', 'LLM_API_KEY'):
        if not config.get(name): raise RuntimeError(f'{name} is required')
    db_path = Path(config.get('BABYPLACE_DB_PATH', str(args.db)))
    conn = sqlite3.connect(db_path)
    ensure_schema(conn)
    seen = set()
    processed = 0
    for fakeid, article in fetch_articles(config, args.limit):
        if article['link'] in seen: continue
        if args.max_articles and processed >= args.max_articles: break
        seen.add(article['link']); article['fakeid'] = fakeid
        detail = fetch_article_content(config, article['link'])
        content = detail.get('content_noencode') or detail.get('content') or ''
        relevant, names, confidence, evidence = extract_pois(config, article.get('title', ''), strip_html(content))
        print(f"{article.get('title', '')}: {'relevant' if relevant else 'ignored'}, {len(names)} POIs")
        processed += 1
        if args.dry_run: continue
        article_id = save_article(conn, article, content, names, confidence)
        export_markdown(Path(config.get('OBSIDIAN_OUTPUT_DIR', str(DEFAULT_VAULT))), article, content, names)
        if relevant and confidence >= 0.85:
            enrich_pois(conn, names, article_id, confidence, evidence, False)
        conn.commit()


if __name__ == '__main__':
    main()
