/**
 * X Trends Viewer — フロントエンドロジック
 *
 * TODO: Claude Code で以下を実装
 *   1. latest.json の fetch と表示
 *   2. date-picker による履歴閲覧
 *   3. 横棒バーの描画（投稿数の相対比較）
 *   4. エラーハンドリング（JSON なし、ネットワークエラー）
 *   5. 日付一覧の自動検出（利用可能な日付を date-picker に反映）
 *
 * 仕様は CLAUDE.md の「site/index.html」セクションを参照。
 *
 * 重要: X（x.com / twitter.com）へのリンクは絶対に生成しない。
 *        詳細リンクはすべて Google 検索に向ける。
 */

const DATA_BASE = './data';

async function loadTrends(date) {
  // date が null なら latest.json、指定があれば trends/YYYY-MM-DD.json
  const url = date
    ? `${DATA_BASE}/trends/${date}.json`
    : `${DATA_BASE}/latest.json`;

  // TODO: fetch, parse, render
}

function renderTrends(data) {
  // TODO: DOM 生成
  // - 各トレンドの順位、名前、投稿数バー、Google検索リンク
  // - fetched_at の表示
}

function initDatePicker() {
  // TODO: date-picker の change イベント → loadTrends(selectedDate)
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  loadTrends(null);
  initDatePicker();
});
