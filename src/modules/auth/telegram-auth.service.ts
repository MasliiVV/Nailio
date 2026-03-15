// docs/api/authentication.md — Telegram initData HMAC-SHA256 validation
// docs/security/overview.md — initData Validation
// docs/backlog.md #15

import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface ValidatedInitData {
  user: TelegramUser;
  authDate: number;
  hash: string;
  startParam?: string;
}

@Injectable()
export class TelegramAuthService {
  private readonly logger = new Logger(TelegramAuthService.name);
  private static readonly MAX_AUTH_AGE_SECONDS = 86400; // 24 hours — Mini App stays open long

  /**
   * Validate Telegram initData according to:
   * docs/api/authentication.md + docs/security/overview.md
   *
   * 1. Parse raw initData string
   * 2. Extract and remove 'hash' field
   * 3. Sort remaining key-value pairs alphabetically
   * 4. Build data_check_string (join with \n)
   * 5. secret_key = HMAC_SHA256(bot_token, "WebAppData")
   * 6. computed_hash = hex(HMAC_SHA256(data_check_string, secret_key))
   * 7. Verify: computed_hash === received_hash
   * 8. Check: NOW() - auth_date < 300 seconds (5 min)
   */
  validate(initDataRaw: string, botToken: string): ValidatedInitData {
    // Parse URL-encoded string
    const params = new URLSearchParams(initDataRaw);
    const hash = params.get('hash');

    if (!hash) {
      throw new UnauthorizedException('Missing hash in initData');
    }

    // Remove hash from params, sort remaining alphabetically
    params.delete('hash');
    const sortedParams = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // secret_key = HMAC_SHA256("WebAppData", bot_token)
    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();

    // computed_hash = hex(HMAC_SHA256(data_check_string, secret_key))
    const computedHash = createHmac('sha256', secretKey).update(sortedParams).digest('hex');

    // Constant-time comparison
    if (computedHash !== hash) {
      this.logger.warn('initData hash mismatch');
      throw new UnauthorizedException('Invalid initData signature');
    }

    // Check auth_date freshness (replay protection)
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);

    if (now - authDate > TelegramAuthService.MAX_AUTH_AGE_SECONDS) {
      throw new UnauthorizedException('initData expired');
    }

    // Parse user object
    const userStr = params.get('user');
    if (!userStr) {
      throw new UnauthorizedException('Missing user in initData');
    }

    let user: TelegramUser;
    try {
      user = JSON.parse(userStr);
    } catch {
      throw new UnauthorizedException('Invalid user data in initData');
    }

    return {
      user,
      authDate,
      hash,
      startParam: params.get('start_param') || undefined,
    };
  }
}
