/**
 * X Trends Viewer — Google Apps Script
 *
 * 毎朝 07:00 JST にトリガー実行。
 * X API からトレンド・キーワード投稿・人物投稿を取得して Sheets に書き込む。
 *
 * 【初回セットアップ】
 *   Setup.js の setupAll() を一度だけ手動実行してください。
 *
 * 【PropertiesService に設定するキー】
 *   X_BEARER_TOKEN  : X API Bearer Token
 *   SHEET_ID        : Google Sheets のスプレッドシートID
 *   last_tweet_id_{username} : 人物ごとの最終取得ツイートID（自動管理）
 */

// ============================================================
// 定数
// ============================================================

const JAPAN_WOEID    = 23424856;
const MAX_KEYWORDS   = 10;
const MAX_PERSONS    = 5;
const POSTS_FETCH_COUNT        = 10;  // キーワード検索: 上位10件
const PERSON_POSTS_FETCH_COUNT = 10;  // 人物検索: 最大10件（since_idで新規のみ取得）
const PERSON_LATEST_MAX        = 10;  // persons_latest シートに保持する最大件数/人

// ============================================================
// コスト設定
// ============================================================
//
// FETCH_AUTHOR_INFO: キーワード検索で投稿者の表示名・ユーザー名を取得するか
//
//   false（デフォルト）: 取得しない。コスト最小。
//                        投稿カードに著者名は表示されない。
//
//   true             : 取得する。
//                      ユーザー情報は Post の約2倍の単価で課金されるため、
//                      キーワード投稿取得コストが約3倍になる。
//                      投稿カードに「表示名 @ユーザー名」が表示される。
//
// ※ 人物検索（from:username）は persons シートから著者名を補完するため
//    FETCH_AUTHOR_INFO に関わらず著者名が表示される。
//
// ============================================================
const FETCH_AUTHOR_INFO = false;

// ============================================================
// メインエントリーポイント（トリガーから呼ぶ）
// ============================================================

function fetchAndSave() {
  const props = PropertiesService.getScriptProperties();
  const bearerToken = props.getProperty('X_BEARER_TOKEN');
  const sheetId = props.getProperty('SHEET_ID');

  if (!bearerToken) throw new Error('X_BEARER_TOKEN が設定されていません');
  if (!sheetId)     throw new Error('SHEET_ID が設定されていません');

  const ss      = SpreadsheetApp.openById(sheetId);
  const dateStr = getTodayJst();

  // ----- キーワード・人物リスト読み込み -----
  const keywords = loadKeywords(ss);
  const persons  = loadPersons(ss);
  console.log(`Keywords: ${keywords.join(', ')}`);
  console.log(`Persons: ${persons.map(p => p.username).join(', ')}`);

  // ----- トレンド取得 -----
  const trends = fetchTrends(bearerToken);
  console.log(`Trends: ${trends.length} items`);

  // ----- キーワード別投稿取得 -----
  const postsByKeyword = {};
  keywords.forEach(kw => {
    const posts = fetchPosts(kw, bearerToken);
    postsByKeyword[kw] = posts;
    console.log(`Posts[${kw}]: ${posts.length} items`);
  });

  // ----- 人物別投稿取得（since_id で新規のみ） -----
  const newPostsByPerson = {};
  persons.forEach(p => {
    const posts = fetchPersonPosts(p, bearerToken, props);
    newPostsByPerson[p.username] = posts;
    console.log(`PersonPosts[${p.username}]: ${posts.length} new items`);
  });

  // ----- Sheets 書き込み -----
  writeLatest(ss, dateStr, trends, postsByKeyword, keywords, persons);
  appendYear(ss, dateStr, trends, postsByKeyword, keywords, persons);
  writeWeek(ss, dateStr);
  updatePersonsLatest(ss, newPostsByPerson, persons);

  console.log('Done.');
}

// ============================================================
// キーワード・人物リスト読み込み
// ============================================================

