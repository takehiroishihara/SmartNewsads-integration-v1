/**
 * SmartNews Ads API - BigQuery連携スクリプト
 *
 * SmartNews Ads APIからデータを取得し、BigQueryのテーブルに出力します。
 *
 * 【テーブル一覧】
 * - ad_daily_report: 広告日別レポート
 * - campaigns: キャンペーンマスタ
 * - ad_groups: 広告グループマスタ
 * - audience_age_report: 年齢別レポート
 * - audience_gender_report: 性別別レポート
 */

// ===========================================
// 共通設定
// ===========================================

const CONFIG = {
  // SmartNews API設定
  API_BASE: 'https://ads.smartnews.com/api/ma/v3',
  TOKEN_URL: 'https://ads.smartnews.com/api/token',

  // レポート設定
  DAY_COUNT: 45,

  // BigQuery設定
  BQ_PROJECT_ID: 'because-of-you-432707',
  BQ_DATASET_ID: 'smartnews_ads_raw',

  // BigQueryテーブル名設定
  TABLES: {
    AD_DAILY_REPORT: 'ad_daily_report',
    CAMPAIGNS: 'campaigns',
    AD_GROUPS: 'ad_groups',
    AUDIENCE_AGE_REPORT: 'audience_age_report',
    AUDIENCE_GENDER_REPORT: 'audience_gender_report'
  },

  // ページネーション設定
  PAGE_SIZE: 1000,

  // リトライ設定
  MAX_RETRY: 3,
  RETRY_WAIT_MS: 1000
};

// ===========================================
// BigQuery 転送用共通関数
// ===========================================

/**
 * 2次元配列データをCSVに変換してBigQueryにロードする
 */
