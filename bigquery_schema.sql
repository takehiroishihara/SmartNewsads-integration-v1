-- SmartNews Ads BigQuery スキーマ定義
-- プロジェクトID: because-of-you-432707
-- データセット名: smartnews_ads_raw

-- データセット作成
CREATE SCHEMA IF NOT EXISTS `because-of-you-432707.smartnews_ads_raw`
OPTIONS(
  location = 'asia-northeast1',
  description = 'SmartNews Ads APIから取得したデータ'
);

-- ===========================================
-- 1. ad_daily_report - 広告日別レポート
-- ===========================================
CREATE TABLE IF NOT EXISTS `because-of-you-432707.smartnews_ads_raw.ad_daily_report`
(
  report_date DATE OPTIONS(description='レポート日'),
  ad_account_id STRING OPTIONS(description='広告アカウントID'),
  campaign_id STRING OPTIONS(description='キャンペーンID'),
  campaign_name STRING OPTIONS(description='キャンペーン名'),
  ad_group_id STRING OPTIONS(description='広告グループID'),
  ad_group_name STRING OPTIONS(description='広告グループ名'),
  ad_id STRING OPTIONS(description='広告ID'),
  ad_name STRING OPTIONS(description='広告名'),
  impressions INT64 OPTIONS(description='インプレッション数'),
  viewable_impressions INT64 OPTIONS(description='ビューアブルインプレッション数'),
  clicks INT64 OPTIONS(description='クリック数'),
  spend_micro INT64 OPTIONS(description='消化金額（マイクロ単位、実金額×1,000,000）'),
  conversions INT64 OPTIONS(description='コンバージョン数'),
  video_views INT64 OPTIONS(description='動画再生数'),
  video_views_p25 INT64 OPTIONS(description='動画25%再生数'),
  video_views_p50 INT64 OPTIONS(description='動画50%再生数'),
  video_views_p75 INT64 OPTIONS(description='動画75%再生数'),
  video_views_p100 INT64 OPTIONS(description='動画100%再生数'),
  fetched_at TIMESTAMP OPTIONS(description='データ取得日時')
)
OPTIONS(
  description='広告ID単位の日別パフォーマンスデータ'
);

-- ===========================================
-- 2. campaigns - キャンペーンマスタ
-- ===========================================
CREATE TABLE IF NOT EXISTS `because-of-you-432707.smartnews_ads_raw.campaigns`
(
  ad_account_id STRING OPTIONS(description='広告アカウントID'),
  campaign_id STRING OPTIONS(description='キャンペーンID'),
  campaign_name STRING OPTIONS(description='キャンペーン名'),
  status STRING OPTIONS(description='ステータス'),
  objective STRING OPTIONS(description='目的'),
  daily_budget_micro INT64 OPTIONS(description='日予算（マイクロ単位）'),
  start_date DATE OPTIONS(description='開始日'),
  end_date DATE OPTIONS(description='終了日'),
  created_at TIMESTAMP OPTIONS(description='作成日時'),
  updated_at TIMESTAMP OPTIONS(description='更新日時'),
  fetched_at TIMESTAMP OPTIONS(description='データ取得日時')
)
OPTIONS(
  description='キャンペーンマスタ'
);

-- ===========================================
-- 3. ad_groups - 広告グループマスタ
-- ===========================================
CREATE TABLE IF NOT EXISTS `because-of-you-432707.smartnews_ads_raw.ad_groups`
(
  ad_account_id STRING OPTIONS(description='広告アカウントID'),
  campaign_id STRING OPTIONS(description='キャンペーンID'),
  ad_group_id STRING OPTIONS(description='広告グループID'),
  ad_group_name STRING OPTIONS(description='広告グループ名'),
  status STRING OPTIONS(description='ステータス'),
  bid_amount_micro INT64 OPTIONS(description='入札額（マイクロ単位）'),
  created_at TIMESTAMP OPTIONS(description='作成日時'),
  updated_at TIMESTAMP OPTIONS(description='更新日時'),
  fetched_at TIMESTAMP OPTIONS(description='データ取得日時')
)
OPTIONS(
  description='広告グループマスタ'
);

