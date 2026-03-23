"""
X API トレンド取得スクリプト

仕様は CLAUDE.md の「scripts/fetch_trends.py」セクションを参照。
"""

import json
import os
import shutil
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests

# Bearer Token
BEARER_TOKEN = os.environ.get("X_BEARER_TOKEN", "")
if not BEARER_TOKEN:
    print("Error: X_BEARER_TOKEN is not set")
    sys.exit(1)

# Japan WOEID
JAPAN_WOEID = 23424856

# Paths
PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"
TRENDS_DIR = DATA_DIR / "trends"
SITE_DATA_DIR = PROJECT_ROOT / "docs" / "data"
SITE_TRENDS_DIR = SITE_DATA_DIR / "trends"

JST = timezone(timedelta(hours=9))

AUTH_HEADERS = {"Authorization": f"Bearer {BEARER_TOKEN}"}


def fetch_with_retry(url, params=None, max_retries=3):
    """GETリクエストを送る。429 は exponential backoff でリトライ。"""
    for attempt in range(max_retries):
        try:
            res = requests.get(url, headers=AUTH_HEADERS, params=params, timeout=30)
        except requests.RequestException as e:
            print(f"Network error: {e}", file=sys.stderr)
            return None

        if res.status_code == 200:
            return res
        if res.status_code == 429:
            wait = 2 ** attempt * 5
            print(f"Rate limited. Retrying in {wait}s... (attempt {attempt + 1}/{max_retries})")
            time.sleep(wait)
            continue
        if res.status_code == 401:
            print(f"Error: Authentication failed (401). Check X_BEARER_TOKEN.", file=sys.stderr)
            sys.exit(1)

        # 403/404 などはフォールバック判定用に None を返す
        print(f"HTTP {res.status_code}: {url}", file=sys.stderr)
        return None

    print("Error: Max retries exceeded", file=sys.stderr)
    return None


def fetch_trends_v2():
    """X API v2 でトレンドを取得。失敗時は None を返す。"""
    url = f"https://api.twitter.com/2/trends/by/woeid/{JAPAN_WOEID}"
    params = {"max_trends": 50, "trend.fields": "trend_name,tweet_count"}
    res = fetch_with_retry(url, params=params)
    if res is None:
        return None
    return ("v2", res.json())


def fetch_trends_v1():
    """X API v1.1 でトレンドを取得（フォールバック）。失敗時は None を返す。"""
    url = "https://api.twitter.com/1.1/trends/place.json"
    params = {"id": JAPAN_WOEID}
    res = fetch_with_retry(url, params=params)
    if res is None:
        return None
    return ("v1", res.json())


def normalize(raw_data, api_version):
    """v2/v1.1 のレスポンスを統一フォーマットに変換する。"""
    fetched_at = datetime.now(JST).isoformat()
    trends = []

    if api_version == "v2":
        items = raw_data.get("data", [])
        for i, item in enumerate(items, start=1):
            count = item.get("tweet_count")
            name = item.get("trend_name", "")
            trends.append({
                "rank": i,
                "name": name,
                "tweet_count": count if count else None,
                "google_search_url": f"https://www.google.com/search?q={requests.utils.quote(name)}",
            })
    else:  # v1
        items = raw_data[0].get("trends", []) if raw_data else []
        for i, item in enumerate(items, start=1):
            name = item.get("name", "")
            count = item.get("tweet_volume")
            trends.append({
                "rank": i,
                "name": name,
                "tweet_count": count if count else None,
                "google_search_url": f"https://www.google.com/search?q={requests.utils.quote(name)}",
            })

    return {
        "fetched_at": fetched_at,
        "location": "Japan",
        "woeid": JAPAN_WOEID,
        "trends": trends,
    }


def save_json(data):
    """JSON を data/ と site/data/ に保存する。"""
    TRENDS_DIR.mkdir(parents=True, exist_ok=True)
    SITE_TRENDS_DIR.mkdir(parents=True, exist_ok=True)

    # JST 日付でファイル名を決める
    date_str = datetime.now(JST).strftime("%Y-%m-%d")

    latest = DATA_DIR / "latest.json"
    dated = TRENDS_DIR / f"{date_str}.json"
    site_latest = SITE_DATA_DIR / "latest.json"
    site_dated = SITE_TRENDS_DIR / f"{date_str}.json"

    content = json.dumps(data, ensure_ascii=False, indent=2)

    latest.write_text(content, encoding="utf-8")
    dated.write_text(content, encoding="utf-8")
    shutil.copy2(latest, site_latest)
    shutil.copy2(dated, site_dated)

    print(f"Saved: {latest}")
    print(f"Saved: {dated}")
    print(f"Copied to: {site_latest}")
    print(f"Copied to: {site_dated}")


def main():
    result = fetch_trends_v2()

    if result is None:
        print("v2 failed. Falling back to v1.1...")
        result = fetch_trends_v1()

    if result is None:
        print("Error: Both v2 and v1.1 failed.", file=sys.stderr)
        sys.exit(1)

    api_version, raw_data = result
    print(f"Fetched via API {api_version}")

    data = normalize(raw_data, api_version)
    print(f"Trends: {len(data['trends'])} items")

    save_json(data)
    print("Done.")


if __name__ == "__main__":
    main()
