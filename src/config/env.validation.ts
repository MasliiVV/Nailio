// Environment validation — docs/backlog.md #5

import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, MinLength, validateSync } from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  @MinLength(32)
  JWT_SECRET!: string;

  @IsString()
  @MinLength(64)
  BOT_TOKEN_ENCRYPTION_KEY!: string;

  @IsString()
  @MinLength(64)
  PAYMENT_ENCRYPTION_KEY!: string;

  @IsString()
  PLATFORM_BOT_TOKEN!: string;

  @IsString()
  @IsOptional()
  PLATFORM_WEBHOOK_SECRET?: string;

  @IsString()
  @IsOptional()
  PLATFORM_ADMIN_TELEGRAM_IDS?: string;

  @IsString()
  @IsOptional()
  PLATFORM_ADMIN_USERNAMES?: string;

  @IsString()
  @IsOptional()
  MONOBANK_MERCHANT_TOKEN?: string;

  @IsString()
  @IsOptional()
  LIQPAY_PUBLIC_KEY?: string;

  @IsString()
  @IsOptional()
  LIQPAY_PRIVATE_KEY?: string;

  @IsString()
  @IsOptional()
  MINIO_ENDPOINT?: string;

  @IsString()
  @IsOptional()
  MINIO_ACCESS_KEY?: string;

  @IsString()
  @IsOptional()
  MINIO_SECRET_KEY?: string;

  @IsString()
  @IsOptional()
  API_BASE_URL?: string;

  @IsString()
  @IsOptional()
  MINI_APP_URL?: string;

  @IsString()
  @IsOptional()
  ADMIN_URL?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