function loadToBigQuery_(tableId, dataHeader, dataBody) {
  if (!dataBody || dataBody.length === 0) {
    log_(`⚠ ${tableId}: データがないためスキップします`);
    return;
  }

  log_(`🚀 BigQuery転送開始: ${tableId} (${dataBody.length}件)`);

  const allData = [dataHeader, ...dataBody];

  const csvString = allData.map(row => {
    return row.map(cell => {
      if (cell === null || cell === undefined) {
        return '';
      }
      const str = String(cell);
      if (str.includes('"') || str.includes(',') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(',');
  }).join('\n');

  const blob = Utilities.newBlob(csvString, 'application/octet-stream');

  const job = {
    configuration: {
      load: {
        destinationTable: {
          projectId: CONFIG.BQ_PROJECT_ID,
          datasetId: CONFIG.BQ_DATASET_ID,
          tableId: tableId
        },
        writeDisposition: 'WRITE_TRUNCATE',
        createDisposition: 'CREATE_IF_NEEDED',
        sourceFormat: 'CSV',
        autodetect: true,
        skipLeadingRows: 1
      }
    }
  };

  try {
    const insertJob = BigQuery.Jobs.insert(job, CONFIG.BQ_PROJECT_ID, blob);
    log_(`✅ BigQueryジョブ投入成功: JobId ${insertJob.jobReference.jobId}`);
  } catch (e) {
    log_(`❌ BigQuery転送エラー: ${e.message}`);
    throw e;
  }
}

// ===========================================
// 共通ユーティリティ関数
// ===========================================

/**
 * ログ出力
 */
function log_(message) {
  Logger.log(message);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logSheet = ss.getSheetByName('ログ');
    if (logSheet) {
      const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
      logSheet.appendRow([now, message]);
    }
  } catch (e) {
    // ログ出力エラーは無視
  }
}

/**
 * スクリプトプロパティから認証情報を取得
 */
function getCredentials_() {
  const props = PropertiesService.getScriptProperties();
  return {
    clientId: props.getProperty('SMARTNEWS_CLIENT_ID'),
    clientSecret: props.getProperty('SMARTNEWS_CLIENT_SECRET'),
    accessToken: props.getProperty('SMARTNEWS_ACCESS_TOKEN'),
    refreshToken: props.getProperty('SMARTNEWS_REFRESH_TOKEN'),
    tokenExpiresAt: props.getProperty('SMARTNEWS_TOKEN_EXPIRES_AT')
  };
}

/**
 * アクセストークンを保存
 */
function saveAccessToken_(accessToken, expiresIn) {
  const props = PropertiesService.getScriptProperties();
  const expiresAt = new Date().getTime() + (expiresIn * 1000) - 60000; // 1分前に期限切れとする
  props.setProperty('SMARTNEWS_ACCESS_TOKEN', accessToken);
  props.setProperty('SMARTNEWS_TOKEN_EXPIRES_AT', String(expiresAt));
}

/**
 * アクセストークンが有効か確認
 */
function isTokenValid_() {
  const creds = getCredentials_();
  if (!creds.accessToken || !creds.tokenExpiresAt) {
    return false;
  }
  const expiresAt = parseInt(creds.tokenExpiresAt, 10);
  return new Date().getTime() < expiresAt;
}

/**
 * アクセストークン更新
 */
function refreshAccessToken() {
  log_('🔑 アクセストークン更新開始');

  const creds = getCredentials_();

  if (!creds.clientId || !creds.clientSecret || !creds.refreshToken) {
    log_('❌ 認証情報が設定されていません。setupCredentials()を実行してください。');
    throw new Error('認証情報が未設定です');
  }

  const payload = {
    'grant_type': 'refresh_token',
    'refresh_token': creds.refreshToken,
    'client_id': creds.clientId,
    'client_secret': creds.clientSecret
  };

  const options = {
    method: 'POST',
    contentType: 'application/x-www-form-urlencoded',
    payload: Object.keys(payload).map(k => `${encodeURIComponent(k)}=${encodeURIComponent(payload[k])}`).join('&'),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(CONFIG.TOKEN_URL, options);
    const status = response.getResponseCode();
    const content = response.getContentText();

    if (status === 200) {
      const json = JSON.parse(content);
      saveAccessToken_(json.access_token, json.expires_in || 86400);
      log_('✅ アクセストークン更新成功');
      return json.access_token;
    } else {
      log_(`❌ トークン更新エラー(${status}): ${content}`);
      throw new Error(`トークン更新失敗: ${status}`);
    }
  } catch (e) {
    log_(`❌ トークン更新例外: ${e.message}`);
    throw e;
  }
}

/**
 * 有効なアクセストークンを取得（必要に応じて更新）
 */
function getValidAccessToken_() {
  if (isTokenValid_()) {
    return getCredentials_().accessToken;
  }
  return refreshAccessToken();
}

/**
 * 認証ヘッダー取得
 */
function getAuthHeaders_() {
  const accessToken = getValidAccessToken_();
  if (!accessToken) return null;

  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
}

/**
 * 日付範囲計算（過去N日分）
 */
function getDateRange_(dayCount) {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() - 1); // 前日まで

  const start = new Date(end);
  start.setDate(start.getDate() - (dayCount - 1));

  // ISO 8601形式
  const startStr = Utilities.formatDate(start, 'UTC', "yyyy-MM-dd'T'00:00:00'Z'");
  const endStr = Utilities.formatDate(end, 'UTC', "yyyy-MM-dd'T'23:59:59'Z'");

  // DATE型用
  const startDateStr = Utilities.formatDate(start, 'UTC', 'yyyy-MM-dd');
  const endDateStr = Utilities.formatDate(end, 'UTC', 'yyyy-MM-dd');

  return { startStr, endStr, startDateStr, endDateStr };
}

/**
 * 対象アカウント一覧を設定シートから取得
 */
function getTargetAccounts_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('設定');

  if (!sheet) {
    log_('⚠ 「設定」シートが見つかりません');
    return [];
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    log_('⚠ 「設定」シートにアカウントが登録されていません');
    return [];
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  const accounts = [];

  data.forEach(row => {
    const adAccountId = String(row[0]).trim();
    const accountName = String(row[1] || '').trim();
    const isActive = String(row[2]).toLowerCase();

    if (adAccountId && (isActive === 'true' || isActive === 'yes' || isActive === '1')) {
      accounts.push({
        adAccountId: adAccountId,
        accountName: accountName
      });
    }
  });

  return accounts;
}

/**
 * APIリクエスト（リトライ機能付き）
 */
function fetchWithRetry_(url, options, maxRetry = CONFIG.MAX_RETRY) {
  let lastError = null;

  for (let i = 0; i < maxRetry; i++) {
    try {
      const response = UrlFetchApp.fetch(url, options);
      const status = response.getResponseCode();
      const content = response.getContentText();

      // 成功
      if (status === 200) {
        return JSON.parse(content);
      }

      // 認証エラー - トークンをリフレッシュしてリトライ
      if (status === 401) {
        log_(`⚠ 認証エラー(401) - トークン更新してリトライ`);
        refreshAccessToken();
        options.headers = getAuthHeaders_();
        continue;
      }

      // Rate Limit - 指数バックオフでリトライ
      if (status === 429) {
        const waitMs = CONFIG.RETRY_WAIT_MS * Math.pow(2, i);
        log_(`⚠ Rate Limit(429) - ${waitMs}ms待機後リトライ`);
        Utilities.sleep(waitMs);
        continue;
      }

      // サーバーエラー - リトライ
      if (status >= 500) {
        const waitMs = CONFIG.RETRY_WAIT_MS * Math.pow(2, i);
        log_(`⚠ サーバーエラー(${status}) - ${waitMs}ms待機後リトライ`);
        Utilities.sleep(waitMs);
        continue;
      }

      // その他のエラー
      throw new Error(`APIエラー(${status}): ${content.substring(0, 200)}`);

    } catch (e) {
      lastError = e;
      if (i < maxRetry - 1) {
        const waitMs = CONFIG.RETRY_WAIT_MS * Math.pow(2, i);
        log_(`⚠ 例外発生: ${e.message} - ${waitMs}ms待機後リトライ`);
        Utilities.sleep(waitMs);
      }
    }
  }

  throw lastError || new Error('APIリクエスト失敗');
}

/**
 * 現在のタイムスタンプ取得（BigQuery用）
 */
function getCurrentTimestamp_() {
  return Utilities.formatDate(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
}

// ===========================================
// 初回認証情報設定用関数
// ===========================================

/**
 * 初回認証情報設定（手動実行）
 * スクリプトエディタから直接実行してください
 */
function setupCredentials() {
  const props = PropertiesService.getScriptProperties();

  // ここに認証情報を設定（設定後はコメントアウト推奨）
  props.setProperty('SMARTNEWS_CLIENT_ID', 'YOUR_CLIENT_ID');
  props.setProperty('SMARTNEWS_CLIENT_SECRET', 'YOUR_CLIENT_SECRET');
  props.setProperty('SMARTNEWS_REFRESH_TOKEN', 'YOUR_REFRESH_TOKEN');

  log_('✅ 認証情報を設定しました');
  log_('⚠ セキュリティのため、設定後はこの関数内の値を削除またはコメントアウトしてください');
}

/**
 * 設定シートを初期化
 */
function initializeSettingsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('設定');

  if (!sheet) {
    sheet = ss.insertSheet('設定');
  }

  sheet.clear();

  const headers = ['ad_account_id', 'account_name', 'is_active'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');

  // サンプル行を追加
  sheet.getRange(2, 1, 1, 3).setValues([['YOUR_AD_ACCOUNT_ID', 'アカウント名', 'true']]);

  log_('✅ 「設定」シートを初期化しました');
  log_('⚠ ad_account_id列にSmartNews AdsのアカウントIDを設定してください');
}

/**
 * ログシートを初期化
 */
function initializeLogSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('ログ');

  if (!sheet) {
    sheet = ss.insertSheet('ログ');
  }

  sheet.clear();

  const headers = ['日時', 'メッセージ'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');

  log_('✅ 「ログ」シートを初期化しました');
}

// ===========================================
// キャンペーン取得
// ===========================================

/**
 * 全アカウントのキャンペーンを取得
 */
function fetchCampaigns() {
  log_('===== 🚀 キャンペーン取得開始 =====');

  const accounts = getTargetAccounts_();
  if (accounts.length === 0) {
    log_('⚠ 対象アカウントがありません');
    return;
  }

  log_(`📋 対象アカウント数: ${accounts.length}`);

  const allCampaigns = [];
  const timestamp = getCurrentTimestamp_();

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    log_(`[${i + 1}/${accounts.length}] ${account.adAccountId} (${account.accountName})`);

    try {
      const campaigns = fetchCampaignsForAccount_(account.adAccountId);

      campaigns.forEach(c => {
        allCampaigns.push([
          account.adAccountId,
          c.campaignId || '',
          c.campaignName || '',
          c.status || '',
          c.objective || '',
          c.dailyBudgetMicro || '',
          c.startDate || '',
          c.endDate || '',
          c.createdAt || '',
          c.updatedAt || '',
          timestamp
        ]);
      });

      log_(`  ✅ ${campaigns.length}件取得`);

    } catch (e) {
      log_(`  ❌ エラー: ${e.message}`);
    }

    if (i < accounts.length - 1) {
      Utilities.sleep(500);
    }
  }

  log_(`\n✅ キャンペーン総数: ${allCampaigns.length}件`);

  const bqHeader = [
    'ad_account_id', 'campaign_id', 'campaign_name', 'status', 'objective',
    'daily_budget_micro', 'start_date', 'end_date', 'created_at', 'updated_at', 'fetched_at'
  ];

  loadToBigQuery_(CONFIG.TABLES.CAMPAIGNS, bqHeader, allCampaigns);

  return allCampaigns;
}

/**
 * 特定アカウントのキャンペーンを取得
 */
function fetchCampaignsForAccount_(adAccountId) {
  const url = `${CONFIG.API_BASE}/ad_accounts/${adAccountId}/campaigns`;
  const headers = getAuthHeaders_();

  const options = {
    method: 'GET',
    headers: headers,
    muteHttpExceptions: true
  };

  const allCampaigns = [];
  let page = 1;
  let totalPages = 1;

  do {
    const pagedUrl = `${url}?page=${page}&page_size=${CONFIG.PAGE_SIZE}`;
    const json = fetchWithRetry_(pagedUrl, options);

    if (json.data && Array.isArray(json.data)) {
      json.data.forEach(campaign => {
        allCampaigns.push({
          campaignId: campaign.campaign_id || campaign.id,
          campaignName: campaign.campaign_name || campaign.name,
          status: campaign.status,
          objective: campaign.objective,
          dailyBudgetMicro: campaign.daily_budget_micro || campaign.daily_budget,
          startDate: campaign.start_date,
          endDate: campaign.end_date,
          createdAt: campaign.created_at,
          updatedAt: campaign.updated_at
        });
      });
    }

    if (json.pagination) {
      totalPages = json.pagination.total_pages || 1;
    }

    page++;

    if (page <= totalPages) {
      Utilities.sleep(200);
    }

  } while (page <= totalPages);

  return allCampaigns;
}

// ===========================================
// 広告グループ取得
// ===========================================

/**
 * 全アカウントの広告グループを取得
 */
function fetchAdGroups() {
  log_('===== 🚀 広告グループ取得開始 =====');

  const accounts = getTargetAccounts_();
  if (accounts.length === 0) {
    log_('⚠ 対象アカウントがありません');
    return;
  }

  log_(`📋 対象アカウント数: ${accounts.length}`);

  const allAdGroups = [];
  const timestamp = getCurrentTimestamp_();

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    log_(`[${i + 1}/${accounts.length}] ${account.adAccountId} (${account.accountName})`);

    try {
      const adGroups = fetchAdGroupsForAccount_(account.adAccountId);

      adGroups.forEach(ag => {
        allAdGroups.push([
          account.adAccountId,
          ag.campaignId || '',
          ag.adGroupId || '',
          ag.adGroupName || '',
          ag.status || '',
          ag.bidAmountMicro || '',
          ag.createdAt || '',
          ag.updatedAt || '',
          timestamp
        ]);
      });

      log_(`  ✅ ${adGroups.length}件取得`);

    } catch (e) {
      log_(`  ❌ エラー: ${e.message}`);
    }

    if (i < accounts.length - 1) {
      Utilities.sleep(500);
    }
  }

  log_(`\n✅ 広告グループ総数: ${allAdGroups.length}件`);

  const bqHeader = [
    'ad_account_id', 'campaign_id', 'ad_group_id', 'ad_group_name', 'status',
    'bid_amount_micro', 'created_at', 'updated_at', 'fetched_at'
  ];

  loadToBigQuery_(CONFIG.TABLES.AD_GROUPS, bqHeader, allAdGroups);

  return allAdGroups;
}

