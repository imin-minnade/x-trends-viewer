# X Trends Viewer

## X断ちプロジェクト用、日本のトレンド自動取得 & 閲覧ダッシュボード。

## ミッション

X（旧Twitter）のアプリを使うとき、ユーザーは情報を「無料」で受け取っているように見える。
しかし実際には、自分の時間・注意・行動データを X に差し出している。
アルゴリズムが「おすすめ」を選び、タイムラインを構成し、通知で呼び戻す。
ユーザーは能動的に情報を取りに行っているのではなく、**アルゴリズムに情報を流し込まれている**。

これは無料ではない。**自由と引き換えにしている。**

一方、X API は1投稿あたり約$0.005の従量課金だ。
お金を払うことで、アルゴリズムも広告も滞在時間の搾取もなく、**データだけを買う**関係が成立する。

このプロジェクトはその構造を意図的に使う。
API でデータを取得し、自分が作った画面で、自分が選んだ情報だけを見る。
**何を見るかを、アルゴリズムではなく自分が決める。**

## コスト

**GAS・Google Sheets・GitHub Pages はすべて無料です。X API のみ有料です。**

X API は **Post 1件読み取りごとに課金**されます（Pay-per-use）。

- キーワード投稿: $0.005/件 × 10件 × キーワード数 × 30日
- 例: キーワード3個 → **約$4.5/月**

> [!WARNING]
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

## 概要

- X API で日本のトレンドを **1日1回** 自動取得（毎朝 07:00 JST）
- キーワード別・人物別の投稿（上位10件）も同時取得
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
| 人物タブ | 登録した X アカウント（最大5人）の最新投稿を表示 |
| 日付ナビ | 前日・翌日ボタンまたは日付ピッカーで履歴閲覧 |
| AND検索 | キーワードをスペース区切りで登録するとAND検索 |
| ダークモード | システム設定に自動追従 |
| X直リンク | ⚙️設定でONにすると投稿の直リンクを表示（デフォルトOFF） |

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
7. `fetchAndSave()` を手動実行して動作確認

**`FETCH_AUTHOR_INFO` について**

`gas/Code.js` 先頭の定数で、キーワード検索の投稿に著者名（表示名・@ユーザー名）を付けるかどうかを切り替えます。

```javascript
const FETCH_AUTHOR_INFO = false; // デフォルト: 著者名なし・コスト最小
// const FETCH_AUTHOR_INFO = true; // 著者名を表示する（コストが約3倍になる）
```

> [!NOTE]
> 人物タブ（`from:username` 検索）は `persons` シートの登録名を使うため、
> この設定に関わらず著者名が表示されます。

### 3. フロントエンド設定

`docs/data/sheets-config.json` を開き、各項目に Google Sheets の URL をそのまま貼り付けてください。変換は自動で行われます。

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

## X 直リンクについて

右上の ⚙️ から「X の投稿を直接開く」をONにすると、各投稿に X へのリンクが表示されます（デフォルトOFF）。

このプロジェクトの目的は「Xを開かない」ことですが、直リンク機能はその趣旨と矛盾するように見えます。

ただし、両者には本質的な違いがあります。

- **避けたいもの**: タイムライン・おすすめ・通知など、X のアルゴリズムが自動的に流してくる情報
- **直リンクでやること**: 自分が選んだ投稿を、自分の意志で開く

アルゴリズムに支配されるのではなく、自発的に特定の投稿を確認するという行為はプロジェクトの趣旨に反しないと考え、オプションとして提供しています。

> [!WARNING]
> ただし、開いた投稿から別の投稿へと繋げていくと、X のタイムラインやおすすめに引き込まれる危険があります。直リンクを使う場合は、**目的の投稿だけ確認して閉じる**ことを意識してください。

## アプリを使わなくなったら

> [!IMPORTANT]
> **必ず GAS のトリガーを停止してください。** 放置すると X API の課金が毎日継続します。

1. [script.google.com](https://script.google.com) でプロジェクトを開く
2. 左メニューの「トリガー」をクリック
3. `fetchAndSave` のトリガーを削除

または GAS エディタで `deleteAllTriggers()` を実行しても削除できます。

再開するときは GAS エディタで `setupTrigger()` を実行してください。トリガーが再登録されます。

## 開発

開発の詳細は [CLAUDE.md](./CLAUDE.md) を参照。

Data from X API.
