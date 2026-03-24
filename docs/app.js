/**
 * X Trends Viewer — フロントエンドロジック（Google Sheets CSV版）
 *
 * 重要: X へのリンクはデフォルト非表示。⚙️設定で「直リンクを表示」をONにした場合のみ表示。
 *
 * データソース: Google Sheets CSV（latest / week / {year} / persons_latest シート）
 * 設定ファイル: ./data/sheets-config.json
 */

const DATA_BASE = './data';

let activeTab      = 'trends';
let activeTabType  = 'trends';   // 'trends' | 'keyword' | 'person'
let currentDate    = null;
let displayCount   = 10;
let prevTrendsData = null;
let sheetsConfig   = null;

// ============================================================
// ユーティリティ
// ============================================================

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatFetchedAt(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  }) + ' JST 取得';
}

function formatCount(n) {
  if (n == null || n === '' || isNaN(Number(n))) return null;
  const num = Number(n);
  if (num === 0) return null;
  if (num >= 10000) return `${(num / 10000).toFixed(1).replace(/\.0$/, '')}万`;
  return num.toLocaleString('ja-JP');
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

function daysDiff(dateStr, todayStr) {
  const a = new Date(dateStr + 'T00:00:00+09:00');
  const b = new Date(todayStr + 'T00:00:00+09:00');
  return Math.round((b - a) / 86400000);
}

// ============================================================
// 直リンク設定（localStorage）
// ============================================================

function showXLinks() {
  return localStorage.getItem('show_x_links') === 'true';
}

function buildXLink(postId, username) {
  if (!showXLinks() || !postId || !username) return '';
  const url = `https://x.com/${escapeHtml(username)}/status/${escapeHtml(postId)}`;
  return `<a class="x-link" href="${url}" target="_blank" rel="noopener noreferrer">X で見る ↗</a>`;
}

// ============================================================
// ⚙️ 設定パネル
// ============================================================

function initSettings() {
  const btn   = document.getElementById('btn-settings');
  const panel = document.getElementById('settings-panel');
  const toggle = document.getElementById('toggle-x-links');

  toggle.checked = showXLinks();

  btn.addEventListener('click', () => {
    const isOpen = panel.hidden;
    panel.hidden = !isOpen;
    btn.setAttribute('aria-expanded', String(isOpen));
  });

  toggle.addEventListener('change', () => {
    localStorage.setItem('show_x_links', toggle.checked ? 'true' : 'false');
    // 現在表示中のコンテンツを再描画
    if (activeTab === 'trends') {
      loadTrends(currentDate);
    } else {
      loadPosts(activeTab, activeTabType, currentDate);
    }
  });

  // パネル外クリックで閉じる
  document.addEventListener('click', e => {
    if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) {
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

// ============================================================
// Google Sheets CSV 読み込み
// ============================================================

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuote = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuote = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === ',') {
        row.push(field); field = '';
      } else if (ch === '\n') {
        row.push(field); field = '';
        rows.push(row); row = [];
      } else if (ch === '\r') {
        // skip
      } else {
        field += ch;
      }
    }
  }
  if (field || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function csvToObjects(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    return obj;
  });
}

/**
 * Google Sheets の任意のURL形式から CSV export URL に変換する。
 *
 * 対応する入力形式:
 *   - 共有URL:    https://docs.google.com/spreadsheets/d/{ID}/edit?usp=sharing
 *   - シートURL:  https://docs.google.com/spreadsheets/d/{ID}/edit?gid={GID}#gid={GID}
 *   - export URL: https://docs.google.com/spreadsheets/d/{ID}/export?format=csv&gid={GID}
 *
 * sheet_id に基本URLを、各シートキーにシート固有のURLを貼れば
 * GIDを自動抽出してexport URLを生成する。
 */