/**
 * 特定アカウントの広告グループを取得
 */
function fetchAdGroupsForAccount_(adAccountId) {
  const url = `${CONFIG.API_BASE}/ad_accounts/${adAccountId}/ad_groups`;
  const headers = getAuthHeaders_();

  const options = {
    method: 'GET',
    headers: headers,
    muteHttpExceptions: true
  };

  const allAdGroups = [];
  let page = 1;
  let totalPages = 1;

  do {
    const pagedUrl = `${url}?page=${page}&page_size=${CONFIG.PAGE_SIZE}`;
    const json = fetchWithRetry_(pagedUrl, options);

    if (json.data && Array.isArray(json.data)) {
      json.data.forEach(adGroup => {
        allAdGroups.push({
          campaignId: adGroup.campaign_id,
          adGroupId: adGroup.ad_group_id || adGroup.id,
          adGroupName: adGroup.ad_group_name || adGroup.name,
          status: adGroup.status,
          bidAmountMicro: adGroup.bid_amount_micro || adGroup.bid_amount,
          createdAt: adGroup.created_at,
          updatedAt: adGroup.updated_at
        });
      });
    }

    if (json.pagination) {
      totalPages = json.pagination.total_pages || 1;
    }

    page++;

    if (page <= totalPages) {
      Utilities.sleep(200);
    }

  } while (page <= totalPages);

  return allAdGroups;
}

