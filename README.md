# X Trends Viewer

60日間のX断ちプロジェクト用、日本のトレンド自動取得 & 閲覧ダッシュボード。

## 概要

- X API で日本のトレンドを **1日1回** 自動取得
- GitHub Pages で個人用Webサイトとして閲覧
- Xのアプリ・ブラウザは一切開かない。**アルゴリズムに触れずに情報だけ得る**

## セットアップ

### 1. X API

1. [X Developer Portal](https://developer.x.com/) でアカウント作成
2. アプリを作成し Bearer Token を取得
3. Pay-per-use を選択、Spending cap を月 $5 に設定

### 2. GitHub

1. このリポジトリを自分のアカウントに作成
2. Settings > Secrets > `X_BEARER_TOKEN` に Bearer Token を登録
3. Settings > Pages > Source: Deploy from branch `main`, Folder: `/site`

### 3. 動作確認

Actions タブ > "Fetch X Trends" > Run workflow で手動実行し、
`site/data/latest.json` が生成されることを確認。

## コスト

| 項目 | 月額 |
|------|------|
| X API（トレンド1日1回） | $1〜3 |
| GitHub Pages | 無料 |
| GitHub Actions | 無料（月2,000分の無料枠内） |

## 開発

開発の詳細は [CLAUDE.md](./CLAUDE.md) を参照。

Data from X API.
