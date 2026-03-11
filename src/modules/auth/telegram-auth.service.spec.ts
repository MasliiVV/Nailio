// docs/backlog.md #115 — Unit tests: Auth
// Tests: TelegramAuthService.validate() — HMAC-SHA256 validation

import { UnauthorizedException } from '@nestjs/common';
import { TelegramAuthService } from './telegram-auth.service';
import { createHmac } from 'crypto';

describe('TelegramAuthService', () => {
  let service: TelegramAuthService;
  const botToken = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';

  beforeEach(() => {
    service = new TelegramAuthService();
  });

  // ─── Helper: build valid initData ───

  function buildInitData(
    overrides: {
      userId?: number;
      firstName?: string;
      authDate?: number;
      botToken?: string;
    } = {},
  ): string {
    const userId = overrides.userId ?? 123456789;
    const firstName = overrides.firstName ?? 'Олена';
    const authDate = overrides.authDate ?? Math.floor(Date.now() / 1000);
    const token = overrides.botToken ?? botToken;

    const user = JSON.stringify({
      id: userId,
      first_name: firstName,
      language_code: 'uk',
    });

    const params: Record<string, string> = {
      auth_date: authDate.toString(),
      user: user,
    };

    // Sort params alphabetically, build data_check_string
    const dataCheckString = Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    // secret_key = HMAC_SHA256("WebAppData", bot_token)
    const secretKey = createHmac('sha256', 'WebAppData')
      .update(token)
      .digest();

    // hash = hex(HMAC_SHA256(data_check_string, secret_key))
    const hash = createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    const searchParams = new URLSearchParams({
      ...params,
      hash,
    });

    return searchParams.toString();
  }

  // ─── Tests ───

  describe('validate()', () => {
    it('should validate correct initData', () => {
      const initData = buildInitData();
      const result = service.validate(initData, botToken);

      expect(result.user.id).toBe(123456789);
      expect(result.user.first_name).toBe('Олена');
      expect(result.hash).toBeDefined();
      expect(result.authDate).toBeGreaterThan(0);
    });

    it('should extract user data correctly', () => {
      const initData = buildInitData({
        userId: 987654321,
        firstName: 'Марія',
      });

      const result = service.validate(initData, botToken);

      expect(result.user.id).toBe(987654321);
      expect(result.user.first_name).toBe('Марія');
      expect(result.user.language_code).toBe('uk');
    });

    it('should throw on missing hash', () => {
      const params = new URLSearchParams({
        auth_date: Math.floor(Date.now() / 1000).toString(),
        user: JSON.stringify({ id: 1, first_name: 'Test' }),
      });

      expect(() => service.validate(params.toString(), botToken)).toThrow(
        UnauthorizedException,
      );
    });

    it('should throw on invalid hash (tampered data)', () => {
      const initData = buildInitData();
      // Tamper with the data
      const tampered = initData.replace('hash=', 'hash=deadbeef');

      expect(() => service.validate(tampered, botToken)).toThrow(
        UnauthorizedException,
      );
    });

    it('should throw on wrong bot token', () => {
      const initData = buildInitData();

      expect(() =>
        service.validate(initData, 'wrong:token'),
      ).toThrow(UnauthorizedException);
    });

    it('should throw on expired initData (>5 minutes)', () => {
      const oldAuthDate = Math.floor(Date.now() / 1000) - 400; // 6+ minutes ago
      const initData = buildInitData({ authDate: oldAuthDate });

      expect(() => service.validate(initData, botToken)).toThrow(
        UnauthorizedException,
      );
    });

    it('should accept initData within 5 minute window', () => {
      const recentAuthDate = Math.floor(Date.now() / 1000) - 200; // ~3 minutes ago
      const initData = buildInitData({ authDate: recentAuthDate });

      const result = service.validate(initData, botToken);
      expect(result.user.id).toBe(123456789);
    });

    it('should throw on missing user field', () => {
      const authDate = Math.floor(Date.now() / 1000);
      const params: Record<string, string> = {
        auth_date: authDate.toString(),
      };

      const dataCheckString = Object.entries(params)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');

      const secretKey = createHmac('sha256', 'WebAppData')
        .update(botToken)
        .digest();
      const hash = createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

      const searchParams = new URLSearchParams({ ...params, hash });

      expect(() => service.validate(searchParams.toString(), botToken)).toThrow(
        UnauthorizedException,
      );
    });

    it('should throw on malformed user JSON', () => {
      const authDate = Math.floor(Date.now() / 1000);
      const params: Record<string, string> = {
        auth_date: authDate.toString(),
        user: 'not-json',
      };

      const dataCheckString = Object.entries(params)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');

      const secretKey = createHmac('sha256', 'WebAppData')
        .update(botToken)
        .digest();
      const hash = createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

      const searchParams = new URLSearchParams({ ...params, hash });

      expect(() => service.validate(searchParams.toString(), botToken)).toThrow(
        UnauthorizedException,
      );
    });
  });
});
