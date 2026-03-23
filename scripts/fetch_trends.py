"""
X API トレンド取得スクリプト

仕様は CLAUDE.md の「scripts/fetch_trends.py」セクションを参照。

TODO: Claude Code で以下を実装
  1. X API v2 Trends エンドポイントの呼び出し
  2. v1.1 へのフォールバック
  3. 統一フォーマットへの変換
  4. JSON ファイルの保存（data/ と site/data/ の両方）
  5. エラーハンドリング（リトライ、終了コード）
"""

import os
import sys

# Bearer Token
BEARER_TOKEN = os.environ.get("X_BEARER_TOKEN", "")
if not BEARER_TOKEN:
    print("Error: X_BEARER_TOKEN is not set")
    sys.exit(1)

# Japan WOEID
JAPAN_WOEID = 23424856

# Paths
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
TRENDS_DIR = os.path.join(DATA_DIR, "trends")
SITE_DATA_DIR = os.path.join(PROJECT_ROOT, "site", "data")
SITE_TRENDS_DIR = os.path.join(SITE_DATA_DIR, "trends")


def fetch_trends_v2():
    """X API v2 でトレンドを取得。失敗時は None を返す。"""
    # TODO: 実装
    raise NotImplementedError


def fetch_trends_v1():
    """X API v1.1 でトレンドを取得（フォールバック）。失敗時は None を返す。"""
    # TODO: 実装
    raise NotImplementedError


def normalize(raw_data, api_version):
    """v2/v1.1 のレスポンスを統一フォーマットに変換する。"""
    # TODO: 実装
    raise NotImplementedError


def save_json(data):
    """JSON を data/ と site/data/ に保存する。"""
    # TODO: 実装
    raise NotImplementedError


def main():
    # TODO: 実装
    # 1. fetch_trends_v2() を試す
    # 2. 失敗したら fetch_trends_v1() にフォールバック
    # 3. normalize() で統一フォーマットに変換
    # 4. save_json() で保存
    print("TODO: implement main()")
    sys.exit(1)


if __name__ == "__main__":
    main()
