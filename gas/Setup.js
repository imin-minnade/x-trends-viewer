/**
 * X Trends Viewer — セットアップスクリプト
 *
 * 初回のみ手動実行してください。
 * GAS エディタ上部のドロップダウンで関数を選んで「実行」ボタンを押す。
 *
 * 実行順序:
 *   1. setProperties()   — Bearer Token と Sheet ID を登録
 *   2. setupSheets()     — Sheets のシート構造を初期化
 *   3. setupTrigger()    — 毎朝 07:00 JST の自動実行トリガーを設定
 */

// ============================================================
// 1. PropertiesService にシークレットを登録
// ============================================================

/**
 * この関数を実行する前に、下の YOUR_... 部分を実際の値に書き換えてください。
 * 書き換え後、実行したらすぐに元の YOUR_... に戻してコミットしないこと。
 */
function setProperties() {
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    X_BEARER_TOKEN: 'YOUR_BEARER_TOKEN_HERE',
    SHEET_ID:       'YOUR_SPREADSHEET_ID_HERE',
  });
  console.log('Properties set successfully.');
}

// ============================================================
// 2. Sheets の初期構造を作成
// ============================================================

function setupSheets() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty('SHEET_ID');
  if (!sheetId) throw new Error('先に setProperties() を実行してください');

  const ss = SpreadsheetApp.openById(sheetId);

  // keywords シートを作成
  ensureSheet(ss, 'keywords', [
    ['keyword'],
    ['高市'],
    ['移民'],
    ['トランプ'],
  ]);

  // persons シートを作成
  // person_name: タブに表示される名前
  // username:    X の @ユーザー名（@ なし）
  ensureSheet(ss, 'persons', [
    ['person_name', 'username'],
    ['高市早苗',    'takaichi_sanae'],
  ]);

  // latest シートを作成（空・ヘッダーなし。fetchAndSave() が自動生成）
  ensureSheet(ss, 'latest', []);

  // week シートを作成（空）
  ensureSheet(ss, 'week', []);

  // persons_latest シートを作成（空・ヘッダーなし。fetchAndSave() が自動生成）
  ensureSheet(ss, 'persons_latest', []);

  // 2026〜2030 の year シートを作成（空・ヘッダーなし。fetchAndSave() が自動生成）
  // 2031以降は手動で追加し、sheets-config.json に URL を記載してください
  for (let y = 2026; y <= 2030; y++) {
    ensureSheet(ss, String(y), []);
  }

  console.log('Sheets setup complete.');
}

function ensureSheet(ss, name, initialData) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    console.log(`Created sheet: ${name}`);
  } else {
    console.log(`Sheet already exists: ${name}`);
  }
  if (initialData && initialData.length > 0) {
    const existing = sheet.getLastRow();
    if (existing === 0) {
      sheet.getRange(1, 1, initialData.length, initialData[0].length)
        .setValues(initialData);
    }
  }
}

// ============================================================
// 3. 毎朝 07:00 JST のトリガーを設定
// ============================================================

function setupTrigger() {
  // 既存の fetchAndSave トリガーを削除（重複防止）
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'fetchAndSave') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // 毎日 07:00〜08:00 JST に実行（GASのタイムゾーン設定に依存するため幅を持たせる）
  ScriptApp.newTrigger('fetchAndSave')
    .timeBased()
    .atHour(7)
    .everyDays(1)
    .inTimezone('Asia/Tokyo')
    .create();

  console.log('Trigger set: fetchAndSave at 07:00 JST every day.');
}

// ============================================================
// 4. 一括セットアップ（上記3つをまとめて実行）
// ============================================================

function setupAll() {
  setupSheets();
  setupTrigger();
  console.log('setupAll complete. setProperties() は別途実行してください。');
}

// ============================================================
// 5. トリガーの確認・削除ユーティリティ
// ============================================================

function listTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    console.log(`${t.getHandlerFunction()} — ${t.getEventType()}`);
  });
  if (triggers.length === 0) console.log('No triggers set.');
}

function deleteAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  console.log('All triggers deleted.');
}
