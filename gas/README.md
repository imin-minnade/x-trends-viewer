# GAS セットアップ手順

## 概要

Google Apps Script (GAS) を使って毎朝 07:00 JST に X API からデータを取得し、
Google Sheets に書き込みます。

## ファイル構成

```
gas/
├── Code.js    メインロジック（トレンド取得・Sheets書き込み）
└── Setup.js   初回セットアップ用ユーティリティ
```

## Sheets 構成

| シート名 | 内容 | 更新方式 |
|---------|------|---------|
| `keywords` | 監視キーワード一覧（最大10個） | 手動編集 |
| `latest` | 当日データのみ | 毎日上書き |
| `week` | 直近7日分 | 毎日洗い替え |
| `2026` `2027`... | 年次アーカイブ | 毎日追記 |

## セットアップ手順

### 1. Google Sheets を準備

1. Google Sheets で新規スプレッドシートを作成
2. URL から Spreadsheet ID をコピー
   ```
   https://docs.google.com/spreadsheets/d/{この部分}/edit
   ```

### 2. GAS プロジェクトを作成

1. [script.google.com](https://script.google.com) を開く
2. 「新しいプロジェクト」を作成
3. `Code.js` と `Setup.js` の内容をそれぞれのファイルにコピー&ペースト
   - デフォルトの `コード.gs` を `Code.js` にリネーム
   - 「+」ボタンでファイルを追加して `Setup.js` を作成

### 3. Bearer Token と Sheet ID を登録

1. `Setup.js` の `setProperties()` 関数内の値を書き換える
   ```javascript
   X_BEARER_TOKEN: '実際のBearer Token',
   SHEET_ID:       'コピーしたSpreadsheet ID',
   ```
2. `setProperties()` を実行
3. **必ず元の `YOUR_...` に戻す**（コードをコミットしないよう注意）

### 4. シートとトリガーを初期化

1. `setupAll()` を実行
   - `keywords`, `latest`, `week`, `2026` シートが自動作成される
   - 毎朝 07:00 JST のトリガーが設定される

### 5. 動作確認

1. `fetchAndSave()` を手動実行
2. Sheets の `latest` シートにデータが書き込まれることを確認

## キーワードの変更方法

Sheets の `keywords` シートを直接編集するだけです。

```
keyword  ← ヘッダー行（削除しないこと）
高市
移民 外交   ← スペース区切りで AND 検索
トランプ
```

- 最大10キーワードまで
- スペース区切り（全角・半角どちらも可）でAND検索
- 変更後は翌朝 07:00 の自動実行で反映される
- すぐ反映したい場合は `fetchAndSave()` を手動実行

## Sheets を公開 CSV として公開する

フロントエンドから fetch するために各シートを公開します。

1. Sheets のメニュー「ファイル」→「ウェブに公開」
2. 「リンク」タブで各シートを「カンマ区切り形式（.csv）」で公開
3. 生成された URL をフロントエンドの設定ファイルに記載

各シートの CSV URL 形式：
```
https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID}
```

`gid` は各シートのタブを右クリック →「シートIDをコピー」で取得できます。

### フロントエンド設定ファイルを更新する

リポジトリの `docs/data/sheets-config.json` を編集して、各シートのCSV URLを記載します。

```json
{
  "latest": "https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={LATEST_GID}",
  "week":   "https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={WEEK_GID}",
  "years": {
    "2026": "https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={2026_GID}"
  }
}
```

設定後、`git add docs/data/sheets-config.json && git commit && git push` でデプロイしてください。

#### 日付別のシート振り分けロジック

| 対象日 | 使用シート |
|--------|-----------|
| 今日 | `latest` |
| 1〜7日前 | `week` |
| 8日以上前 | `{year}`（例: `2026`） |

年が変わって新しいシートが作成されたら、`years` に年を追加してください。