function toExportUrl(url, fallbackSheetId) {
  if (!url) return '';

  // すでに export URL ならそのまま返す
  if (url.includes('/export?')) return url;

  // スプレッドシートIDを抽出
  const idMatch = url.match(/\/spreadsheets\/d\/([^/]+)/);
  const sheetId = idMatch ? idMatch[1] : fallbackSheetId;
  if (!sheetId) return '';

  // gid を抽出（gid=XXXX または #gid=XXXX）
  const gidMatch = url.match(/[#&?]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : '0';

  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
}

async function loadSheetsConfig() {
  if (sheetsConfig) return sheetsConfig;
  try {
    const res = await fetch(`${DATA_BASE}/sheets-config.json`);
    if (!res.ok) throw new Error('config not found');
    const raw = await res.json();

    // sheet_id から基本のスプレッドシートIDを取得（共有URLでも可）
    const idMatch = (raw.sheet_id || '').match(/\/spreadsheets\/d\/([^/]+)/);
    const fallbackId = idMatch ? idMatch[1] : '';

    // 各URLをexport形式に変換
    sheetsConfig = {
      latest:         toExportUrl(raw.latest,         fallbackId),
      week:           toExportUrl(raw.week,            fallbackId),
      persons_latest: toExportUrl(raw.persons_latest,  fallbackId),
      years: {},
    };
    Object.entries(raw.years || {}).forEach(([year, url]) => {
      sheetsConfig.years[year] = toExportUrl(url, fallbackId);
    });
  } catch {
    sheetsConfig = { latest: '', week: '', years: {}, persons_latest: '' };
  }
  return sheetsConfig;
}

async function getCsvUrl(dateStr, type) {
  const config = await loadSheetsConfig();
  const today  = todayJst();
  const diff   = daysDiff(dateStr, today);

  // person タブは persons_latest シート（日付に関わらず）
  if (type === 'person') return config.persons_latest || '';

  if (diff === 0) return config.latest || '';
  if (diff <= 8)  return config.week   || '';
  const year = dateStr.slice(0, 4);
  return (config.years && config.years[year]) || '';
}

const csvRowsCache = {};

async function fetchCsvRows(dateStr, type) {
  const cacheKey = `${type}:${dateStr}`;
  if (csvRowsCache[cacheKey]) return csvRowsCache[cacheKey];

  const url = await getCsvUrl(dateStr, type);
  if (!url) throw new Error('CONFIG_NOT_SET');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const text    = await res.text();
  const objects = csvToObjects(parseCsv(text));

  // persons_latest は全件（日付フィルタなし）
  // latest は全件（今日のデータのみ）
  // week/year は日付フィルタ
  let rows;
  if (type === 'person' || daysDiff(dateStr, todayJst()) === 0) {
    rows = objects;
  } else {
    rows = objects.filter(row => row.date === dateStr);
  }

  csvRowsCache[cacheKey] = rows;
  return rows;
}

// ============================================================
// Sheets データ抽出
// ============================================================

function extractTrendsFromRows(rows) {
  const trendRows = rows.filter(r => r.type === 'trend');
  if (trendRows.length === 0) return null;

  const fetched_at = trendRows[0].fetched_at || '';
  const trends = trendRows.map(r => ({
    rank:        parseInt(r.rank, 10) || 0,
    name:        r.name || '',
    tweet_count: r.tweet_count !== '' ? Number(r.tweet_count) : null,
  }));
  trends.sort((a, b) => a.rank - b.rank);
  return { fetched_at, trends };
}

function extractKeywordsFromRows(rows) {
  if (rows.length === 0) return [];
  const firstRow = rows[0];
  const keywords = [];
  for (let i = 1; i <= 10; i++) {
    const kw = firstRow[`kw${i}`];
    if (kw) keywords.push(kw);
    else break;
  }
  return keywords;
}

function extractPersonsFromRows(rows) {
  if (rows.length === 0) return [];
  const firstRow = rows[0];
  const persons  = [];
  for (let i = 1; i <= 5; i++) {
    const name     = firstRow[`p${i}_name`];
    const username = firstRow[`p${i}_username`];
    if (name && username) persons.push({ person_name: name, username });
    else break;
  }
  return persons;
}

function extractPostsFromRows(rows, keyword) {
  // type=post または type=person、どちらも keyword 列で一致
  const postRows = rows.filter(r => (r.type === 'post' || r.type === 'person') && r.keyword === keyword);
  if (postRows.length === 0) return null;

  const fetched_at = postRows[0].fetched_at || '';
  const posts = postRows.map(r => ({
    keyword:         r.keyword || '',
    text:            r.text || '',
    created_at:      r.created_at || '',
    author_name:     r.author_name || '',
    author_username: r.author_username || '',
    retweet_count:   r.retweet_count !== '' ? Number(r.retweet_count) : 0,
    like_count:      r.like_count   !== '' ? Number(r.like_count)    : 0,
    post_id:         r.post_id || '',
  }));
  return { fetched_at, keyword, posts };
}

// ============================================================
// トレンド表示
// ============================================================

async function loadTrends(date) {
  const targetDate = date || todayJst();
  const list = document.getElementById('trends-list');
  list.innerHTML = '<p class="loading">読み込み中...</p>';
  document.getElementById('fetched-at').textContent = '';

  try {
    const rows = await fetchCsvRows(targetDate, 'trend');
    const data = extractTrendsFromRows(rows);
    if (!data) throw new Error('NO_DATA');

    prevTrendsData = null;
    try {
      const prevRows = await fetchCsvRows(prevDate(targetDate), 'trend');
      prevTrendsData = extractTrendsFromRows(prevRows);
    } catch { /* 前日データなしは無視 */ }

    renderTrends(data);
  } catch (err) {
    list.innerHTML = `<p class="error">${errMsg(err)}</p>`;
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
  list.innerHTML = buildCountBar();

  const maxCount = Math.max(...data.trends.map(t => t.tweet_count || 0));
  data.trends.slice(0, displayCount).forEach(trend => {
    const item       = document.createElement('div');
    item.className   = 'trend-item';
    const barPercent = (maxCount > 0 && trend.tweet_count != null)
      ? Math.round((trend.tweet_count / maxCount) * 100) : 0;
    const countText  = formatCount(trend.tweet_count);
    const rise       = getRiseInfo(trend.name, trend.tweet_count);

    item.innerHTML = `
      <div class="trend-main">
        <span class="rank">${trend.rank}</span>
        <span class="trend-name">${escapeHtml(trend.name)}</span>
        <span class="trend-meta">
          ${countText ? `<span class="tweet-count">${countText}</span>` : ''}
          ${rise      ? `<span class="rise-badge">${rise}</span>`       : ''}
        </span>
      </div>
      <div class="bar-container">
        <div class="bar-fill" style="width:${barPercent}%"></div>
      </div>`;
    list.appendChild(item);
  });

  bindCountBtns(list, () => renderTrends(data));
}

// ============================================================
// 投稿表示（キーワード・人物共通）
// ============================================================

async function loadPosts(tab, tabType, date) {
  const targetDate = date || todayJst();
  const list = document.getElementById('posts-list');
  list.innerHTML = '<p class="loading">読み込み中...</p>';
  document.getElementById('fetched-at').textContent = '';

  try {
    const rows = await fetchCsvRows(targetDate, tabType);
    const data = extractPostsFromRows(rows, tab);
    if (!data || data.posts.length === 0) throw new Error('NO_DATA');
    renderPosts(data);
  } catch (err) {
    const msg = err.message === 'NO_DATA'
      ? `「${tab}」のデータはまだありません（次回取得: 明日 07:00）`
      : errMsg(err);
    list.innerHTML = `<p class="error">${msg}</p>`;
  }
}

function renderPosts(data) {
  document.getElementById('fetched-at').textContent = formatFetchedAt(data.fetched_at);
  const list = document.getElementById('posts-list');
  list.innerHTML = buildCountBar();

  data.posts.slice(0, displayCount).forEach(post => {
    const item     = document.createElement('div');
    item.className = 'post-item';
    const rt       = formatCount(post.retweet_count);
    const like     = formatCount(post.like_count);
    const isLong   = post.text.length > 100 || post.text.split('\n').length > 3;
    const xLink    = buildXLink(post.post_id, post.author_username);

    item.innerHTML = `
      <div class="post-text${isLong ? ' collapsed' : ''}">${escapeHtml(post.text)}</div>
      ${isLong ? '<button class="expand-btn">続きを見る</button>' : ''}
      <div class="post-meta">
        ${post.author_name     ? `<span class="post-author">${escapeHtml(post.author_name)}</span>`     : ''}
        ${post.author_username ? `<span class="post-username">${escapeHtml(post.author_username)}</span>` : ''}
        <span class="post-date">${formatDateTime(post.created_at)}</span>
        <div class="post-metrics">
          ${rt   ? `<span class="post-metric">🔁 ${rt}</span>`   : ''}
          ${like ? `<span class="post-metric">❤️ ${like}</span>` : ''}
        </div>
      </div>
      ${xLink ? `<div class="post-actions">${xLink}</div>` : ''}`;

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

// ============================================================
// 表示件数バー
// ============================================================

function buildCountBar() {
  const counts = [10, 30, 50, 100];
  const btns   = counts.map(n =>
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

// ============================================================
// キーワード・人物読み込み
// ============================================================

async function loadKeywordsAndPersons(date) {
  const targetDate = date || todayJst();
  try {
    const rows     = await fetchCsvRows(targetDate, 'trend');
    const keywords = extractKeywordsFromRows(rows);
    const persons  = extractPersonsFromRows(rows);
    return { keywords, persons };
  } catch {
    return { keywords: [], persons: [] };
  }
}

// ============================================================
// タブ
// ============================================================

function initTabs(keywords, persons) {
  const nav = document.getElementById('tab-nav');
  nav.querySelectorAll('.tab-btn:not([data-tab="trends"])').forEach(b => b.remove());

  keywords.forEach(kw => {
    const btn = document.createElement('button');
    btn.className       = 'tab-btn';
    btn.dataset.tab     = kw;
    btn.dataset.tabType = 'keyword';
    btn.textContent     = kw;
    nav.appendChild(btn);
  });

  persons.forEach(p => {
    const btn = document.createElement('button');
    btn.className       = 'tab-btn tab-btn--person';
    btn.dataset.tab     = p.username;
    btn.dataset.tabType = 'person';
    btn.textContent     = p.person_name;
    nav.appendChild(btn);
  });
}

function initTabEvents() {
  document.getElementById('tab-nav').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    switchTab(btn.dataset.tab, btn.dataset.tabType || 'trends');
  });
}

function switchTab(tab, tabType) {
  activeTab     = tab;
  activeTabType = tabType;
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
    loadPosts(tab, tabType, currentDate);
  }
}

// ============================================================
// 日付ナビ
// ============================================================

function initDateNav() {
  document.getElementById('btn-prev').addEventListener('click', () => shiftDate(-1));
  document.getElementById('btn-next').addEventListener('click', () => shiftDate(+1));
  updateDateNav();
}

function shiftDate(delta) {
  const base    = currentDate || todayJst();
  const newDate = delta < 0 ? prevDate(base) : nextDate(base);
  const today   = todayJst();
  if (newDate > today) return;
  currentDate = newDate === today ? null : newDate;
  applyDateChange();
}

async function applyDateChange() {
  updateDateNav();
  const { keywords, persons } = await loadKeywordsAndPersons(currentDate);
  initTabs(keywords, persons);

  const tabExists = document.querySelector(`.tab-btn[data-tab="${CSS.escape(activeTab)}"]`);
  if (!tabExists) { activeTab = 'trends'; activeTabType = 'trends'; }

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
    loadPosts(activeTab, activeTabType, currentDate);
  }
}

function updateDateNav() {
  const today = todayJst();
  const shown = currentDate || today;
  document.getElementById('current-date-label').textContent = currentDate || '今日';
  document.getElementById('btn-next').disabled = (shown >= today);
  document.getElementById('date-picker').value = currentDate || '';
}

// ============================================================
// date-picker
// ============================================================

function initDatePicker() {
  const picker = document.getElementById('date-picker');
  picker.max = todayJst();
  picker.addEventListener('change', async () => {
    currentDate = picker.value || null;
    await applyDateChange();
  });
}

// ============================================================
// エラーメッセージ
// ============================================================

function errMsg(err) {
  if (err.message === 'CONFIG_NOT_SET') return 'sheets-config.json に CSV URL を設定してください。';
  if (err.message === 'NO_DATA')        return 'この日付のデータはありません。';
  return `データを読み込めませんでした。<br><small>${err.message}</small>`;
}

// ============================================================
// 初期化
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  await loadSheetsConfig();
  initSettings();

  const { keywords, persons } = await loadKeywordsAndPersons(null);
  initTabs(keywords, persons);
  initTabEvents();
  initDatePicker();
  initDateNav();

  document.querySelector('.tab-btn[data-tab="trends"]').classList.add('active');
  loadTrends(null);
});
