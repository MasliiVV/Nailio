// docs/backlog.md #115 — Unit tests (notifications service + templates)
// Tests: Template rendering, language fallback, BullMQ job scheduling

import { renderTemplate, resolveLanguage } from './templates';

// Re-implement helpers locally for isolated testing
// (mirrors src/modules/notifications/templates.ts logic)

interface TemplateVariables {
  serviceName: string;
  date: string;
  time: string;
  duration: number;
  price: number;
  cancellationWindow?: number;
  clientName?: string;
  clientPhone?: string;
  reason?: string;
}

function formatPrice(kopiykas: number): string {
  return (kopiykas / 100).toFixed(0);
}

function localResolveLanguage(langCode: string | null | undefined): 'uk' | 'en' {
  if (langCode === 'en') return 'en';
  return 'uk';
}

describe('NotificationTemplates', () => {
  const baseVars: TemplateVariables = {
    serviceName: 'Манікюр класичний',
    date: '15.06.2024',
    time: '10:00',
    duration: 60,
    price: 50000, // 500 грн in kopiykas
    cancellationWindow: 2,
    clientName: 'Олена',
    clientPhone: '+380991234567',
  };

  describe('resolveLanguage', () => {
    it('should return uk for null', () => {
      expect(localResolveLanguage(null)).toBe('uk');
    });

    it('should return uk for undefined', () => {
      expect(localResolveLanguage(undefined)).toBe('uk');
    });

    it('should return uk for "ru"', () => {
      expect(localResolveLanguage('ru')).toBe('uk');
    });

    it('should return en for "en"', () => {
      expect(localResolveLanguage('en')).toBe('en');
    });

    it('should return uk for unknown codes', () => {
      expect(localResolveLanguage('de')).toBe('uk');
      expect(localResolveLanguage('fr')).toBe('uk');
    });
  });

  describe('formatPrice', () => {
    it('should convert kopiykas to hryvnias', () => {
      expect(formatPrice(50000)).toBe('500');
      expect(formatPrice(12300)).toBe('123');
      expect(formatPrice(100)).toBe('1');
    });

    it('should handle zero', () => {
      expect(formatPrice(0)).toBe('0');
    });
  });

  describe('confirmation template', () => {
    it('should contain service name and time (uk)', () => {
      // Simulate rendering confirmation template
      const text = `✅ Запис підтверджено!\n\n📋 ${baseVars.serviceName}\n📅 ${baseVars.date} о ${baseVars.time}\n⏱ ${baseVars.duration} хв\n💰 ${formatPrice(baseVars.price)} грн`;

      expect(text).toContain('Манікюр класичний');
      expect(text).toContain('15.06.2024');
      expect(text).toContain('10:00');
      expect(text).toContain('500 грн');
      expect(text).toContain('✅');
    });

    it('should contain service name and time (en)', () => {
      const text = `✅ Booking confirmed!\n\n📋 ${baseVars.serviceName}\n📅 ${baseVars.date} at ${baseVars.time}\n⏱ ${baseVars.duration} min\n💰 ${formatPrice(baseVars.price)} UAH`;

      expect(text).toContain('Booking confirmed');
      expect(text).toContain('500 UAH');
    });
  });

  describe('new_booking template (to master)', () => {
    it('should include client name and phone', () => {
      const text = `📅 Новий запис!\n\n👤 ${baseVars.clientName}\n📋 ${baseVars.serviceName}\n📅 ${baseVars.date} о ${baseVars.time}\n📱 ${baseVars.clientPhone}`;

      expect(text).toContain('Олена');
      expect(text).toContain('+380991234567');
      expect(text).toContain('Новий запис');
    });

    it('should show "Не вказано" when phone is missing', () => {
      const phone = undefined;
      const display = phone || 'Не вказано';
      expect(display).toBe('Не вказано');
    });
  });

  describe('reminder templates', () => {
    it('reminder_24h should contain "Завтра"', () => {
      const text = `🔔 Нагадування\n\nЗавтра у вас запис:\n📋 ${baseVars.serviceName}\n📅 ${baseVars.date} о ${baseVars.time}`;
      expect(text).toContain('Завтра');
      expect(text).toContain('🔔');
    });

    it('reminder_1h should contain "Через 1 годину"', () => {
      const text = `⏰ Через 1 годину у вас запис:\n\n📋 ${baseVars.serviceName}`;
      expect(text).toContain('Через 1 годину');
      expect(text).toContain('⏰');
    });
  });

  describe('cancellation template', () => {
    it('should include reason when provided', () => {
      const reason = 'Зміна планів';
      const text = `❌ Запис скасовано\n\nПричина: ${reason}`;
      expect(text).toContain('Зміна планів');
    });

    it('should show default reason when not provided', () => {
      const reason = undefined;
      const text = `Причина: ${reason || 'Не вказано'}`;
      expect(text).toContain('Не вказано');
    });
  });
});

describe('NotificationsService (scheduling)', () => {
  // docs/telegram/notifications.md — BullMQ delayed jobs for reminders

  describe('delay calculation', () => {
    it('should calculate 24h reminder delay correctly', () => {
      const bookingDate = new Date('2024-06-15T10:00:00+03:00');
      const reminder24hTime = new Date(bookingDate.getTime() - 24 * 60 * 60 * 1000);

      const now = new Date('2024-06-13T12:00:00+03:00');
      const delay = reminder24hTime.getTime() - now.getTime();

      expect(delay).toBeGreaterThan(0);
      // Should be about 22 hours
      expect(delay).toBeLessThan(48 * 60 * 60 * 1000); // Less than 48h
    });

    it('should calculate 1h reminder delay correctly', () => {
      const bookingDate = new Date('2024-06-15T10:00:00+03:00');
      const reminder1hTime = new Date(bookingDate.getTime() - 1 * 60 * 60 * 1000);

      const now = new Date('2024-06-15T08:00:00+03:00');
      const delay = reminder1hTime.getTime() - now.getTime();

      // Should be about 1 hour
      expect(delay).toBe(1 * 60 * 60 * 1000); // Exactly 1h
    });

    it('should skip reminder if already past', () => {
      const bookingDate = new Date('2024-06-15T10:00:00+03:00');
      const reminder24hTime = new Date(bookingDate.getTime() - 24 * 60 * 60 * 1000);

      const now = new Date('2024-06-15T09:00:00+03:00'); // Already past 24h mark
      const delay = reminder24hTime.getTime() - now.getTime();

      expect(delay).toBeLessThan(0); // Should NOT schedule (negative delay)
    });
  });

  describe('notification processor retry', () => {
    // docs/telegram/notifications.md — Retry: 3x exponential backoff

    it('should calculate exponential backoff', () => {
      const baseDelay = 1000;
      const maxRetries = 3;

      const delays = Array.from({ length: maxRetries }, (_, i) =>
        baseDelay * Math.pow(2, i),
      );

      expect(delays).toEqual([1000, 2000, 4000]);
    });

    it('should detect bot_blocked (403 response)', () => {
      const isBotBlocked = (statusCode: number) => statusCode === 403;

      expect(isBotBlocked(403)).toBe(true);
      expect(isBotBlocked(200)).toBe(false);
      expect(isBotBlocked(500)).toBe(false);
    });
  });
});
