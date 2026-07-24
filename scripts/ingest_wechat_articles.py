#!/usr/bin/env python3
"""Fetch WeChat articles, export Markdown, extract POIs with an Anthropic-compatible LLM, then enrich SQLite POIs."""
import argparse
import datetime as dt
import html
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.error
import urllib.request
from pathlib import Path

from bs4 import BeautifulSoup

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = PROJECT_ROOT / '.env'
DEFAULT_DB = PROJECT_ROOT / 'server' / 'data' / 'babyplace.db'
DEFAULT_VAULT = PROJECT_ROOT.parent / 'ob-vault' / '22.workbuddy专栏' / '周末遛娃派'


def read_env(path):
    result = {}
    for raw in path.read_text(encoding='utf-8').splitlines():
        if not raw.strip() or raw.lstrip().startswith('#') or '=' not in raw:
            continue
        key, value = raw.split('=', 1)
        result[key.strip()] = value.strip()
    return result


def request_json(url, headers=None, body=None, retries=3):
    return json.loads(request_text(url, headers, body, retries))


def request_text(url, headers=None, body=None, retries=3):
    request_headers = {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36',
    }
    request_headers.update(headers or {})
    request = urllib.request.Request(url, data=body, headers=request_headers)
    last_error = None
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read().decode('utf-8')
        except urllib.error.HTTPError as error:
            last_error = error
            if error.code not in (429, 500, 502, 503, 504) or attempt == retries:
                raise
        except urllib.error.URLError as error:
            last_error = error
            if attempt == retries:
                raise
        time.sleep(min(2 ** attempt, 8))
    raise last_error


def parse_wechat_html(value):
    """Extract a cleaned WeChat article fragment and LLM-ready plain text.

    The Worker deliberately returns raw HTML on the free plan to avoid spending
    its 10ms CPU budget on DOM parsing. BeautifulSoup performs that work here,
    where the batch job has normal Python CPU time available.
    """
    soup = BeautifulSoup(value or '', 'html.parser')
    article = soup.select_one('#js_article') or soup.select_one('#js_content') or soup.body or soup

    for selector in (
        '#js_top_ad_area', '#js_tags_preview_toast', '#content_bottom_area',
        '#js_pc_qr_code', '#wx_stream_article_slide_tip',
    ):
        for node in article.select(selector):
            node.decompose()

    for node in article.select('script, style, noscript'):
        node.decompose()

    content = article.select_one('#js_content')
    if content:
        content.attrs.pop('style', None)

    for image in article.select('img'):
        source = image.get('data-src') or image.get('src')
        if source:
            image['src'] = source

    for line_break in article.select('br'):
        line_break.replace_with('\n')
    text = article.get_text('\n', strip=True)
    text = re.sub(r'\n[ \t]*\n+', '\n\n', html.unescape(text)).strip()
    return str(article), text


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
    query = urllib.parse.urlencode({'url': article_url, 'format': 'html'})
    return request_text(f'{base}/api/public/v1/download?{query}')


def _extract_llm_text(data):
    """Pull text from an Anthropic-compatible content array.

    Prefers ``type: text`` blocks.  Falls back to ``type: thinking`` blocks
    (some DeepSeek deployments return the final answer inside a thinking
    block when the model routes through a reasoning-only path).
    """
    text_blocks = [item.get('text', '') for item in data.get('content', []) if item.get('type') == 'text']
    if text_blocks:
        return ''.join(text_blocks).strip()
    thinking_blocks = [item.get('thinking', '') for item in data.get('content', []) if item.get('type') == 'thinking']
    return ''.join(thinking_blocks).strip()


def _safe_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def extract_pois(config, title, content):
    prompt = ('判断文章是否推荐亲子游玩、遛娃或家庭出行场所。招聘、政策、学校招生、房产、纯新闻一律不是。'
              '若相关，提取可被高德地图定位的具体场所名称，排除泛称、城市和非地点。'
              '仅返回 JSON：{"is_relevant":true,"poi_names":[...],"confidence":0-1,"evidence":"原文短句"}。\n\n'
              f'标题：{title}\n内容：{content[:6000]}')
    endpoint = config['LLM_BASE_URL'].rstrip('/') + '/v1/messages'
    payload = json.dumps({'model': config.get('LLM_MODEL', 'deepseek-v4-flash'), 'max_tokens': 800,
                          'temperature': 0, 'messages': [{'role': 'user', 'content': prompt}]}).encode()
    try:
        data = request_json(endpoint, {'x-api-key': config['LLM_API_KEY'], 'anthropic-version': '2023-06-01',
                                       'content-type': 'application/json'}, payload)
    except Exception as exc:
        print(f'  LLM request failed: {exc}')
        return False, [], 0.0, ''
    raw = _extract_llm_text(data)
    if not raw:
        print(f'  LLM returned no text/thinking block — treating as ignored')
        return False, [], 0.0, ''
    raw = re.sub(r'^```(?:json)?\s*|\s*```$', '', raw, flags=re.I)
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f'  LLM JSON parse failed: {exc} — raw: {raw[:200]}')
        return False, [], 0.0, ''
    names = list(dict.fromkeys(name.strip() for name in parsed.get('poi_names', []) if isinstance(name, str) and name.strip()))
    return bool(parsed.get('is_relevant')), names, _safe_float(parsed.get('confidence'), 0.0), str(parsed.get('evidence') or '')