// ===========================================
// 広告日別レポート取得
// ===========================================

/**
 * 全アカウントの広告日別レポートを取得
 */
function fetchAdDailyReport() {
  log_('===== 🚀 広告日別レポート取得開始 =====');

  const accounts = getTargetAccounts_();
  if (accounts.length === 0) {
    log_('⚠ 対象アカウントがありません');
    return;
  }

  const { startStr, endStr, startDateStr, endDateStr } = getDateRange_(CONFIG.DAY_COUNT);
  log_(`📆 対象期間: ${startDateStr} ～ ${endDateStr}`);
  log_(`📋 対象アカウント数: ${accounts.length}`);

  const allReportData = [];
  const timestamp = getCurrentTimestamp_();

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    log_(`[${i + 1}/${accounts.length}] ${account.adAccountId} (${account.accountName})`);

    try {
      const reportData = fetchAdDailyReportForAccount_(account.adAccountId, startStr, endStr);

      reportData.forEach(row => {
        allReportData.push([
          row.reportDate || '',
          account.adAccountId,
          row.campaignId || '',
          row.campaignName || '',
          row.adGroupId || '',
          row.adGroupName || '',
          row.adId || '',
          row.adName || '',
          row.impressions || 0,
          row.viewableImpressions || 0,
          row.clicks || 0,
          row.spendMicro || 0,
          row.conversions || 0,
          row.videoViews || 0,
          row.videoViewsP25 || 0,
          row.videoViewsP50 || 0,
          row.videoViewsP75 || 0,
          row.videoViewsP100 || 0,
          timestamp
        ]);
      });

      log_(`  ✅ ${reportData.length}件取得`);

    } catch (e) {
      log_(`  ❌ エラー: ${e.message}`);
    }

    if (i < accounts.length - 1) {
      Utilities.sleep(1000);
    }
  }

  log_(`\n✅ 広告日別レポート総数: ${allReportData.length}件`);

  const bqHeader = [
    'report_date', 'ad_account_id', 'campaign_id', 'campaign_name',
    'ad_group_id', 'ad_group_name', 'ad_id', 'ad_name',
    'impressions', 'viewable_impressions', 'clicks', 'spend_micro',
    'conversions', 'video_views', 'video_views_p25', 'video_views_p50',
    'video_views_p75', 'video_views_p100', 'fetched_at'
  ];

  loadToBigQuery_(CONFIG.TABLES.AD_DAILY_REPORT, bqHeader, allReportData);

  return allReportData;
}

