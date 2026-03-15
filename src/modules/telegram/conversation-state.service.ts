import { Injectable, OnModuleDestroy } from '@nestjs/common';

export interface ConversationState {
  action: 'awaiting_time' | 'awaiting_message' | 'awaiting_reply';
  bookingId: string;
  tenantId: string;
  chatId: number;
  messageId?: number;
  clientTelegramId?: bigint;
  expiresAt: number;
}

@Injectable()
export class ConversationStateService implements OnModuleDestroy {
  private readonly state = new Map<string, ConversationState>();
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanupExpiredStates(), 5 * 60 * 1000);
  }

  get(userId: string): ConversationState | undefined {
    const value = this.state.get(userId);
    if (!value) return undefined;
    if (value.expiresAt < Date.now()) {
      this.state.delete(userId);
      return undefined;
    }
    return value;
  }

  set(userId: string, value: ConversationState): void {
    this.state.set(userId, value);
  }

  delete(userId: string): void {
    this.state.delete(userId);
  }

  cleanupExpiredStates(): void {
    const now = Date.now();
    for (const [key, value] of this.state.entries()) {
      if (value.expiresAt < now) {
        this.state.delete(key);
      }
    }
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }
}
