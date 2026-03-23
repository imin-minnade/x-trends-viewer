/**
 * X Trends Viewer — フロントエンドロジック
 *
 * 重要: X（x.com / twitter.com）へのリンクは絶対に生成しない。
 *        詳細リンクはすべて Google 検索に向ける。
 */

const DATA_BASE = './data';

async function loadTrends(date) {
  const url = date
    ? `${DATA_BASE}/trends/${date}.json`
    : `${DATA_BASE}/latest.json`;

  const list = document.getElementById('trends-list');
  list.innerHTML = '<p class="loading">読み込み中...</p>';

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    renderTrends(data);
  } catch (err) {
    list.innerHTML = `<p class="error">データを読み込めませんでした。<br><small>${err.message}</small></p>`;
    document.getElementById('fetched-at').textContent = '';
  }
}

function formatFetchedAt(isoString) {
  const date = new Date(isoString);
  const opts = {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  };
  return date.toLocaleString('ja-JP', opts) + ' JST 取得';
}

function formatCount(n) {
  if (n == null) return '-';
  if (n >= 10000) return `${Math.floor(n / 10000)}万`;
  return n.toLocaleString('ja-JP');
}

function renderTrends(data) {
  const fetchedAt = document.getElementById('fetched-at');
  fetchedAt.textContent = formatFetchedAt(data.fetched_at);

  const list = document.getElementById('trends-list');
  list.innerHTML = '';

  const maxCount = Math.max(...data.trends.map(t => t.tweet_count || 0));

  data.trends.forEach(trend => {
    const item = document.createElement('div');
    item.className = 'trend-item';

    const barPercent = (maxCount > 0 && trend.tweet_count != null)
      ? Math.round((trend.tweet_count / maxCount) * 100)
      : 0;

    item.innerHTML = `
      <div class="trend-main">
        <span class="rank">${trend.rank}</span>
        <span class="trend-name">${escapeHtml(trend.name)}</span>
        <span class="tweet-count">${formatCount(trend.tweet_count)}</span>
        <a class="search-link" href="${trend.google_search_url}" target="_blank" rel="noopener noreferrer">検索</a>
      </div>
      <div class="bar-container">
        <div class="bar-fill" style="width: ${barPercent}%"></div>
      </div>
    `;

    list.appendChild(item);
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initDatePicker() {
  const picker = document.getElementById('date-picker');

  // 未来日付を防ぐ
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  picker.max = today;

  picker.addEventListener('change', () => {
    loadTrends(picker.value || null);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadTrends(null);
  initDatePicker();
});
