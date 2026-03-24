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
  3. site/data/ にコピー（GitHub Pages 公開用）
  4. Git commit & push
  → GitHub Pages が自動再デプロイ

GitHub Pages (静的サイト)
  └─ site/ ディレクトリを公開
  └─ JS が site/data/*.json を fetch して表示
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
└── site/                         ← GitHub Pages 公開ディレクトリ
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
6. `site/data/` にコピー（GitHub Pages 公開用）

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

### site/index.html

**機能要件**:
- 今日のトレンド一覧を表示（site/data/latest.json を fetch）
- 各トレンドの投稿数を横棒バーで視覚化（相対比較）
- 過去の日付を選択して履歴閲覧（date picker → site/data/trends/YYYY-MM-DD.json）
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
1. `site/index.html`, `site/style.css`, `site/app.js` を実装
2. テスト用のダミー JSON を site/data/ に配置して開発
3. レスポンシブ確認

### Phase 3: 結合テスト
1. GitHub Actions 手動実行 → site/data/ に JSON が配置されるか
2. GitHub Pages でサイトが正しく表示されるか
3. スマホからアクセスして確認

### Phase 4: 補助ツール
1. `scripts/export_to_csv.py` を実装（60日後用。後回しでOK）

## GitHub Pages の設定

- Settings > Pages > Source: 「Deploy from a branch」
- Branch: main, Folder: /site
- これで site/ ディレクトリが公開される

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

開発中は以下のようなダミー JSON を `site/data/latest.json` に置いて使う:

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

---

## X API v2 リファレンス

### クレジット消費の仕組み

- **従量課金（Pay-per-use）**: クレジットを事前購入し、リクエストごとに消費
- エンドポイントごとに単価が異なる。正確な単価は Developer Console で確認
- 参考値（2026年2月時点）: Post読み取り $0.005/件、ユーザー情報 $0.010/件
- **重複排除**: 同じリソースを24時間UTC日内で複数回取得しても1回分の課金
- エラーレスポンス（データを返さない失敗）は課金されない
- **月間上限**: Pay-per-use は月200万Post読み取りが上限（このプロジェクトでは無関係）
- **推奨設定**: Spending limit $5/月、Auto-recharge OFF

### Trends エンドポイント

```
GET /2/trends/by/woeid/{woeid}
Authorization: Bearer {BEARER_TOKEN}
```

| パラメータ | 型 | デフォルト | 説明 |
|-----------|------|-----------|------|
| `woeid` | int (path, 必須) | — | 場所の WOEID。日本 = `23424856` |
| `max_trends` | int (query) | 20 | 取得件数。1〜50 |
| `trend.fields` | string[] (query) | — | `trend_name`, `tweet_count` |

レスポンス:
```json
{
  "data": [
    { "trend_name": "#桜開花", "tweet_count": 128500 },
    { "trend_name": "新年度", "tweet_count": 95200 }
  ]
}
```

主要な WOEID: 全世界=1, 日本=23424856, 東京=1118370, 大阪=15015370

### Search Posts エンドポイント（将来の拡張用）

```
# 直近7日間（全開発者利用可）
GET /2/tweets/search/recent?query={query}

# 全期間（Pay-per-use / Enterprise のみ）
GET /2/tweets/search/all?query={query}
```

**重要: Search は Post 単位で課金される。Trends（集計データ）とは桁違いにコストがかかる可能性がある。**

### 検索演算子クイックリファレンス

#### 「高市」と「#高市」の違い

| クエリ | マッチ対象 |
|--------|-----------|
| `高市` | 本文に「高市」を含むすべてのPost |
| `#高市` | ハッシュタグ `#高市` を含むPostのみ |
| `"高市早苗"` | フレーズ完全一致 |
| `高市 早苗` | 「高市」AND「早苗」の両方を含む（語順不問） |

- `keyword` は Post 本文のトークン化マッチ（部分的に含めばヒット）
- `#` はハッシュタグの完全一致（本文に単語として含むだけではヒットしない）

#### 特定人物のPost取得例（高市早苗 @takaichi_sanae）

```
# 本人の投稿だけ
from:takaichi_sanae

# 本人の投稿（リツイート除外）
from:takaichi_sanae -is:retweet

# 本人 + 本人への返信
from:takaichi_sanae OR to:takaichi_sanae

# 本人の投稿 + メンション + キーワード（広範囲）
from:takaichi_sanae OR @takaichi_sanae OR "高市早苗"

# 高市早苗について日本語で書かれたPost（リツイート除外）
"高市早苗" lang:ja -is:retweet
```

**コスト注意**: `from:ユーザー名` は本人の投稿数に限られるため安い（1日数件〜数十件）。
一方、`"高市早苗"` のようなキーワード検索は大量ヒットの可能性があり、
返ってきた Post 1件ごとに課金される。`max_results` を小さく設定すること。

#### スタンドアロン演算子（単独使用可）

| 演算子 | 説明 | 例 |
|--------|------|-----|
| keyword | テキストのトークンマッチ | `python` |
| "phrase" | フレーズ完全一致 | `"machine learning"` |
| # | ハッシュタグ完全一致 | `#AI` |
| @ | メンション | `@xdevelopers` |
| from: | 特定ユーザーのPost | `from:xdevelopers` |
| to: | 特定ユーザーへの返信 | `to:xdevelopers` |
| retweets_of: | 特定ユーザーのRT | `retweets_of:xdevelopers` |
| url: | URLを含むPost | `url:"example.com"` |
| context: | ドメイン/エンティティペア | `context:10.799...` |
| entity: | エンティティ文字列 | `entity:"Michael Jordan"` |
| list: | リストメンバーのPost | `list:123` |
| place: | 場所タグ付きPost | `place:"tokyo"` |
| place_country: | 国コード | `place_country:JP` |

#### 結合必須演算子（スタンドアロンと組み合わせて使用）

| 演算子 | 説明 | 例 |
|--------|------|-----|
| is:retweet | リツイート | `-is:retweet`（除外に多用） |
| is:reply | リプライ | `-is:reply` |
| is:quote | 引用ツイート | `is:quote` |
| is:verified | 認証済みユーザー | `is:verified` |
| has:media | メディア付き | `has:media` |
| has:images | 画像付き | `has:images` |
| has:links | リンク付き | `has:links` |
| has:hashtags | ハッシュタグ付き | `has:hashtags` |
| has:geo | 位置情報付き | `has:geo` |
| lang: | 言語（BCP 47） | `lang:ja` |

#### ブーリアン論理

```
# OR（いずれか）
cat OR dog

# AND（スペース区切り = 暗黙の AND）
cat dog

# NOT（除外）
cat -grumpy

# グルーピング
(cat OR dog) -is:retweet lang:ja
```

#### クエリ長の制限

| アクセスレベル | Recent Search | Full-Archive |
|--------------|--------------|-------------|
| Self-serve | 512文字 | 1,024文字 |
| Enterprise | 4,096文字 | 4,096文字 |

### レート制限

- 15分間のローリングウィンドウ単位
- レスポンスヘッダで確認:
  - `x-rate-limit-limit`: 上限
  - `x-rate-limit-remaining`: 残り
  - `x-rate-limit-reset`: リセット時刻（UTC epoch秒）
- 超過すると HTTP 429 が返る
- **リトライ**: exponential backoff（1秒→2秒→4秒、最大3回）

### 認証

- **Bearer Token（App-only）**: 公開データの読み取り専用。今回はこれだけで十分
- OAuth 1.0a / OAuth 2.0: 投稿・いいね・フォロー等の書き込みに必要。今回は不要

### 設計上の注意

- **v2 はデフォルトで最小限のデータしか返さない。** `trend.fields=trend_name,tweet_count` のようにフィールドを明示的に指定する
- **tweet_count は null の場合がある。** フロントエンドでは「—」と表示し、棒グラフではバーを非表示にする
- **GitHub Actions の cron は数分〜数十分の遅延がある。** 日次取得には問題なし
- **Xへのリンクは絶対に張らない。** 詳細リンクは Google 検索に向ける

### 参考リンク

- API ドキュメント: https://docs.x.com/x-api/introduction
- Trends: https://docs.x.com/x-api/trends/get-trends-by-woeid
- Search: https://docs.x.com/x-api/posts/search/introduction
- 検索演算子: https://docs.x.com/x-api/posts/search/integrate/operators
- クエリ構築: https://docs.x.com/x-api/posts/search/integrate/build-a-query
- Fields: https://docs.x.com/x-api/fundamentals/fields
- レート制限: https://docs.x.com/x-api/fundamentals/rate-limits
- 課金: https://docs.x.com/x-api/fundamentals/post-cap
- Developer Console: https://console.x.com
