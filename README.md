# X Trends Viewer

60日間のX断ちプロジェクト用、日本のトレンド自動取得 & 閲覧ダッシュボード。

## 概要

- X API で日本のトレンドを **1日1回** 自動取得（毎朝 07:00 JST）
- キーワード別の投稿（バズり順）も同時取得
- GitHub Pages で個人用Webサイトとして閲覧
- Xのアプリ・ブラウザは一切開かない。**アルゴリズムに触れずに情報だけ得る**

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
  "keywords": ["キーワード1", "キーワード2", "キーワード3"]
}
```

**変更手順:**

1. `data/keywords.json` を編集（キーワードは最大3つ）
2. `git add data/keywords.json && git commit -m "update keywords" && git push`
3. Actions > "Fetch X Trends" > Run workflow で手動実行（または翌朝 07:00 の自動実行を待つ）

> **注意**: キーワードを変更した日以前の過去ページでは、その日時点のキーワードがタブに表示されます。

## コスト

| 項目 | 月額 |
|------|------|
| X API | 従量課金（1日数円程度） |
| GitHub Pages | 無料 |
| GitHub Actions | 無料（月2,000分の無料枠内） |

## 開発

開発の詳細は [CLAUDE.md](./CLAUDE.md) を参照。

Data from X API.
