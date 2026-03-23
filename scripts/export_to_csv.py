"""
60日後の振り返り用: data/trends/ の全 JSON → CSV 変換

使い方:
  python scripts/export_to_csv.py

出力: data/all_trends.csv（日付, 順位, トレンド名, 投稿数）
"""

import csv
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
ROOT_DIR = SCRIPT_DIR.parent
TRENDS_DIR = ROOT_DIR / "data" / "trends"
OUTPUT_CSV = ROOT_DIR / "data" / "all_trends.csv"


def main():
    json_files = sorted(TRENDS_DIR.glob("*.json"))

    if not json_files:
        print(f"JSONファイルが見つかりません: {TRENDS_DIR}", file=sys.stderr)
        sys.exit(1)

    total_rows = 0

    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["date", "rank", "name", "tweet_count"])

        for json_file in json_files:
            date = json_file.stem  # YYYY-MM-DD

            try:
                with json_file.open(encoding="utf-8") as jf:
                    data = json.load(jf)
            except (json.JSONDecodeError, OSError) as e:
                print(f"スキップ: {json_file.name} — {e}", file=sys.stderr)
                continue

            for trend in data.get("trends", []):
                tweet_count = trend.get("tweet_count")
                writer.writerow([
                    date,
                    trend.get("rank", ""),
                    trend.get("name", ""),
                    tweet_count if tweet_count is not None else "",
                ])
                total_rows += 1

    print(f"完了: {len(json_files)} 日分, {total_rows} 件 → {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