/**
 * 特定アカウントの広告日別レポートを取得
 */
function fetchAdDailyReportForAccount_(adAccountId, since, until) {
  const baseUrl = `${CONFIG.API_BASE}/ad_accounts/${adAccountId}/insights/ads`;
  const headers = getAuthHeaders_();

  const fields = [
    'metadata_ad_id',
    'metadata_ad_name',
    'metadata_campaign_id',
    'metadata_campaign_name',
    'metadata_ad_group_id',
    'metadata_ad_group_name',
    'metrics_viewable_impression',
    'metrics_click',
    'metrics_cpm',
    'metrics_count_purchase',
    'metrics_video_views',
    'metrics_video_views_p25',
    'metrics_video_views_p50',
    'metrics_video_views_p75',
    'metrics_video_views_completed'
  ].join(',');

  const options = {
    method: 'GET',
    headers: headers,
    muteHttpExceptions: true
  };

  const allReportData = [];
  let page = 1;
  let totalPages = 1;

  do {
    const url = `${baseUrl}?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&fields=${fields}&breakdown_period=day&page=${page}&page_size=${CONFIG.PAGE_SIZE}`;

    const json = fetchWithRetry_(url, options);

    if (json.data && Array.isArray(json.data)) {
      json.data.forEach(item => {
        // 日付がbreakdownに含まれる場合
        const reportDate = item.breakdown?.period || item.date || '';

        // CPMからspendを逆算（CPM = spend / impressions * 1000）
        // APIがspendを直接返さない場合の対応
        const impressions = item.metrics_viewable_impression || 0;
        const cpm = item.metrics_cpm || 0;
        const spendMicro = impressions > 0 ? Math.round(cpm * impressions / 1000) : 0;

        allReportData.push({
          reportDate: reportDate.split('T')[0], // YYYY-MM-DD形式に
          campaignId: item.metadata_campaign_id,
          campaignName: item.metadata_campaign_name,
          adGroupId: item.metadata_ad_group_id,
          adGroupName: item.metadata_ad_group_name,
          adId: item.metadata_ad_id,
          adName: item.metadata_ad_name,
          impressions: impressions,
          viewableImpressions: item.metrics_viewable_impression || 0,
          clicks: item.metrics_click || 0,
          spendMicro: spendMicro,
          conversions: item.metrics_count_purchase || 0,
          videoViews: item.metrics_video_views || 0,
          videoViewsP25: item.metrics_video_views_p25 || 0,
          videoViewsP50: item.metrics_video_views_p50 || 0,
          videoViewsP75: item.metrics_video_views_p75 || 0,
          videoViewsP100: item.metrics_video_views_completed || 0
        });
      });
    }

    if (json.pagination) {
      totalPages = json.pagination.total_pages || 1;
    }

    page++;

    if (page <= totalPages) {
      Utilities.sleep(300);
    }

  } while (page <= totalPages);

  return allReportData;
}

