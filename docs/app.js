/**
 * X Trends Viewer — フロントエンドロジック
 *
 * 重要: X（x.com / twitter.com）へのリンクは絶対に生成しない。
 *        詳細リンクはすべて Google 検索に向ける。
 */

const DATA_BASE = './data';

let activeTab = 'trends';
let currentDate = null;         // null = 今日
let displayCount = 10;          // 表示件数
let prevTrendsData = null;      // 前日比較用

// ---- ユーティリティ ----

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatFetchedAt(isoString) {
  return new Date(isoString).toLocaleString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  }) + ' JST 取得';
}

function formatCount(n) {
  if (n == null || n === 0) return null;
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')}万`;
  return n.toLocaleString('ja-JP');
}

function formatDateTime(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleString('ja-JP', {
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  });
}

function todayJst() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
}

function prevDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+09:00');
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
}

function nextDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+09:00');
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
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

    // 前日データを取得して比較用に保持
    const targetDate = date || todayJst();
    const prev = prevDate(targetDate);
    prevTrendsData = null;
    try {
      const prevRes = await fetch(`${DATA_BASE}/trends/${prev}.json`);
      if (prevRes.ok) prevTrendsData = await prevRes.json();
    } catch { /* 前日データなしは無視 */ }

    renderTrends(data);
  } catch (err) {
    list.innerHTML = `<p class="error">データを読み込めませんでした。<br><small>${err.message}</small></p>`;
    document.getElementById('fetched-at').textContent = '';
  }
}

function getRiseInfo(name, currentCount) {
  if (!prevTrendsData || currentCount == null) return null;
  const prev = prevTrendsData.trends.find(t => t.name === name);
  if (!prev || prev.tweet_count == null) return null;
  const diff = currentCount - prev.tweet_count;
  if (diff > 0) return `↑${formatCount(diff)}`;
  return null;
}

function renderTrends(data) {
  document.getElementById('fetched-at').textContent = formatFetchedAt(data.fetched_at);

  const list = document.getElementById('trends-list');

  // 表示件数バー
  list.innerHTML = buildCountBar();

  const maxCount = Math.max(...data.trends.map(t => t.tweet_count || 0));
  const shown = data.trends.slice(0, displayCount);

  shown.forEach(trend => {
    const item = document.createElement('div');
    item.className = 'trend-item';

    const barPercent = (maxCount > 0 && trend.tweet_count != null)
      ? Math.round((trend.tweet_count / maxCount) * 100) : 0;

    const countText = formatCount(trend.tweet_count);
    const rise = getRiseInfo(trend.name, trend.tweet_count);

    item.innerHTML = `
      <div class="trend-main">
        <span class="rank">${trend.rank}</span>
        <span class="trend-name">${escapeHtml(trend.name)}</span>
        <span class="trend-meta">
          ${countText ? `<span class="tweet-count">${countText}</span>` : ''}
          ${rise ? `<span class="rise-badge">${rise}</span>` : ''}
          <a class="search-link" href="${trend.google_search_url}" target="_blank" rel="noopener noreferrer">検索</a>
        </span>
      </div>
      <div class="bar-container">
        <div class="bar-fill" style="width:${barPercent}%"></div>
      </div>`;

    list.appendChild(item);
  });

  bindCountBtns(list, () => renderTrends(data));
}

// ---- 投稿 ----

async function loadPosts(keyword, date) {
  const targetDate = date || todayJst();
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

  if (!data.posts || data.posts.length === 0) {
    list.innerHTML = '<p class="error">投稿が見つかりませんでした。</p>';
    return;
  }

  // 表示件数バー
  list.innerHTML = buildCountBar();

  const shown = data.posts.slice(0, displayCount);

  shown.forEach(post => {
    const item = document.createElement('div');
    item.className = 'post-item';

    const rt = formatCount(post.retweet_count);
    const like = formatCount(post.like_count);
    const isLong = post.text.length > 100 || post.text.split('\n').length > 3;

    item.innerHTML = `
      <div class="post-text${isLong ? ' collapsed' : ''}">${escapeHtml(post.text)}</div>
      ${isLong ? '<button class="expand-btn">続きを見る</button>' : ''}
      <div class="post-meta">
        <span class="post-author">${escapeHtml(post.author_name)}</span>
        <span class="post-username">${escapeHtml(post.author_username)}</span>
        <span class="post-date">${formatDateTime(post.created_at)}</span>
        <div class="post-metrics">
          ${rt ? `<span class="post-metric">🔁 ${rt}</span>` : ''}
          ${like ? `<span class="post-metric">❤️ ${like}</span>` : ''}
        </div>
      </div>
      <div class="post-actions">
        <a class="search-link" href="${post.google_search_url}" target="_blank" rel="noopener noreferrer">Google で検索</a>
      </div>`;

    // 折りたたみ展開
    const expandBtn = item.querySelector('.expand-btn');
    if (expandBtn) {
      expandBtn.addEventListener('click', () => {
        item.querySelector('.post-text').classList.remove('collapsed');
        expandBtn.remove();
      });
    }

    list.appendChild(item);
  });

  bindCountBtns(list, () => renderPosts(data));
}