function loadKeywords(ss) {
  const sheet = ss.getSheetByName('keywords');
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  return values
    .map(row => String(row[0]).trim())
    .filter(kw => kw && kw !== 'keyword')
    .slice(0, MAX_KEYWORDS);
}

function loadPersons(ss) {
  const sheet = ss.getSheetByName('persons');
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  return values
    .filter((row, i) => i !== 0 && String(row[0]).trim() && String(row[0]).trim() !== 'person_name')
    .map(row => ({
      person_name: String(row[0]).trim(),
      username:    String(row[1]).trim(),
    }))
    .slice(0, MAX_PERSONS);
}

// ============================================================
// X API: トレンド取得
// ============================================================

function fetchTrends(bearerToken) {
  const result = fetchTrendsV2(bearerToken) || fetchTrendsV1(bearerToken);
  if (!result) throw new Error('トレンド取得に失敗しました');
  return result;
}

function fetchTrendsV2(bearerToken) {
  const url = `https://api.twitter.com/2/trends/by/woeid/${JAPAN_WOEID}?max_trends=50&trend.fields=trend_name,tweet_count`;
  const res = apiGet(url, bearerToken);
  if (!res || res.getResponseCode() !== 200) return null;

  const data = JSON.parse(res.getContentText());
  return (data.data || []).map((item, i) => ({
    rank:       i + 1,
    name:       item.trend_name || '',
    tweet_count: item.tweet_count || null,
    post_id:    '',
  }));
}

function fetchTrendsV1(bearerToken) {
  const url = `https://api.twitter.com/1.1/trends/place.json?id=${JAPAN_WOEID}`;
  const res = apiGet(url, bearerToken);
  if (!res || res.getResponseCode() !== 200) return null;

  const data = JSON.parse(res.getContentText());
  const trends = (data[0] && data[0].trends) ? data[0].trends : [];
  return trends.map((item, i) => ({
    rank:       i + 1,
    name:       item.name || '',
    tweet_count: item.tweet_volume || null,
    post_id:    '',
  }));
}

// ============================================================
// X API: キーワード投稿取得
// ============================================================

function fetchPosts(keyword, bearerToken) {
  const normalized = keyword.replace(/\u3000/g, ' ').trim();
  const query = encodeURIComponent(`${normalized} lang:ja -is:retweet`);
  const urlParts = [
    'https://api.twitter.com/2/tweets/search/recent',
    `?query=${query}`,
    `&max_results=${POSTS_FETCH_COUNT}`,
    '&sort_order=relevancy',
    '&tweet.fields=created_at,public_metrics,author_id',
  ];
  if (FETCH_AUTHOR_INFO) {
    urlParts.push('&expansions=author_id', '&user.fields=name,username');
  }
  const url = urlParts.join('');

  const res = apiGet(url, bearerToken);
  if (!res || res.getResponseCode() !== 200) return [];

  const data   = JSON.parse(res.getContentText());
  const tweets = data.data || [];
  const users  = {};
  if (FETCH_AUTHOR_INFO) {
    ((data.includes && data.includes.users) || []).forEach(u => { users[u.id] = u; });
  }

  const posts = tweets.map(tweet => {
    const author = FETCH_AUTHOR_INFO ? (users[tweet.author_id] || {}) : {};
    const m = tweet.public_metrics || {};
    return {
      keyword:          normalized,
      text:             tweet.text || '',
      created_at:       tweet.created_at || '',
      author_name:      author.name || '',
      author_username:  author.username || '',
      retweet_count:    m.retweet_count || 0,
      like_count:       m.like_count || 0,
      post_id:          tweet.id || '',
    };
  });

  posts.sort((a, b) => (b.retweet_count + b.like_count) - (a.retweet_count + a.like_count));
  return posts;
}

// ============================================================
// X API: 人物投稿取得（since_id で新規のみ）
// ============================================================

