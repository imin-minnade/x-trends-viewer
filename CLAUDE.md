# CLAUDE.md — X トレンド自動取得 & Webビューア

このファイルは Claude Code がプロジェクトのコンテキストを理解するための指示書です。

## プロジェクト概要

60日間のX（Twitter）断ちプロジェクトの一環として、
Xアプリ・ブラウザを一切開かずに日本のトレンド情報だけを
1日1回自動取得し、GitHub Pages 上の個人用Webサイトで閲覧するシステム。

### 設計思想

- **アルゴリズムに触れない**: API でデータだけ取得。タイムラインには一切アクセスしない
- **最小コスト**: X API Pay-per-use。月 $1〜3（1日10円以下）
- **最小運用負荷**: GitHub Actions で1日1回自動実行。手動作業なし
- **GitHub で完結**: ホスティングも CI も GitHub に統一

## アーキテクチャ（ハイブリッド案A+）

```
GitHub Actions (cron: 毎朝 7:00 JST = UTC 22:00)
  1. Python スクリプト実行
     └─ X API: GET /2/trends/by/woeid/23424856 (日本)
  2. JSON ファイルを生成
     └─ data/latest.json        （最新。毎日上書き）
     └─ data/trends/YYYY-MM-DD.json （日付別アーカイブ）
  3. docs/data/ にコピー（GitHub Pages 公開用）
  4. Git commit & push
  → GitHub Pages が自動再デプロイ

GitHub Pages (静的サイト)
  └─ docs/ ディレクトリを公開
  └─ JS が docs/data/*.json を fetch して表示
```

60日後の振り返り時に data/ の JSON を一括でスプレッドシートに流し込んで分析する。

## ディレクトリ構成

```
x-trends-viewer/
├── CLAUDE.md                     ← このファイル
├── README.md                     ← プロジェクト説明
├── .gitignore
├── .github/
│   └── workflows/
│       └── fetch-trends.yml      ← GitHub Actions ワークフロー
├── scripts/
│   ├── fetch_trends.py           ← X API からトレンド取得 → JSON 保存
│   ├── export_to_csv.py          ← 60日後の分析用: JSON → CSV 変換
│   └── requirements.txt          ← Python 依存パッケージ
├── data/
│   ├── latest.json               ← 最新トレンド（毎日上書き）
│   └── trends/
│       └── YYYY-MM-DD.json       ← 日付別アーカイブ
└── docs/                         ← GitHub Pages 公開ディレクトリ
    ├── index.html                ← メインページ
    ├── style.css                 ← スタイル
    ├── app.js                    ← トレンド表示ロジック
    └── data/                     ← Actions が data/ からコピー（公開用）
        ├── latest.json
        └── trends/
```

## 各ファイルの仕様

### scripts/fetch_trends.py

**役割**: X API を呼び出し、日本のトレンドを取得して JSON に保存する。

**入力**: 環境変数 `X_BEARER_TOKEN`

**処理フロー**:
1. X API v2 Trends エンドポイントを呼び出す
   - URL: `https://api.twitter.com/2/trends/by/woeid/23424856`
   - Header: `Authorization: Bearer {token}`
   - Params: `max_trends=50&trend.fields=trend_name,tweet_count`
2. v2 が使えない場合（403/404）は v1.1 にフォールバック
   - URL: `https://api.twitter.com/1.1/trends/place.json?id=23424856`
3. レスポンスを統一フォーマットに整形
4. `data/latest.json` を上書き保存
5. `data/trends/YYYY-MM-DD.json` を作成（JST 日付）
6. `docs/data/` にコピー（GitHub Pages 公開用）

**出力 JSON フォーマット**:
```json
{
  "fetched_at": "2026-04-01T07:00:00+09:00",
  "location": "Japan",
  "woeid": 23424856,
  "trends": [
    {
      "rank": 1,
      "name": "#トレンド名",
      "tweet_count": 12345,
      "google_search_url": "https://www.google.com/search?q=%23トレンド名"
    }
  ]
}
```

**エラーハンドリング**:
- 429 (Rate Limit): exponential backoff で最大3回リトライ
- 401 (Auth Error): エラーメッセージを出力して終了コード 1
- その他のエラー: エラー内容をログ出力して終了コード 1
- GitHub Actions がエラーを検知できるよう、失敗時は必ず非ゼロで終了する

**注意点**:
- v2 のレスポンス形式: `{ "data": [{ "trend_name": "...", "tweet_count": 123 }] }`
- v1.1 のレスポンス形式: `[{ "trends": [{ "name": "...", "tweet_volume": 123 }] }]`
- tweet_count / tweet_volume が null のケースがある
- 日時は JST (UTC+9) で記録する

### scripts/export_to_csv.py

