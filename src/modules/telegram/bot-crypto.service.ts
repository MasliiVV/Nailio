// docs/security/overview.md — Bot Token Encryption
// AES-256-GCM with random IV (12 bytes) + auth tag (16 bytes)
// Key from env BOT_TOKEN_ENCRYPTION_KEY (32 bytes hex = 64 hex chars)

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import Redis from 'ioredis';

@Injectable()
export class BotCryptoService {
  private readonly logger = new Logger(BotCryptoService.name);
  private readonly encryptionKey: Buffer;
  private readonly redis: Redis;
  private readonly cacheTtl = 3600; // 1 hour

  constructor(private readonly configService: ConfigService) {
    const keyHex = this.configService.getOrThrow<string>('BOT_TOKEN_ENCRYPTION_KEY');
    this.encryptionKey = Buffer.from(keyHex, 'hex');

    if (this.encryptionKey.length !== 32) {
      throw new Error('BOT_TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
    }

    this.redis = new Redis(this.configService.getOrThrow<string>('REDIS_URL'));
  }

  /**
   * Encrypt bot token with AES-256-GCM
   * docs/security/overview.md — IV: Random 12 bytes, stored with ciphertext
   * Format: [IV (12 bytes)][Auth Tag (16 bytes)][Ciphertext]
   */
  encrypt(plainText: string): Buffer {
    const iv = randomBytes(12); // GCM standard: 12 bytes IV
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag(); // 16 bytes

    // Pack: IV (12) + Auth Tag (16) + Ciphertext
    return Buffer.concat([iv, authTag, encrypted]);
  }

  /**
   * Decrypt bot token from stored format
   * Format: [IV (12 bytes)][Auth Tag (16 bytes)][Ciphertext]
   */
  decrypt(encryptedData: Buffer): string {
    const iv = encryptedData.subarray(0, 12);
    const authTag = encryptedData.subarray(12, 28);
    const ciphertext = encryptedData.subarray(28);

    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  /**
   * Get bot token with Redis caching
   * docs/telegram/bot-architecture.md — Redis cache: bot:{botId}:config (TTL 1h)
   */
  async getCachedToken(botDbId: string, encryptedToken: Buffer): Promise<string> {
    const cacheKey = `bot:${botDbId}:token`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return cached;
    }

    const token = this.decrypt(encryptedToken);
    await this.redis.setex(cacheKey, this.cacheTtl, token);
    return token;
  }

  /**
   * Invalidate cached token (on reconnect or deactivation)
   */
  async invalidateCache(botDbId: string): Promise<void> {
    await this.redis.del(`bot:${botDbId}:token`);
  }
}
