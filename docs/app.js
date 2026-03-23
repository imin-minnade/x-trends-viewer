/**
 * X Trends Viewer — フロントエンドロジック
 *
 * 重要: X（x.com / twitter.com）へのリンクは絶対に生成しない。
 *        詳細リンクはすべて Google 検索に向ける。
 */

const DATA_BASE = './data';

// 現在アクティブなタブ状態
let activeTab = 'trends';
let currentDate = null;

// ---- ユーティリティ ----

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function formatDateTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const opts = {
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  };
  return date.toLocaleString('ja-JP', opts);
}

// ---- トレンド ----

async function loadTrends(date) {
  const url = date
    ? `${DATA_BASE}/trends/${date}.json`
    : `${DATA_BASE}/latest.json`;

  const list = document.getElementById('trends-list');
  list.innerHTML = '<p class="loading">読み込み中...</p>';

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderTrends(data);
  } catch (err) {
    list.innerHTML = `<p class="error">データを読み込めませんでした。<br><small>${err.message}</small></p>`;
    document.getElementById('fetched-at').textContent = '';
  }
}

function renderTrends(data) {
  document.getElementById('fetched-at').textContent = formatFetchedAt(data.fetched_at);

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

// ---- キーワード投稿 ----

async function loadPosts(keyword, date) {
  const todayJst = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  const targetDate = date || todayJst;
  const url = `${DATA_BASE}/keywords/${encodeURIComponent(keyword)}/${targetDate}.json`;

  const list = document.getElementById('posts-list');
  list.innerHTML = '<p class="loading">読み込み中...</p>';
  document.getElementById('fetched-at').textContent = '';

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderPosts(data);
  } catch (err) {
    const msg = err.message.includes('404')
      ? `「${keyword}」のデータはまだありません（次回取得: 明日 07:00）`
      : 'データを読み込めませんでした。';
    list.innerHTML = `<p class="error">${msg}<br><small>${err.message}</small></p>`;
  }
}

function renderPosts(data) {
  document.getElementById('fetched-at').textContent = formatFetchedAt(data.fetched_at);

  const list = document.getElementById('posts-list');
  list.innerHTML = '';

  if (!data.posts || data.posts.length === 0) {
    list.innerHTML = '<p class="error">投稿が見つかりませんでした。</p>';
    return;
  }

  data.posts.forEach(post => {
    const item = document.createElement('div');
    item.className = 'post-item';

    item.innerHTML = `
      <div class="post-text">${escapeHtml(post.text)}</div>
      <div class="post-meta">
        <span class="post-author">${escapeHtml(post.author_name)}</span>
        <span class="post-username">${escapeHtml(post.author_username)}</span>
        <span class="post-date">${formatDateTime(post.created_at)}</span>
        <div class="post-metrics">
          ${post.retweet_count > 0 ? `<span class="post-metric">🔁 ${formatCount(post.retweet_count)}</span>` : ''}
          ${post.like_count > 0 ? `<span class="post-metric">❤️ ${formatCount(post.like_count)}</span>` : ''}
        </div>
      </div>
      <div class="post-actions">
        <a class="search-link" href="${post.google_search_url}" target="_blank" rel="noopener noreferrer">Google で検索</a>
      </div>
    `;

    list.appendChild(item);
  });
}

// ---- キーワード読み込み ----

async function loadKeywords() {
  try {
    const res = await fetch(`${DATA_BASE}/keywords.json`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.keywords || [];
  } catch {
    return [];
  }
}

// ---- タブ ----

function initTabs(keywords) {
  const nav = document.getElementById('tab-nav');

  keywords.forEach(kw => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.dataset.tab = kw;
    btn.textContent = kw;
    nav.appendChild(btn);
  });

  nav.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    switchTab(btn.dataset.tab);
  });
}

function switchTab(tab) {
  activeTab = tab;

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  const trendsList = document.getElementById('trends-list');
  const postsList = document.getElementById('posts-list');

  if (tab === 'trends') {
    trendsList.hidden = false;
    postsList.hidden = true;
    loadTrends(currentDate);
  } else {
    trendsList.hidden = true;
    postsList.hidden = false;
    loadPosts(tab, currentDate);
  }
}

// ---- date-picker ----

function initDatePicker() {
  const picker = document.getElementById('date-picker');
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
  picker.max = today;

  picker.addEventListener('change', () => {
    currentDate = picker.value || null;
    if (activeTab === 'trends') {
      loadTrends(currentDate);
    } else {
      loadPosts(activeTab, currentDate);
    }
  });
}

// ---- 初期化 ----

document.addEventListener('DOMContentLoaded', async () => {
  const keywords = await loadKeywords();
  initTabs(keywords);
  initDatePicker();
  loadTrends(null);
});