-- ===========================================
-- 4. audience_age_report - 年齢別レポート
-- ===========================================
CREATE TABLE IF NOT EXISTS `because-of-you-432707.smartnews_ads_raw.audience_age_report`
(
  ad_account_id STRING OPTIONS(description='広告アカウントID'),
  period_start DATE OPTIONS(description='集計期間開始日'),
  period_end DATE OPTIONS(description='集計期間終了日'),
  age_range STRING OPTIONS(description='年齢帯（例: "20_24", "25_29"）'),
  impressions INT64 OPTIONS(description='インプレッション数'),
  clicks INT64 OPTIONS(description='クリック数'),
  spend_micro INT64 OPTIONS(description='消化金額（マイクロ単位）'),
  conversions INT64 OPTIONS(description='コンバージョン数'),
  fetched_at TIMESTAMP OPTIONS(description='データ取得日時')
)
OPTIONS(
  description='期間全体の年齢別集計データ（日別クロス集計は不可）'
);

-- ===========================================
-- 5. audience_gender_report - 性別別レポート
-- ===========================================
CREATE TABLE IF NOT EXISTS `because-of-you-432707.smartnews_ads_raw.audience_gender_report`
(
  ad_account_id STRING OPTIONS(description='広告アカウントID'),
  period_start DATE OPTIONS(description='集計期間開始日'),
  period_end DATE OPTIONS(description='集計期間終了日'),
  gender STRING OPTIONS(description='性別（male, female, unknown）'),
  impressions INT64 OPTIONS(description='インプレッション数'),
  clicks INT64 OPTIONS(description='クリック数'),
  spend_micro INT64 OPTIONS(description='消化金額（マイクロ単位）'),
  conversions INT64 OPTIONS(description='コンバージョン数'),
  fetched_at TIMESTAMP OPTIONS(description='データ取得日時')
)
OPTIONS(
  description='期間全体の性別別集計データ（日別クロス集計は不可）'
);

-- ===========================================
-- 分析用ビュー（オプション）
-- ===========================================

-- 広告日別レポート（金額を円に変換）
CREATE OR REPLACE VIEW `because-of-you-432707.smartnews_ads_raw.v_ad_daily_report` AS
SELECT
  report_date,
  ad_account_id,
  campaign_id,
  campaign_name,
  ad_group_id,
  ad_group_name,
  ad_id,
  ad_name,
  impressions,
  viewable_impressions,
  clicks,
  spend_micro,
  ROUND(spend_micro / 1000000, 2) AS spend_jpy,
  conversions,
  video_views,
  video_views_p25,
  video_views_p50,
  video_views_p75,
  video_views_p100,
  -- 計算指標
  SAFE_DIVIDE(clicks, impressions) * 100 AS ctr,
  SAFE_DIVIDE(spend_micro / 1000000, clicks) AS cpc,
  SAFE_DIVIDE(spend_micro / 1000000, impressions) * 1000 AS cpm,
  SAFE_DIVIDE(conversions, clicks) * 100 AS cvr,
  SAFE_DIVIDE(spend_micro / 1000000, conversions) AS cpa,
  fetched_at
FROM `because-of-you-432707.smartnews_ads_raw.ad_daily_report`;

-- 年齢別レポート（金額を円に変換）
CREATE OR REPLACE VIEW `because-of-you-432707.smartnews_ads_raw.v_audience_age_report` AS
SELECT
  ad_account_id,
  period_start,
  period_end,
  age_range,
  impressions,
  clicks,
  spend_micro,
  ROUND(spend_micro / 1000000, 2) AS spend_jpy,
  conversions,
  SAFE_DIVIDE(clicks, impressions) * 100 AS ctr,
  SAFE_DIVIDE(conversions, clicks) * 100 AS cvr,
  fetched_at
FROM `because-of-you-432707.smartnews_ads_raw.audience_age_report`;

-- 性別別レポート（金額を円に変換）
CREATE OR REPLACE VIEW `because-of-you-432707.smartnews_ads_raw.v_audience_gender_report` AS
SELECT
  ad_account_id,
  period_start,
  period_end,
  gender,
  impressions,
  clicks,
  spend_micro,
  ROUND(spend_micro / 1000000, 2) AS spend_jpy,
  conversions,
  SAFE_DIVIDE(clicks, impressions) * 100 AS ctr,
  SAFE_DIVIDE(conversions, clicks) * 100 AS cvr,
  fetched_at
FROM `because-of-you-432707.smartnews_ads_raw.audience_gender_report`;