function fetchPersonPosts(person, bearerToken, props) {
  const sinceIdKey = `last_tweet_id_${person.username}`;
  const sinceId    = props.getProperty(sinceIdKey);

  const urlParts = [
    'https://api.twitter.com/2/tweets/search/recent',
    `?query=${encodeURIComponent(`from:${person.username} -is:retweet`)}`,
    `&max_results=${PERSON_POSTS_FETCH_COUNT}`,
    '&tweet.fields=created_at,public_metrics',
  ];
  if (sinceId) {
    urlParts.push(`&since_id=${sinceId}`);
  }
  const url = urlParts.join('');

  const res = apiGet(url, bearerToken);
  // since_id に新規投稿がない場合 API は 200 + data なし を返す
  if (!res || res.getResponseCode() !== 200) return [];

  const data   = JSON.parse(res.getContentText());
  const tweets = data.data || [];
  if (tweets.length === 0) return [];

  // 最新のツイートIDを記録（次回 since_id として使う）
  const latestId = tweets.reduce((max, t) => (BigInt(t.id) > BigInt(max) ? t.id : max), tweets[0].id);
  props.setProperty(sinceIdKey, latestId);

  return tweets.map(tweet => {
    const m = tweet.public_metrics || {};
    return {
      keyword:         person.username,      // 抽出キーとして username を使う
      text:            tweet.text || '',
      created_at:      tweet.created_at || '',
      author_name:     person.person_name,   // persons シートから補完
      author_username: person.username,
      retweet_count:   m.retweet_count || 0,
      like_count:      m.like_count || 0,
      post_id:         tweet.id || '',
    };
  });
}

// ============================================================
// Sheets 書き込み
// ============================================================

/**
 * 列ヘッダー定義
 * kw1〜kw10: キーワードスナップショット
 * p1_name, p1_username, ...: 人物スナップショット
 */
function getHeaders(maxKw, maxP) {
  const kwCols = Array.from({ length: maxKw }, (_, i) => `kw${i + 1}`);
  const pCols  = Array.from({ length: maxP  }, (_, i) => [`p${i+1}_name`, `p${i+1}_username`]).flat();
  return [
    'date', 'fetched_at', 'type',
    'rank', 'name', 'tweet_count',
    'keyword', 'text', 'created_at',
    'author_name', 'author_username',
    'retweet_count', 'like_count', 'post_id',
    ...kwCols,
    ...pCols,
  ];
}

function buildPersonPad(persons, maxP) {
  const flat = persons.flatMap(p => [p.person_name, p.username]);
  return [...flat, ...Array(maxP * 2).fill('')].slice(0, maxP * 2);
}

function buildTrendRow(dateStr, fetchedAt, trend, keywords, maxKw, persons, maxP) {
  const kwPad = [...keywords, ...Array(maxKw).fill('')].slice(0, maxKw);
  return [
    dateStr, fetchedAt, 'trend',
    trend.rank, trend.name, trend.tweet_count ?? '',
    '', '', '', '', '', '', '', '', // post 列は空
    ...kwPad,
    ...buildPersonPad(persons, maxP),
  ];
}

function buildPostRow(dateStr, fetchedAt, post, keywords, maxKw, persons, maxP) {
  const kwPad = [...keywords, ...Array(maxKw).fill('')].slice(0, maxKw);
  return [
    dateStr, fetchedAt, 'post',
    '', '', '',  // trend 列は空
    post.keyword, post.text, post.created_at,
    post.author_name, post.author_username,
    post.retweet_count, post.like_count, post.post_id,
    ...kwPad,
    ...buildPersonPad(persons, maxP),
  ];
}

function buildPersonRow(dateStr, fetchedAt, post, keywords, maxKw, persons, maxP) {
  const kwPad = [...keywords, ...Array(maxKw).fill('')].slice(0, maxKw);
  return [
    dateStr, fetchedAt, 'person',
    '', '', '',
    post.keyword, post.text, post.created_at,
    post.author_name, post.author_username,
    post.retweet_count, post.like_count, post.post_id,
    ...kwPad,
    ...buildPersonPad(persons, maxP),
  ];
}

