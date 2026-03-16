declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV?: string;
    PORT?: string;
    DATABASE_URL?: string;
    REDIS_URL?: string;
    JWT_SECRET?: string;
    JWT_ACCESS_TTL?: string;
    JWT_REFRESH_TTL?: string;
    BOT_TOKEN_ENCRYPTION_KEY?: string;
    PAYMENT_ENCRYPTION_KEY?: string;
    PLATFORM_BOT_TOKEN?: string;
    PLATFORM_BOT_URL?: string;
    PLATFORM_ADMIN_TELEGRAM_IDS?: string;
    PLATFORM_ADMIN_USERNAMES?: string;
    PLATFORM_SUBSCRIPTION_PRICE_USD?: string;
    MONOBANK_MERCHANT_TOKEN?: string;
    LIQPAY_PUBLIC_KEY?: string;
    LIQPAY_PRIVATE_KEY?: string;
    MINIO_ENDPOINT?: string;
    MINIO_PORT?: string;
    MINIO_ACCESS_KEY?: string;
    MINIO_SECRET_KEY?: string;
    API_BASE_URL?: string;
    MINI_APP_URL?: string;
    ADMIN_URL?: string;
    OPENAI_API_KEY?: string;
    AI_MODEL?: string;
  }
}