// ===========================================
// 年齢別レポート取得
// ===========================================

/**
 * 全アカウントの年齢別レポートを取得
 */
function fetchAudienceAgeReport() {
  log_('===== 🚀 年齢別レポート取得開始 =====');

  const accounts = getTargetAccounts_();
  if (accounts.length === 0) {
    log_('⚠ 対象アカウントがありません');
    return;
  }

  const { startStr, endStr, startDateStr, endDateStr } = getDateRange_(CONFIG.DAY_COUNT);
  log_(`📆 対象期間: ${startDateStr} ～ ${endDateStr}`);
  log_(`📋 対象アカウント数: ${accounts.length}`);

  const allReportData = [];
  const timestamp = getCurrentTimestamp_();

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    log_(`[${i + 1}/${accounts.length}] ${account.adAccountId} (${account.accountName})`);

    try {
      const reportData = fetchAudienceReportForAccount_(
        account.adAccountId,
        startStr,
        endStr,
        'age'
      );

      reportData.forEach(row => {
        allReportData.push([
          account.adAccountId,
          startDateStr,
          endDateStr,
          row.dimension || '',
          row.impressions || 0,
          row.clicks || 0,
          row.spendMicro || 0,
          row.conversions || 0,
          timestamp
        ]);
      });

      log_(`  ✅ ${reportData.length}件取得`);

    } catch (e) {
      log_(`  ❌ エラー: ${e.message}`);
    }

    if (i < accounts.length - 1) {
      Utilities.sleep(500);
    }
  }

  log_(`\n✅ 年齢別レポート総数: ${allReportData.length}件`);

  const bqHeader = [
    'ad_account_id', 'period_start', 'period_end', 'age_range',
    'impressions', 'clicks', 'spend_micro', 'conversions', 'fetched_at'
  ];

  loadToBigQuery_(CONFIG.TABLES.AUDIENCE_AGE_REPORT, bqHeader, allReportData);

  return allReportData;
}