function buildRows(dateStr, trends, postsByKeyword, keywords, persons) {
  const fetchedAt = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const maxKw = Math.max(keywords.length, 1);
  const maxP  = Math.max(persons.length,  1);
  const rows  = [];

  trends.forEach(trend => {
    rows.push(buildTrendRow(dateStr, fetchedAt, trend, keywords, maxKw, persons, maxP));
  });
  keywords.forEach(kw => {
    (postsByKeyword[kw] || []).forEach(post => {
      rows.push(buildPostRow(dateStr, fetchedAt, post, keywords, maxKw, persons, maxP));
    });
  });

  return { rows, maxKw, maxP };
}

/** latest シートを当日データで上書き（キーワード・トレンドのみ。人物は persons_latest） */
function writeLatest(ss, dateStr, trends, postsByKeyword, keywords, persons) {
  let sheet = ss.getSheetByName('latest');
  if (!sheet) sheet = ss.insertSheet('latest');

  const { rows, maxKw, maxP } = buildRows(dateStr, trends, postsByKeyword, keywords, persons);
  const headers = getHeaders(maxKw, maxP);

  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  console.log(`latest: ${rows.length} rows written`);
}

/** week シートを直近8日分で洗い替え（year シートから抽出） */
function writeWeek(ss, todayStr) {
  const yearName  = todayStr.slice(0, 4);
  const yearSheet = ss.getSheetByName(yearName);
  if (!yearSheet) {
    console.log('week: year sheet not found, skipping');
    return;
  }

  const cutoff  = getDateBefore(todayStr, 8);
  const allData = yearSheet.getDataRange().getValues();
  if (allData.length < 2) {
    console.log('week: year sheet is empty, skipping');
    return;
  }
  const headers = allData[0];
  const dateIdx = headers.indexOf('date');

  const filtered = allData.filter((row, i) => {
    if (i === 0) return true;
    const rowDate = row[dateIdx] instanceof Date
      ? Utilities.formatDate(row[dateIdx], 'Asia/Tokyo', 'yyyy-MM-dd')
      : String(row[dateIdx]);
    return rowDate >= cutoff;
  });

  let weekSheet = ss.getSheetByName('week');
  if (!weekSheet) weekSheet = ss.insertSheet('week');

  weekSheet.clearContents();
  if (filtered.length > 0) {
    weekSheet.getRange(1, 1, filtered.length, filtered[0].length).setValues(filtered);
  }
  console.log(`week: ${filtered.length - 1} rows written`);
}

