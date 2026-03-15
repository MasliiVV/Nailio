import { Injectable } from '@nestjs/common';

@Injectable()
export class TelegramApiService {
  async sendMessage(
    botToken: string,
    chatId: number | bigint | string,
    text: string,
    replyMarkup?: Record<string, unknown>,
  ): Promise<void> {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId.toString(),
        text,
        parse_mode: 'HTML',
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });
  }

  async answerCallbackQuery(
    botToken: string,
    callbackQueryId: string,
    text: string,
  ): Promise<void> {
    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text,
        show_alert: true,
      }),
    });
  }

  async editMessageText(
    botToken: string,
    chatId: number,
    messageId: number,
    text: string,
    replyMarkup?: Record<string, unknown>,
  ): Promise<void> {
    await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    });
  }

  async editMessageReplyMarkup(
    botToken: string,
    chatId: number,
    messageId: number,
    replyMarkup: Record<string, unknown> = { inline_keyboard: [] },
  ): Promise<void> {
    await fetch(`https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: replyMarkup,
      }),
    });
  }
}
