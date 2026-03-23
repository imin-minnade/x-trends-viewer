# X Trends Viewer

60日間のX断ちプロジェクト用、日本のトレンド自動取得 & 閲覧ダッシュボード。

## 概要

- X API で日本のトレンドを **1日1回** 自動取得（毎朝 07:00 JST）
- キーワード別の投稿（バズり順・上位100件）も同時取得
- GitHub Pages で個人用Webサイトとして閲覧
- Xのアプリ・ブラウザは一切開かない。**アルゴリズムに触れずに情報だけ得る**

## 機能

| 機能 | 説明 |
|------|------|
| トレンドタブ | 日本のトレンド最大50件。投稿数バー・前日比↑表示 |
| キーワードタブ | 登録キーワード（最大3つ）の投稿をバズり順で表示 |
| 表示件数切り替え | 10 / 30 / 50 / 100 件から選択 |
| 日付ナビ | 前日・翌日ボタンまたは日付ピッカーで履歴閲覧 |
| AND検索 | キーワードをスペース区切りで登録するとAND検索 |
| ダークモード | システム設定に自動追従 |

## セットアップ

### 1. X API

1. [X Developer Portal](https://developer.x.com/) でアカウント作成
2. アプリを作成し Bearer Token を取得

### 2. GitHub

1. このリポジトリを自分のアカウントに fork または作成
2. Settings > Secrets and variables > Actions > `X_BEARER_TOKEN` に Bearer Token を登録
3. Settings > Pages > Source: Deploy from branch `main`, Folder: `/docs`

### 3. 動作確認

Actions タブ > "Fetch X Trends" > Run workflow で手動実行し、
`docs/data/latest.json` が生成されることを確認。

## キーワードの変更方法

監視したいキーワードは `data/keywords.json` で管理します。

```json
{
  "keywords": ["キーワード1", "高市 外交", "トランプ"]
}
```

- キーワードは最大3つ
- スペース区切りで AND検索（例: `"高市 外交"` → 高市 AND 外交）
- 全角スペース・半角スペースどちらでも可

**GitHub サイト上で編集する場合:**

1. `data/keywords.json` を開いて右上の鉛筆アイコン（Edit）をクリック
2. 編集して Commit changes で保存
3. Actions > "Fetch X Trends" > Run workflow で手動実行（または翌朝 07:00 の自動実行を待つ）

**ローカルで編集する場合:**

1. `git pull` で最新を取得
2. `data/keywords.json` を編集
3. `git add data/keywords.json && git commit -m "update keywords" && git push`
4. Actions > "Fetch X Trends" > Run workflow で手動実行（または翌朝 07:00 の自動実行を待つ）

> キーワードを変更した日以前の過去ページでは、その日時点のキーワードがタブに表示されます。

## コスト

| 項目 | 月額 |
|------|------|
| X API | 従量課金（1日数円程度） |
| GitHub Pages | 無料 |
| GitHub Actions | 無料（月2,000分の無料枠内） |

## 開発

開発の詳細は [CLAUDE.md](./CLAUDE.md) を参照。

Data from X API.