def load_sync_state(vault):
    path = vault / '.wechat-sync-state.json'
    if not path.exists():
        return path, {}
    return path, json.loads(path.read_text(encoding='utf-8'))


def export_markdown(vault, article, content, names, confidence, relevant, evidence):
    vault.mkdir(parents=True, exist_ok=True)
    date = dt.datetime.fromtimestamp(int(article.get('create_time') or time.time())).strftime('%Y-%m-%d')
    safe_title = re.sub(r'[\\/:*?"<>|]', '_', article.get('title', 'untitled'))[:120]
    frontmatter = {
        'title': article.get('title', ''), 'source_url': article.get('link', ''),
        'poi_names': names, 'poi_confidence': confidence, 'is_kid_friendly': relevant,
        'poi_evidence': evidence,
    }
    filename = f'{date} {safe_title}.md'
    (vault / filename).write_text('---\n' + json.dumps(frontmatter, ensure_ascii=False, indent=2) + '\n---\n\n# ' + article.get('title', '') + '\n\n' + content + '\n', encoding='utf-8')
    return filename


def enrich_pois(config, names, dry_run):
    for name in names:
        command = [sys.executable, str(PROJECT_ROOT / 'scripts' / 'amap_enrich_poi.py'), name]
        if dry_run:
            command.append('--dry-run')
        child_env = os.environ.copy()
        child_env['DB_PATH'] = config.get('BABYPLACE_DB_PATH', str(DEFAULT_DB))
        child_env['AMAP_KEY'] = config['AMAP_KEY']
        result = subprocess.run(command, env=child_env, text=True, capture_output=True)
        if result.returncode:
            print(f'  POI failed {name}: {result.stderr.strip() or result.stdout.strip()}')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=Path, default=DEFAULT_CONFIG)
    parser.add_argument('--limit', type=int, default=20)
    parser.add_argument('--max-articles', type=int, default=0, help='0 means no limit')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    config = read_env(args.config)
    for name in ('LLM_BASE_URL', 'LLM_API_KEY'):
        if not config.get(name): raise RuntimeError(f'{name} is required')
    if not config.get('AMAP_KEY'):
        raise RuntimeError('AMAP_KEY is required')
    vault = Path(config.get('OBSIDIAN_OUTPUT_DIR', str(DEFAULT_VAULT)))
    state_path, state = load_sync_state(vault)
    seen = set()
    processed = 0
    failed = 0
    for fakeid, article in fetch_articles(config, args.limit):
        if article['link'] in seen or article['link'] in state: continue
        if args.max_articles and processed >= args.max_articles: break
        seen.add(article['link']); article['fakeid'] = fakeid
        try:
            content = fetch_article_content(config, article['link'])
        except (urllib.error.HTTPError, urllib.error.URLError) as error:
            failed += 1
            print(f"{article.get('title', '')}: download failed ({error}), will retry next run")
            continue
        cleaned_html, article_text = parse_wechat_html(content)
        relevant, names, confidence, evidence = extract_pois(config, article.get('title', ''), article_text)
        print(f"{article.get('title', '')}: {'relevant' if relevant else 'ignored'}, {len(names)} POIs")
        processed += 1
        if args.dry_run: continue
        filename = export_markdown(vault, article, cleaned_html, names, confidence, relevant, evidence)
        state[article['link']] = {'file': filename, 'synced_at': dt.datetime.now(dt.timezone.utc).isoformat()}
        state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        if relevant and confidence >= 0.85:
            enrich_pois(config, names, False)

    if failed:
        print(f'Finished with {failed} download failures; failed URLs were not marked as synced.')


if __name__ == '__main__':
    main()
