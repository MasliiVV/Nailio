ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS wallet_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS amount INTEGER,
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'UAH',
  ADD COLUMN IF NOT EXISTS cancel_reason VARCHAR(500);

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS payment_provider "PaymentProvider",
  ADD COLUMN IF NOT EXISTS card_token_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS card_last_four VARCHAR(4),
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE subscriptions
  ALTER COLUMN current_period_start DROP NOT NULL,
  ALTER COLUMN current_period_end DROP NOT NULL,
  ALTER COLUMN currency SET DEFAULT 'UAH';

ALTER TABLE subscription_payments
  ADD COLUMN IF NOT EXISTS payment_provider "PaymentProvider",
  ADD COLUMN IF NOT EXISTS failure_reason VARCHAR(500),
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(10,4);

UPDATE subscription_payments
SET payment_provider = CASE
  WHEN provider = 'liqpay' THEN 'liqpay'::"PaymentProvider"
  ELSE 'monobank'::"PaymentProvider"
END
WHERE payment_provider IS NULL;

UPDATE subscription_payments
SET failure_reason = error_message
WHERE failure_reason IS NULL AND error_message IS NOT NULL;

ALTER TABLE subscription_payments
  ALTER COLUMN payment_provider SET NOT NULL,
  ALTER COLUMN currency SET DEFAULT 'UAH';

ALTER TABLE payment_settings
  ADD COLUMN IF NOT EXISTS provider "PaymentProvider",
  ADD COLUMN IF NOT EXISTS api_token_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS api_secret_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

UPDATE payment_settings
SET provider = CASE
  WHEN preferred_provider = 'liqpay' THEN 'liqpay'::"PaymentProvider"
  ELSE 'monobank'::"PaymentProvider"
END
WHERE provider IS NULL;

UPDATE payment_settings
SET api_token_encrypted = monobank_token_encrypted
WHERE api_token_encrypted IS NULL AND monobank_token_encrypted IS NOT NULL;

UPDATE payment_settings
SET api_secret_encrypted = liqpay_private_key_encrypted
WHERE api_secret_encrypted IS NULL AND liqpay_private_key_encrypted IS NOT NULL;

ALTER TABLE payment_settings
  ALTER COLUMN provider SET NOT NULL,
  ALTER COLUMN api_token_encrypted DROP NOT NULL;

ALTER TABLE analytics_daily
  ADD COLUMN IF NOT EXISTS completed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelled INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS no_shows INTEGER NOT NULL DEFAULT 0;

UPDATE analytics_daily
SET completed = COALESCE(completed_bookings, completed),
    cancelled = COALESCE(cancelled_bookings, cancelled),
    no_shows = COALESCE(no_show_bookings, no_shows)
WHERE completed = 0 AND cancelled = 0 AND no_shows = 0;