// ===========================================
// 性別別レポート取得
// ===========================================

/**
 * 全アカウントの性別別レポートを取得
 */
function fetchAudienceGenderReport() {
  log_('===== 🚀 性別別レポート取得開始 =====');

  const accounts = getTargetAccounts_();
  if (accounts.length === 0) {
    log_('⚠ 対象アカウントがありません');
    return;
  }

  const { startStr, endStr, startDateStr, endDateStr } = getDateRange_(CONFIG.DAY_COUNT);
  log_(`📆 対象期間: ${startDateStr} ～ ${endDateStr}`);
  log_(`📋 対象アカウント数: ${accounts.length}`);

  const allReportData = [];
  const timestamp = getCurrentTimestamp_();

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    log_(`[${i + 1}/${accounts.length}] ${account.adAccountId} (${account.accountName})`);

    try {
      const reportData = fetchAudienceReportForAccount_(
        account.adAccountId,
        startStr,
        endStr,
        'gender'
      );

      reportData.forEach(row => {
        allReportData.push([
          account.adAccountId,
          startDateStr,
          endDateStr,
          row.dimension || '',
          row.impressions || 0,
          row.clicks || 0,
          row.spendMicro || 0,
          row.conversions || 0,
          timestamp
        ]);
      });

      log_(`  ✅ ${reportData.length}件取得`);

    } catch (e) {
      log_(`  ❌ エラー: ${e.message}`);
    }

    if (i < accounts.length - 1) {
      Utilities.sleep(500);
    }
  }

  log_(`\n✅ 性別別レポート総数: ${allReportData.length}件`);

  const bqHeader = [
    'ad_account_id', 'period_start', 'period_end', 'gender',
    'impressions', 'clicks', 'spend_micro', 'conversions', 'fetched_at'
  ];

  loadToBigQuery_(CONFIG.TABLES.AUDIENCE_GENDER_REPORT, bqHeader, allReportData);

  return allReportData;
}

/**
 * 特定アカウントのオーディエンスレポートを取得（年齢・性別共通）
 */
function fetchAudienceReportForAccount_(adAccountId, since, until, breakdownType) {
  const baseUrl = `${CONFIG.API_BASE}/ad_accounts/${adAccountId}/aggregated_insights/ads`;
  const headers = getAuthHeaders_();

  const fields = [
    'metrics_viewable_impression',
    'metrics_click',
    'metrics_cpm',
    'metrics_count_purchase'
  ].join(',');

  const options = {
    method: 'GET',
    headers: headers,
    muteHttpExceptions: true
  };

  const url = `${baseUrl}?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&fields=${fields}&breakdown_type=${breakdownType}`;

  const json = fetchWithRetry_(url, options);

  const reportData = [];

  if (json.data && Array.isArray(json.data)) {
    json.data.forEach(item => {
      // 年齢または性別の値を取得
      const dimension = item.breakdown?.[breakdownType] || item[breakdownType] || '';

      // CPMからspendを逆算
      const impressions = item.metrics_viewable_impression || 0;
      const cpm = item.metrics_cpm || 0;
      const spendMicro = impressions > 0 ? Math.round(cpm * impressions / 1000) : 0;

      reportData.push({
        dimension: dimension,
        impressions: impressions,
        clicks: item.metrics_click || 0,
        spendMicro: spendMicro,
        conversions: item.metrics_count_purchase || 0
      });
    });
  }

  return reportData;
}

// ===========================================
// メイン実行関数
// ===========================================

/**
 * 全テーブル更新（メイン実行関数）
 */
