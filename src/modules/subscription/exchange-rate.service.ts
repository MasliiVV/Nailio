// docs/payments/overview.md — Exchange Rate Service
// docs/backlog.md #64 — Exchange rate service (USD→UAH, Redis cache)
// Uses Monobank public API (no auth needed), Redis cache TTL = 1h

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

interface MonobankCurrencyRate {
  currencyCodeA: number; // ISO 4217
  currencyCodeB: number;
  date: number;
  rateBuy?: number;
  rateSell?: number;
  rateCross?: number;
}

@Injectable()
export class ExchangeRateService implements OnModuleInit {
  private readonly logger = new Logger(ExchangeRateService.name);
  private readonly redis: Redis;

  // Monobank public API (no auth needed)
  private readonly API_URL = 'https://api.monobank.ua/bank/currency';
  private readonly CACHE_KEY = 'exchange:USD:UAH';
  private readonly CACHE_TTL = 3600; // 1 hour

  // ISO 4217 currency codes
  private readonly USD_CODE = 840;
  private readonly UAH_CODE = 980;

  // Fallback rate if API unavailable (docs/payments/overview.md — edge cases)
  private readonly FALLBACK_RATE = 41.5;

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis(this.configService.getOrThrow<string>('REDIS_URL'));
  }

  async onModuleInit() {
    // Pre-warm cache on startup
    try {
      await this.getUsdToUah();
      this.logger.log('Exchange rate cache warmed');
    } catch (error) {
      this.logger.warn(`Failed to warm exchange rate cache: ${error}`);
    }
  }

  /**
   * Get USD → UAH rate with Redis caching.
   * docs/payments/overview.md — Rate caching: Redis, TTL = 1 hour
   */
  async getUsdToUah(): Promise<number> {
    // Check Redis cache first
    const cached = await this.redis.get(this.CACHE_KEY);
    if (cached) {
      return parseFloat(cached);
    }

    // Fetch from Monobank public API
    try {
      const response = await fetch(this.API_URL);
      if (!response.ok) {
        throw new Error(`Monobank API returned ${response.status}`);
      }

      const rates: MonobankCurrencyRate[] = await response.json();
      const usdUah = rates.find(
        (r) =>
          r.currencyCodeA === this.USD_CODE &&
          r.currencyCodeB === this.UAH_CODE,
      );

      if (!usdUah || (!usdUah.rateSell && !usdUah.rateCross)) {
        throw new Error('USD/UAH rate not found in Monobank response');
      }

      // docs/payments/overview.md — Use 'rateSell' field
      const rate = usdUah.rateSell ?? usdUah.rateCross!;
      await this.redis.setex(this.CACHE_KEY, this.CACHE_TTL, rate.toString());

      this.logger.log(`Exchange rate updated: 1 USD = ${rate} UAH`);
      return rate;
    } catch (error) {
      this.logger.error(`Failed to fetch exchange rate: ${error}`);

      // Try last known rate from Redis (without TTL check)
      const lastKnown = await this.redis.get(`${this.CACHE_KEY}:last`);
      if (lastKnown) {
        this.logger.warn(`Using last known rate: ${lastKnown}`);
        return parseFloat(lastKnown);
      }

      // Absolute fallback
      this.logger.warn(`Using fallback rate: ${this.FALLBACK_RATE}`);
      return this.FALLBACK_RATE;
    }
  }

  /**
   * Convert USD amount to UAH.
   * docs/payments/overview.md — amount_uah = amountUsd * rateSell
   * Rate used stored in subscription_payments.exchange_rate
   */
  async convertUsdToUah(amountUsd: number): Promise<{
    amountUah: number;
    amountKopecks: number;
    rate: number;
  }> {
    const rate = await this.getUsdToUah();
    const amountUah = Math.round(amountUsd * rate * 100) / 100;
    const amountKopecks = Math.round(amountUsd * rate * 100);

    return { amountUah, amountKopecks, rate };
  }
}