/** year シートに当日データを追記 */
function appendYear(ss, dateStr, trends, postsByKeyword, keywords, persons) {
  const yearName = dateStr.slice(0, 4);
  let yearSheet  = ss.getSheetByName(yearName);

  const { rows, maxKw, maxP } = buildRows(dateStr, trends, postsByKeyword, keywords, persons);
  const headers = getHeaders(maxKw, maxP);

  if (!yearSheet) {
    yearSheet = ss.insertSheet(yearName);
    yearSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    console.log(`year: created new sheet "${yearName}"`);
  }

  const lastCol = yearSheet.getLastColumn();
  if (lastCol === 0 || lastCol < headers.length) {
    yearSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  const lastRow = yearSheet.getLastRow();
  if (lastRow >= 2) {
    const existingDate    = yearSheet.getRange(lastRow, 1).getValue();
    const existingDateStr = existingDate instanceof Date
      ? Utilities.formatDate(existingDate, 'Asia/Tokyo', 'yyyy-MM-dd')
      : String(existingDate);
    if (existingDateStr === dateStr) {
      console.log(`${yearName}: already has data for ${dateStr}, skipping`);
      return;
    }
  }

  if (rows.length > 0) {
    yearSheet.getRange(lastRow + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
  console.log(`${yearName}: ${rows.length} rows appended`);
}

/**
 * persons_latest シートを更新する。
 * 新規投稿を追記し、人物ごとに PERSON_LATEST_MAX 件を超えた古い行を削除する。
 */
function updatePersonsLatest(ss, newPostsByPerson, persons) {
  if (persons.length === 0) return;

  let sheet = ss.getSheetByName('persons_latest');
  if (!sheet) {
    sheet = ss.insertSheet('persons_latest');
  }

  const headers = [
    'date', 'fetched_at', 'type',
    'keyword', 'text', 'created_at',
    'author_name', 'author_username',
    'retweet_count', 'like_count', 'post_id',
  ];

  // シートが空ならヘッダーを書く
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  const dateStr   = getTodayJst();
  const fetchedAt = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

  // 新規投稿を追記
  const newRows = [];
  persons.forEach(p => {
    (newPostsByPerson[p.username] || []).forEach(post => {
      newRows.push([
        dateStr, fetchedAt, 'person',
        post.keyword, post.text, post.created_at,
        post.author_name, post.author_username,
        post.retweet_count, post.like_count, post.post_id,
      ]);
    });
  });

  if (newRows.length > 0) {
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, newRows.length, headers.length).setValues(newRows);
  }

  // 人物ごとに PERSON_LATEST_MAX 件超の古い行を削除
  trimPersonsLatest(sheet, persons, headers);

  console.log(`persons_latest: ${newRows.length} new rows added`);
}

/**
 * persons_latest シートで人物ごとに古い行を削除し、最大 PERSON_LATEST_MAX 件に保つ。
 * 行は created_at の降順（新しい順）で保持する。
 */
function trimPersonsLatest(sheet, persons, headers) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const allData    = sheet.getDataRange().getValues();
  const kwIdx      = headers.indexOf('keyword');
  const createdIdx = headers.indexOf('created_at');

  // ヘッダー行を除いた各行を username でグループ化
  const byUsername = {};
  persons.forEach(p => { byUsername[p.username] = []; });

  const dataRows = allData.slice(1); // ヘッダー除く
  dataRows.forEach((row, i) => {
    const uname = row[kwIdx];
    if (byUsername[uname] !== undefined) {
      byUsername[uname].push({ row, origIndex: i + 1 }); // origIndex: ヘッダー含む行番号
    }
  });

  // 削除すべき行番号を収集（古い順に超過分を削除）
  const rowsToDelete = [];
  Object.values(byUsername).forEach(entries => {
    if (entries.length <= PERSON_LATEST_MAX) return;
    // created_at 降順（新しい順）でソートして超過分を削除候補に
    entries.sort((a, b) => {
      const da = new Date(a.row[createdIdx]);
      const db = new Date(b.row[createdIdx]);
      return db - da;
    });
    entries.slice(PERSON_LATEST_MAX).forEach(e => rowsToDelete.push(e.origIndex));
  });

  if (rowsToDelete.length === 0) return;

  // 行番号の降順で削除（下から削除しないとインデックスがずれる）
  rowsToDelete.sort((a, b) => b - a);
  rowsToDelete.forEach(rowNum => {
    sheet.deleteRow(rowNum + 1); // getValues は 0-indexed、deleteRow は 1-indexed
  });
}

// ============================================================
// ユーティリティ
// ============================================================

function getTodayJst() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
}

function getDateBefore(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00+09:00');
  d.setDate(d.getDate() - days);
  return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
}

function apiGet(url, bearerToken) {
  const options = {
    method: 'get',
    headers: { Authorization: `Bearer ${bearerToken}` },
    muteHttpExceptions: true,
  };
  try {
    const res  = UrlFetchApp.fetch(url, options);
    const code = res.getResponseCode();
    if (code === 429) {
      console.warn('Rate limited. Waiting 15s...');
      Utilities.sleep(15000);
      return UrlFetchApp.fetch(url, options);
    }
    if (code === 401) throw new Error('認証エラー (401): X_BEARER_TOKEN を確認してください');
    return res;
  } catch (e) {
    console.error(`API error: ${e.message}`);
    return null;
  }
}
