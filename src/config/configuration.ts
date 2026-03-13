// Configuration loader — docs/deployment/docker.md (Environment Variables)

export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  database: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    url: process.env.REDIS_URL,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL || '3600', 10),
    refreshTtl: parseInt(process.env.JWT_REFRESH_TTL || '2592000', 10),
  },

  encryption: {
    botTokenKey: process.env.BOT_TOKEN_ENCRYPTION_KEY,
    paymentKey: process.env.PAYMENT_ENCRYPTION_KEY,
  },

  platformBot: {
    token: process.env.PLATFORM_BOT_TOKEN,
    url: process.env.PLATFORM_BOT_URL || 'https://t.me/nailioapp_bot',
    adminTelegramIds: process.env.PLATFORM_ADMIN_TELEGRAM_IDS || '',
    adminUsernames: process.env.PLATFORM_ADMIN_USERNAMES || '',
  },

  subscription: {
    priceUsd: parseInt(process.env.PLATFORM_SUBSCRIPTION_PRICE_USD || '10', 10),
  },

  monobank: {
    merchantToken: process.env.MONOBANK_MERCHANT_TOKEN,
  },

  liqpay: {
    publicKey: process.env.LIQPAY_PUBLIC_KEY,
    privateKey: process.env.LIQPAY_PRIVATE_KEY,
  },

  minio: {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000', 10),
    accessKey: process.env.MINIO_ACCESS_KEY,
    secretKey: process.env.MINIO_SECRET_KEY,
  },

  urls: {
    api: process.env.API_BASE_URL || 'http://localhost:3000',
    miniApp: process.env.MINI_APP_URL || 'http://localhost:5173',
    admin: process.env.ADMIN_URL || 'http://localhost:5174',
  },
});
