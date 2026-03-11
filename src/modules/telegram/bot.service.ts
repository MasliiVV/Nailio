// docs/backlog.md #22 — Bot CRUD + token encryption
// docs/backlog.md #25 — Bot auto-setup
// docs/telegram/bot-architecture.md — Full bot lifecycle

import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { BotCryptoService } from './bot-crypto.service';
import { TenantsService } from '../tenants/tenants.service';
import { ConnectBotDto } from './dto/bot.dto';

interface TelegramBotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
}

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);
  private readonly telegramApiUrl = 'https://api.telegram.org';
  private readonly appUrl: string;
  private readonly webhookBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: BotCryptoService,
    private readonly tenantsService: TenantsService,
    private readonly configService: ConfigService,
  ) {
    this.appUrl = this.configService.get<string>('MINI_APP_URL', 'https://app.platform.com');
    this.webhookBaseUrl = this.configService.get<string>('API_URL', 'https://api.platform.com');
  }

  /**
   * Connect bot — full auto-setup flow
   * docs/telegram/bot-architecture.md — Створення бота
   * Steps: getMe → validate → encrypt token → setWebhook → setChatMenuButton → setMyCommands → setMyDescription → save
   */
  async connectBot(tenantId: string, dto: ConnectBotDto) {
    // Step 1: Validate token with getMe
    const botInfo = await this.callTelegramApi<TelegramBotInfo>(dto.botToken, 'getMe');

    if (!botInfo.is_bot) {
      throw new BadRequestException('Invalid bot token');
    }

    // Check if bot already connected to another tenant
    const existingBot = await this.prisma.bot.findUnique({
      where: { botId: BigInt(botInfo.id) },
    });

    if (existingBot) {
      throw new BadRequestException('Bot is already connected to another account');
    }

    // Step 2: Get tenant info
    const tenant = await this.tenantsService.findById(tenantId);

    // Step 3: Generate webhook secret (256 chars)
    const webhookSecret = randomBytes(128).toString('hex'); // 256 hex chars

    // Step 4: Encrypt bot token
    const encryptedToken = this.cryptoService.encrypt(dto.botToken);

    // Step 5: Set webhook
    await this.callTelegramApi(dto.botToken, 'setWebhook', {
      url: `${this.webhookBaseUrl}/webhook/${tenantId}`,
      secret_token: webhookSecret,
      allowed_updates: ['message', 'callback_query'],
    });

    // Step 6: Set chat menu button (Mini App)
    await this.callTelegramApi(dto.botToken, 'setChatMenuButton', {
      menu_button: {
        type: 'web_app',
        text: '📅 Записатися',
        web_app: {
          url: `${this.appUrl}?startapp=${tenant.slug}`,
        },
      },
    });

    // Step 7: Set commands
    await this.callTelegramApi(dto.botToken, 'setMyCommands', {
      commands: [
        { command: 'start', description: 'Відкрити додаток' },
        { command: 'book', description: 'Записатися' },
        { command: 'my_bookings', description: 'Мої записи' },
        { command: 'help', description: 'Допомога' },
      ],
    });

    // Step 8: Set description
    await this.callTelegramApi(dto.botToken, 'setMyDescription', {
      description: `${tenant.displayName} — онлайн-запис`,
    });

    // Step 9: Save to DB
    const bot = await this.prisma.bot.create({
      data: {
        tenantId,
        botId: BigInt(botInfo.id),
        botTokenEncrypted: encryptedToken,
        botUsername: botInfo.username,
        webhookSecret,
      },
    });

    // Step 10: Update onboarding status
    await this.tenantsService.updateOnboardingStatus(tenantId, 'bot_connected');

    this.logger.log(`Bot connected: @${botInfo.username} for tenant ${tenant.slug}`);

    return {
      id: bot.id,
      botUsername: bot.botUsername,
      botId: Number(bot.botId),
      isActive: bot.isActive,
    };
  }

  /**
   * Get bot info for tenant
   */
  async findByTenantId(tenantId: string) {
    return this.prisma.bot.findFirst({
      where: { tenantId },
    });
  }

  /**
   * Get decrypted bot token
   * docs/telegram/bot-architecture.md — Decryption only in runtime
   */
  async getDecryptedToken(botDbId: string): Promise<string> {
    const bot = await this.prisma.bot.findUnique({
      where: { id: botDbId },
    });

    if (!bot) {
      throw new NotFoundException('Bot not found');
    }

    return this.cryptoService.getCachedToken(botDbId, bot.botTokenEncrypted);
  }

  /**
   * Verify webhook secret
   * docs/telegram/bot-architecture.md — Webhook secret verification
   */
  async verifyWebhookSecret(botDbId: string, secret: string): Promise<boolean> {
    const bot = await this.prisma.bot.findFirst({
      where: { id: botDbId },
    });

    if (!bot) {
      return false;
    }

    return bot.webhookSecret === secret;
  }

  /**
   * Send message via bot
   * docs/telegram/bot-architecture.md — Відправка повідомлень через бота
   */
  async sendMessage(
    botDbId: string,
    chatId: number | bigint,
    text: string,
    options?: {
      parseMode?: 'HTML' | 'MarkdownV2';
      replyMarkup?: unknown;
    },
  ): Promise<boolean> {
    try {
      const token = await this.getDecryptedToken(botDbId);

      await this.callTelegramApi(token, 'sendMessage', {
        chat_id: Number(chatId),
        text,
        parse_mode: options?.parseMode || 'HTML',
        ...(options?.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
      });

      return true;
    } catch (error: unknown) {
      // Handle 403 — bot blocked by user
      if (error instanceof Error && error.message.includes('403')) {
        this.logger.warn(`Bot blocked by user chat_id=${chatId}, bot=${botDbId}`);
        return false;
      }
      throw error;
    }
  }

  /**
   * Reconnect bot with new token
   * docs/telegram/bot-architecture.md — Bot reconnect flow
   */
  async reconnectBot(tenantId: string, newToken: string) {
    const existingBot = await this.findByTenantId(tenantId);
    if (!existingBot) {
      throw new NotFoundException('No bot connected to this tenant');
    }

    // Validate new token
    const botInfo = await this.callTelegramApi<TelegramBotInfo>(newToken, 'getMe');

    // Delete old webhook
    try {
      const oldToken = await this.getDecryptedToken(existingBot.id);
      await this.callTelegramApi(oldToken, 'deleteWebhook');
    } catch {
      // Old token might be invalid, continue
    }

    // Encrypt new token
    const encryptedToken = this.cryptoService.encrypt(newToken);
    const newWebhookSecret = randomBytes(128).toString('hex');

    // Update DB
    await this.prisma.bot.update({
      where: { id: existingBot.id },
      data: {
        botId: BigInt(botInfo.id),
        botTokenEncrypted: encryptedToken,
        botUsername: botInfo.username,
        webhookSecret: newWebhookSecret,
      },
    });

    // Set new webhook
    await this.callTelegramApi(newToken, 'setWebhook', {
      url: `${this.webhookBaseUrl}/webhook/${tenantId}`,
      secret_token: newWebhookSecret,
      allowed_updates: ['message', 'callback_query'],
    });

    // Invalidate Redis cache
    await this.cryptoService.invalidateCache(existingBot.id);

    this.logger.log(`Bot reconnected: @${botInfo.username} for tenant ${tenantId}`);

    return {
      botUsername: botInfo.username,
      botId: Number(botInfo.id),
    };
  }

  // ─── Private Helpers ───

  private async callTelegramApi<T = unknown>(
    token: string,
    method: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.telegramApiUrl}/bot${token}/${method}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = (await response.json()) as { ok: boolean; result: T; description?: string };

    if (!data.ok) {
      throw new BadRequestException(`Telegram API error: ${data.description || 'Unknown error'}`);
    }

    return data.result;
  }
}
