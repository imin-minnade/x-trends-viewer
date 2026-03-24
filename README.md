# X Trends Viewer

X断ちプロジェクト用、日本のトレンド自動取得 & 閲覧ダッシュボード。

## 概要

- X API で日本のトレンドを **1日1回** 自動取得（毎朝 07:00 JST）
- キーワード別の投稿（バズり順・上位10件）も同時取得
- GitHub Pages で個人用Webサイトとして閲覧
- Xのアプリ・ブラウザは一切開かない。**アルゴリズムに触れずに情報だけ得る**

## アーキテクチャ

```
Google Apps Script (毎朝 07:00 JST)
  ↓ X API からトレンド・キーワード投稿を取得
  ↓ Google Sheets に書き込み（latest / week / 年次シート）

GitHub Pages (静的サイト)
  ↓ Google Sheets の公開 CSV を fetch
  ↓ ブラウザ上で表示
```

データは Google Sheets に蓄積され、フロントエンドが CSV として取得します。

## 機能

| 機能 | 説明 |
|------|------|
| トレンドタブ | 日本のトレンド最大50件。投稿数バー・前日比↑表示 |
| キーワードタブ | 登録キーワード（最大10個）の投稿をバズり順で表示 |
| 表示件数切り替え | 10 / 30 / 50 / 100 件から選択 |
| 日付ナビ | 前日・翌日ボタンまたは日付ピッカーで履歴閲覧 |
| AND検索 | キーワードをスペース区切りで登録するとAND検索 |
| ダークモード | システム設定に自動追従 |

## セットアップ

### 1. X API

1. [X Developer Portal](https://developer.x.com/) でアカウント作成
2. アプリを作成し Bearer Token を取得

### 2. Google Apps Script のセットアップ

詳細は [gas/README.md](./gas/README.md) を参照。

1. Google Sheets で新規スプレッドシートを作成
2. [script.google.com](https://script.google.com) で GAS プロジェクトを作成
3. `gas/Code.js` と `gas/Setup.js` をコピー&ペースト
4. `setProperties()` で Bearer Token と Spreadsheet ID を登録
5. `setupAll()` を実行（シート作成 + トリガー設定）
6. 各シートを「ウェブに公開」で CSV 公開

### 3. フロントエンド設定

`docs/data/sheets-config.template.json` をコピーして `sheets-config.json` にリネームします。

```bash
cp docs/data/sheets-config.template.json docs/data/sheets-config.json
```

各項目に Google Sheets の URL をそのまま貼り付けてください。変換は自動で行われます。

```json
{
  "sheet_id":       "スプレッドシートを開いたときのURL（共有URLでも可）",
  "latest":         "latest シートを開いたときのURL（ブラウザのアドレスバー）",
  "week":           "week シートを開いたときのURL",
  "persons_latest": "persons_latest シートを開いたときのURL",
  "years": {
    "2026": "2026 シートを開いたときのURL"
  }
}
```

> `sheets-config.json` はgitで管理します（GitHub Pages から参照するため）。
> URLは「ウェブに公開」した公開URLなので、gitに含めても問題ありません。
> `sheets-config.template.json` はURL未記入のテンプレートです。
```

### 4. GitHub Pages の設定

Settings > Pages > Source: Deploy from branch `main`, Folder: `/docs`

### 5. 動作確認

GAS エディタで `fetchAndSave()` を手動実行し、Sheets の `latest` シートにデータが書き込まれることを確認。

## キーワードの変更方法

監視したいキーワードは Google Sheets の `keywords` シートを直接編集します。

```
keyword      ← ヘッダー行（削除しないこと）
高市
移民 外交    ← スペース区切りで AND 検索
トランプ
```

- キーワードは最大 10 個
- スペース区切り（全角・半角どちらも可）で AND 検索
- 変更後は翌朝 07:00 の自動実行で反映される
- すぐ反映したい場合は GAS で `fetchAndSave()` を手動実行

> 過去の日付を表示したときは、その日時点のキーワードがタブに表示されます（kw1〜kw10列から復元）。

## コスト

| 項目 | 月額 |
|------|------|
| X API | 従量課金（後述） |
| Google Apps Script | 無料 |
| Google Sheets | 無料 |
| GitHub Pages | 無料 |

### X API コストについて

X API は **Post 1件読み取りごとに課金**されます（Pay-per-use）。

**デフォルト設定（`FETCH_AUTHOR_INFO = false`）の場合:**

- キーワード投稿: $0.005/件 × 10件 × キーワード数 × 30日
- 例: キーワード3個 → **約$4.5/月**

> **[!WARNING]**
> **投稿者名（表示名・@ユーザー名）を取得すると、コストが約3倍になります。**
>
> `gas/Code.js` の先頭にある定数 `FETCH_AUTHOR_INFO` を `true` にすると取得できますが、
> ユーザー情報は Post の約2倍の単価で追加課金されます。
>
> ```javascript
> // デフォルト: false（著者名なし・コスト最小）
> const FETCH_AUTHOR_INFO = false;
>
> // true にすると著者名を表示できるが、コストが約3倍になる
> // const FETCH_AUTHOR_INFO = true;
> ```
>
> **X Developer Console で Spending Limit を設定することを強く推奨します。**
> Console → 「Usage & limits」→ Monthly spending limit を $10 程度に設定してください。

## 開発

開発の詳細は [CLAUDE.md](./CLAUDE.md) を参照。

Data from X API.