**役割**: 60日後の振り返り用。data/trends/ の全 JSON を1つの CSV にまとめる。

**出力**: `data/all_trends.csv`（日付, 順位, トレンド名, 投稿数）

これは60日後に使うので、最小限の実装でよい。

### scripts/requirements.txt

```
requests>=2.31.0
```

### .github/workflows/fetch-trends.yml

**トリガー**:
- `schedule: cron '0 22 * * *'` (UTC 22:00 = JST 07:00)
- `workflow_dispatch` (手動実行)

**ジョブ**:
1. actions/checkout@v4
2. actions/setup-python@v5 (Python 3.12)
3. pip install -r scripts/requirements.txt
4. python scripts/fetch_trends.py (env: X_BEARER_TOKEN from secrets)
5. git add → git diff --staged --quiet || git commit → git push

**重要**: `git diff --staged --quiet || git commit` で変更がない場合はコミットをスキップ。

### docs/index.html

**機能要件**:
- 今日のトレンド一覧を表示（docs/data/latest.json を fetch）
- 各トレンドの投稿数を横棒バーで視覚化（相対比較）
- 過去の日付を選択して履歴閲覧（date picker → docs/data/trends/YYYY-MM-DD.json）
- レスポンシブデザイン（スマホで朝見る用途）
- ダークモード対応（prefers-color-scheme）
- 取得日時の表示
- フッターに「Data from X API」の表記

**表示要素（1トレンドあたり）**:
- 順位 (1〜50)
- トレンド名
- 投稿数（あれば。横棒バーで相対表示）
- 「Google で検索」リンク

**絶対に守ること**:
- **X（twitter.com / x.com）へのリンクは一切張らない**
- トレンドの詳細は Google 検索に飛ばす
- これがプロジェクトの核心（Xのアルゴリズムに触れないこと）

**デザイン方針**:
- 和文フォント: Noto Sans JP（Google Fonts）
- 情報密度を高く、無駄な装飾なし
- 朝5分で確認できる一覧性を最優先
- ダークモードでは目に優しい配色

**技術スタック**:
- 静的 HTML + Vanilla JS（フレームワーク不要）
- CSS カスタムプロパティでテーマ管理
- fetch API で JSON を読み込み
- 外部ライブラリは Google Fonts のみ

## 開発の進め方

### Phase 1: バックエンド（まずデータを取れるようにする）
1. `scripts/fetch_trends.py` を実装
2. ローカルで動作確認（Bearer Token を環境変数にセット）
3. `.github/workflows/fetch-trends.yml` を実装
4. 手動実行 (workflow_dispatch) でテスト

### Phase 2: フロントエンド（データを表示する）
1. `docs/index.html`, `docs/style.css`, `docs/app.js` を実装
2. テスト用のダミー JSON を docs/data/ に配置して開発
3. レスポンシブ確認

### Phase 3: 結合テスト
1. GitHub Actions 手動実行 → docs/data/ に JSON が配置されるか
2. GitHub Pages でサイトが正しく表示されるか
3. スマホからアクセスして確認

### Phase 4: 補助ツール
1. `scripts/export_to_csv.py` を実装（60日後用。後回しでOK）

## GitHub Pages の設定

- Settings > Pages > Source: 「Deploy from a branch」
- Branch: main, Folder: /site
- これで docs/ ディレクトリが公開される

## セキュリティ

- Bearer Token は絶対にコミットしない
- GitHub Secrets (`X_BEARER_TOKEN`) 経由でのみ使用
- ローカル開発時は `.env` ファイルまたは `export X_BEARER_TOKEN=...`
- `.env` は .gitignore に含めること

## X API 規約の遵守

- サイトに「Data from X API」の表記を入れる
- トレンドデータを改変しない（名前・順位をそのまま表示）
- API から削除されたデータがあれば24時間以内に対応
- Developer Portal のユースケース: "Personal trend monitoring dashboard for Japan trends"
- X の代替サービスを構築する意図はない（個人の情報収集ダッシュボード）

## テスト用ダミーデータ

開発中は以下のようなダミー JSON を `docs/data/latest.json` に置いて使う:

```json
{
  "fetched_at": "2026-04-01T07:00:00+09:00",
  "location": "Japan",
  "woeid": 23424856,
  "trends": [
    { "rank": 1, "name": "#テスト", "tweet_count": 50000, "google_search_url": "https://www.google.com/search?q=%23テスト" },
    { "rank": 2, "name": "サンプルトレンド", "tweet_count": 30000, "google_search_url": "https://www.google.com/search?q=サンプルトレンド" },
    { "rank": 3, "name": "#ダミーデータ", "tweet_count": null, "google_search_url": "https://www.google.com/search?q=%23ダミーデータ" }
  ]
}
```