function main() {
  log_('🚀🚀🚀 SmartNews Ads データ一括取得開始 🚀🚀🚀');

  const startTime = new Date();

  try {
    // 1. キャンペーンマスタ
    fetchCampaigns();
    Utilities.sleep(2000);

    // 2. 広告グループマスタ
    fetchAdGroups();
    Utilities.sleep(2000);

    // 3. 広告日別レポート
    fetchAdDailyReport();
    Utilities.sleep(2000);

    // 4. 年齢別レポート
    fetchAudienceAgeReport();
    Utilities.sleep(2000);

    // 5. 性別別レポート
    fetchAudienceGenderReport();

  } catch (e) {
    log_(`❌ 致命的エラー: ${e.message}`);
    log_(e.stack);
  }

  const endTime = new Date();
  const duration = Math.round((endTime - startTime) / 1000 / 60);

  log_(`\n🎉🎉🎉 SmartNews Ads データ一括取得完了 🎉🎉🎉`);
  log_(`処理時間: 約${duration}分`);
}

// ===========================================
// 個別テスト用関数
// ===========================================

/**
 * 認証テスト
 */
function testAuthentication() {
  log_('===== 認証テスト =====');

  try {
    const token = getValidAccessToken_();
    log_(`✅ アクセストークン取得成功: ${token.substring(0, 20)}...`);
  } catch (e) {
    log_(`❌ 認証失敗: ${e.message}`);
  }
}

/**
 * アカウント一覧テスト
 */
function testGetAccounts() {
  log_('===== アカウント一覧テスト =====');

  const accounts = getTargetAccounts_();
  log_(`取得件数: ${accounts.length}`);

  accounts.forEach((acc, i) => {
    log_(`[${i + 1}] ${acc.adAccountId}: ${acc.accountName}`);
  });
}

/**
 * 単一アカウントでキャンペーン取得テスト
 */
function testFetchCampaignsSingle() {
  log_('===== キャンペーン取得テスト（単一アカウント） =====');

  const accounts = getTargetAccounts_();
  if (accounts.length === 0) {
    log_('⚠ 対象アカウントがありません');
    return;
  }

  const account = accounts[0];
  log_(`テスト対象: ${account.adAccountId} (${account.accountName})`);

  try {
    const campaigns = fetchCampaignsForAccount_(account.adAccountId);
    log_(`✅ ${campaigns.length}件取得`);

    campaigns.slice(0, 5).forEach((c, i) => {
      log_(`[${i + 1}] ${c.campaignId}: ${c.campaignName} (${c.status})`);
    });
  } catch (e) {
    log_(`❌ エラー: ${e.message}`);
  }
}

/**
 * 単一アカウントで広告レポート取得テスト
 */
function testFetchAdReportSingle() {
  log_('===== 広告レポート取得テスト（単一アカウント） =====');

  const accounts = getTargetAccounts_();
  if (accounts.length === 0) {
    log_('⚠ 対象アカウントがありません');
    return;
  }

  const account = accounts[0];
  const { startStr, endStr, startDateStr, endDateStr } = getDateRange_(7); // テスト用に7日間

  log_(`テスト対象: ${account.adAccountId} (${account.accountName})`);
  log_(`期間: ${startDateStr} ～ ${endDateStr}`);

  try {
    const reportData = fetchAdDailyReportForAccount_(account.adAccountId, startStr, endStr);
    log_(`✅ ${reportData.length}件取得`);

    reportData.slice(0, 5).forEach((r, i) => {
      log_(`[${i + 1}] ${r.reportDate} | ${r.adName} | imp:${r.impressions} click:${r.clicks}`);
    });
  } catch (e) {
    log_(`❌ エラー: ${e.message}`);
  }
}

// ===========================================
// トリガー設定用関数
// ===========================================

/**
 * 毎日実行トリガーを設定
 */
function createDailyTrigger() {
  // 既存のトリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'main') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // 毎日午前6時に実行
  ScriptApp.newTrigger('main')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();

  log_('✅ 毎日午前6時実行のトリガーを設定しました');
}

/**
 * トリガーを削除
 */
function deleteDailyTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'main') {
      ScriptApp.deleteTrigger(trigger);
      log_('✅ トリガーを削除しました');
    }
  });
}