// ---- 表示件数バー ----

function buildCountBar() {
  const counts = [10, 30, 50, 100];
  const btns = counts.map(n =>
    `<button class="count-btn${displayCount === n ? ' active' : ''}" data-count="${n}">${n}件</button>`
  ).join('');
  return `<div class="display-count-bar"><span>表示:</span>${btns}</div>`;
}

function bindCountBtns(container, rerender) {
  container.querySelector('.display-count-bar').addEventListener('click', e => {
    const btn = e.target.closest('.count-btn');
    if (!btn) return;
    displayCount = parseInt(btn.dataset.count, 10);
    rerender();
  });
}

// ---- キーワード読み込み ----

async function loadKeywords(date) {
  const url = date
    ? `${DATA_BASE}/keywords-${date}.json`
    : `${DATA_BASE}/keywords.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      if (date) return loadKeywords(null);
      return [];
    }
    const data = await res.json();
    // 全角スペースを半角に統一してタブ名に使う
    return (data.keywords || []).map(k => k.replace(/\u3000/g, ' '));
  } catch {
    return [];
  }
}

// ---- タブ ----

function initTabs(keywords) {
  const nav = document.getElementById('tab-nav');
  nav.querySelectorAll('.tab-btn:not([data-tab="trends"])').forEach(b => b.remove());
  keywords.forEach(kw => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.dataset.tab = kw;
    btn.textContent = kw;
    nav.appendChild(btn);
  });
}

function initTabEvents() {
  document.getElementById('tab-nav').addEventListener('click', e => {
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
  const postsList  = document.getElementById('posts-list');
  if (tab === 'trends') {
    trendsList.hidden = false;
    postsList.hidden  = true;
    loadTrends(currentDate);
  } else {
    trendsList.hidden = true;
    postsList.hidden  = false;
    loadPosts(tab, currentDate);
  }
}

// ---- 日付ナビ ----

function initDateNav() {
  document.getElementById('btn-prev').addEventListener('click', () => shiftDate(-1));
  document.getElementById('btn-next').addEventListener('click', () => shiftDate(+1));
  updateDateNav();
}

function shiftDate(delta) {
  const base = currentDate || todayJst();
  const newDate = delta < 0 ? prevDate(base) : nextDate(base);
  const today = todayJst();
  if (newDate > today) return;
  currentDate = newDate === today ? null : newDate;
  applyDateChange();
}

async function applyDateChange() {
  updateDateNav();
  const keywords = await loadKeywords(currentDate);
  initTabs(keywords);

  const tabExists = document.querySelector(`.tab-btn[data-tab="${CSS.escape(activeTab)}"]`);
  if (!tabExists) activeTab = 'trends';

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === activeTab);
  });

  if (activeTab === 'trends') {
    document.getElementById('trends-list').hidden = false;
    document.getElementById('posts-list').hidden  = true;
    loadTrends(currentDate);
  } else {
    document.getElementById('trends-list').hidden = true;
    document.getElementById('posts-list').hidden  = false;
    loadPosts(activeTab, currentDate);
  }
}

function updateDateNav() {
  const today = todayJst();
  const shown = currentDate || today;
  document.getElementById('current-date-label').textContent =
    currentDate ? currentDate : '今日';
  document.getElementById('btn-next').disabled = (shown >= today);

  // date-picker とも同期
  const picker = document.getElementById('date-picker');
  picker.value = currentDate || '';
}

// ---- date-picker ----

function initDatePicker() {
  const picker = document.getElementById('date-picker');
  picker.max = todayJst();

  picker.addEventListener('change', async () => {
    currentDate = picker.value || null;
    await applyDateChange();
  });
}

// ---- 初期化 ----

document.addEventListener('DOMContentLoaded', async () => {
  const keywords = await loadKeywords(null);
  initTabs(keywords);
  initTabEvents();
  initDatePicker();
  initDateNav();
  // トレンドタブをアクティブに
  document.querySelector('.tab-btn[data-tab="trends"]').classList.add('active');
  loadTrends(null);
});
