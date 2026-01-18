# SmartNews Ads → BigQuery 連携 GAS スクリプト

SmartNews Ads APIからデータを取得し、BigQueryに格納するGoogle Apps Scriptです。

## 概要

### 取得データ

| テーブル名 | 説明 | 更新方式 |
|-----------|------|---------|
| `ad_daily_report` | 広告日別レポート（過去45日分） | WRITE_TRUNCATE |
| `campaigns` | キャンペーンマスタ | WRITE_TRUNCATE |
| `ad_groups` | 広告グループマスタ | WRITE_TRUNCATE |
| `audience_age_report` | 年齢別レポート（期間集計） | WRITE_TRUNCATE |
| `audience_gender_report` | 性別別レポート（期間集計） | WRITE_TRUNCATE |

### BigQuery設定

- **プロジェクトID:** `because-of-you-432707`
- **データセット名:** `smartnews_ads_raw`

## セットアップ手順

### 1. BigQueryデータセット作成

`bigquery_schema.sql` をBigQueryコンソールで実行してデータセットとテーブルを作成します。

```sql
-- データセット作成のみ実行する場合
CREATE SCHEMA IF NOT EXISTS `because-of-you-432707.smartnews_ads_raw`
OPTIONS(
  location = 'asia-northeast1',
  description = 'SmartNews Ads APIから取得したデータ'
);
```

### 2. Google Apps Script プロジェクト作成

1. [Google Apps Script](https://script.google.com/) にアクセス
2. 「新しいプロジェクト」を作成
3. `SmartNewsAds_BigQuery.gs` の内容をコードエディタにコピー
4. プロジェクト名を設定（例：SmartNews Ads BigQuery Integration）

### 3. BigQuery API 有効化

1. Apps Script エディタで「サービス」→「+」をクリック
2. 「BigQuery API」を選択して追加

### 4. スプレッドシート連携（任意）

ログ出力や設定管理にスプレッドシートを使用する場合：

1. 新しいGoogle スプレッドシートを作成
2. 「拡張機能」→「Apps Script」からスクリプトを開く
3. スクリプトをペースト

### 5. 認証情報設定

スクリプトエディタで `setupCredentials()` 関数を編集し、SmartNews Adsの認証情報を設定します：

```javascript
function setupCredentials() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SMARTNEWS_CLIENT_ID', 'YOUR_CLIENT_ID');
  props.setProperty('SMARTNEWS_CLIENT_SECRET', 'YOUR_CLIENT_SECRET');
  props.setProperty('SMARTNEWS_REFRESH_TOKEN', 'YOUR_REFRESH_TOKEN');
  log_('認証情報を設定しました');
}
```

1. 上記関数にSmartNews Adsの認証情報を入力
2. `setupCredentials()` を実行
3. **重要**: 設定後はセキュリティのため値を削除またはコメントアウト

### 6. 設定シート作成

`initializeSettingsSheet()` を実行して設定シートを作成し、対象アカウントを登録します：

| ad_account_id | account_name | is_active |
|---------------|--------------|-----------|
| 123456789 | アカウント1 | true |
| 987654321 | アカウント2 | true |

### 7. 動作確認

1. `testAuthentication()` - 認証テスト
2. `testGetAccounts()` - アカウント一覧テスト
3. `testFetchCampaignsSingle()` - キャンペーン取得テスト
4. `testFetchAdReportSingle()` - 広告レポート取得テスト

### 8. トリガー設定

定期実行を設定する場合：

```javascript
// 毎日午前6時に実行
createDailyTrigger();
```

または、Apps Script エディタの「トリガー」から手動で設定。

## 実行関数一覧

### メイン関数

| 関数名 | 説明 |
|--------|------|
| `main()` | 全テーブルを一括更新 |
| `fetchCampaigns()` | キャンペーンマスタ取得 |
| `fetchAdGroups()` | 広告グループマスタ取得 |
| `fetchAdDailyReport()` | 広告日別レポート取得 |
| `fetchAudienceAgeReport()` | 年齢別レポート取得 |
| `fetchAudienceGenderReport()` | 性別別レポート取得 |

### ユーティリティ関数

| 関数名 | 説明 |
|--------|------|
| `refreshAccessToken()` | アクセストークン更新 |
| `setupCredentials()` | 初回認証情報設定 |
| `initializeSettingsSheet()` | 設定シート初期化 |
| `initializeLogSheet()` | ログシート初期化 |
| `createDailyTrigger()` | 日次トリガー設定 |
| `deleteDailyTrigger()` | トリガー削除 |

### テスト関数

| 関数名 | 説明 |
|--------|------|
| `testAuthentication()` | 認証テスト |
| `testGetAccounts()` | アカウント一覧テスト |
| `testFetchCampaignsSingle()` | キャンペーン取得テスト |
| `testFetchAdReportSingle()` | 広告レポート取得テスト |

## SmartNews Ads API 仕様

### 認証

- OAuth2.0 Client Credentials Flow
- トークンエンドポイント: `https://ads.smartnews.com/api/token`
- アクセストークン有効期限: 24時間

### ベースURL

`https://ads.smartnews.com/api/ma/v3`

### 使用エンドポイント

| エンドポイント | 説明 |
|---------------|------|
| `POST /api/token` | アクセストークン取得 |
| `GET /ad_accounts/{id}/campaigns` | キャンペーン一覧 |
| `GET /ad_accounts/{id}/ad_groups` | 広告グループ一覧 |
| `GET /ad_accounts/{id}/insights/ads` | 広告レポート（日別） |
| `GET /ad_accounts/{id}/aggregated_insights/ads` | オーディエンスレポート |

### 通貨単位

SmartNews APIはマイクロ単位（実金額 × 1,000,000）で返却します。

例: ¥120 = 120,000,000 micro

### ページネーション

- `page_size`: 最大1000（デフォルト1000）
- `page`: ページ番号（1始まり）

## エラーハンドリング

| エラーコード | 対応 |
|-------------|------|
| 401 | トークンをリフレッシュしてリトライ |
| 429 | 指数バックオフでリトライ（最大3回） |
| 5xx | 3回までリトライ |

## ファイル構成

```
.
├── README.md                    # このファイル
├── SmartNewsAds_BigQuery.gs     # GASスクリプト本体
└── bigquery_schema.sql          # BigQueryスキーマ定義
```

## 注意事項

1. **認証情報の管理**: `setupCredentials()` 実行後は認証情報をコードから削除してください
2. **実行時間制限**: GASの実行時間制限（6分）に注意。アカウント数が多い場合は分割実行を検討
3. **BigQuery料金**: データ量に応じてBigQueryの料金が発生します
4. **API Rate Limit**: SmartNews APIのRate Limitに注意。スクリプト内で適切な待機時間を設定済み

## トラブルシューティング

### 認証エラー（401）が頻発する

- リフレッシュトークンが期限切れの可能性があります
- SmartNews Adsの管理画面で新しいトークンを発行してください

### BigQuery転送エラー

- BigQuery APIが有効になっているか確認
- サービスアカウントに適切な権限があるか確認
- データセットが存在するか確認

### データが取得できない

- 設定シートのアカウントIDが正しいか確認
- `is_active` が `true` になっているか確認
- テスト関数で個別に動作確認
