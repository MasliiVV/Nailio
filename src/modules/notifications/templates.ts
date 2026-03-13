// docs/telegram/notifications.md — Notification templates (uk/en)
// Language fallback: uk → uk, en → en, anything else → uk

export interface TemplateVariables {
  serviceName: string;
  date: string;
  time: string;
  duration: number;
  price: number; // in kopiykas
  cancellationWindow?: number;
  clientName?: string;
  clientPhone?: string;
  reason?: string;
}

function _formatPrice(kopiykas: number): string {
  return (kopiykas / 100).toFixed(0);
}

function resolveLanguage(langCode: string | null | undefined): 'uk' | 'en' {
  if (langCode === 'en') return 'en';
  return 'uk'; // Default + fallback for ru, null, etc.
}

// ──────────────────────────────────────────────
// Templates
// ──────────────────────────────────────────────

const templates = {
  // ─── Confirmation (to client — pending master approval) ───
  confirmation: {
    uk: (v: TemplateVariables) =>
      `🙏 Дякуємо за запис!\n\n📋 ${v.serviceName}\n📅 ${v.date} о ${v.time}\n\nОчікуйте підтвердження від майстра 💅`,
    en: (v: TemplateVariables) =>
      `🙏 Thank you for booking!\n\n📋 ${v.serviceName}\n📅 ${v.date} at ${v.time}\n\nPlease wait for confirmation from the master 💅`,
  },

  // ─── New Booking (to master) ───
  new_booking: {
    uk: (v: TemplateVariables) =>
      `📅 Новий запис!\n\n👤 ${v.clientName}\n📋 ${v.serviceName}\n📅 ${v.date} о ${v.time}\n📱 ${v.clientPhone || 'Не вказано'}`,
    en: (v: TemplateVariables) =>
      `📅 New booking!\n\n👤 ${v.clientName}\n📋 ${v.serviceName}\n📅 ${v.date} at ${v.time}\n📱 ${v.clientPhone || 'Not specified'}`,
  },

  // ─── Reminder 24h (to client) ───
  reminder_24h: {
    uk: (v: TemplateVariables) =>
      `🔔 Нагадування\n\nЗавтра у вас запис:\n📋 ${v.serviceName}\n📅 ${v.date} о ${v.time}\n\nДо зустрічі! 💅`,
    en: (v: TemplateVariables) =>
      `🔔 Reminder\n\nYou have an appointment tomorrow:\n📋 ${v.serviceName}\n📅 ${v.date} at ${v.time}\n\nSee you! 💅`,
  },

  // ─── Reminder 1h (to client) ───
  reminder_1h: {
    uk: (v: TemplateVariables) =>
      `⏰ Через 1 годину у вас запис:\n\n📋 ${v.serviceName}\n📅 Сьогодні о ${v.time}`,
    en: (v: TemplateVariables) =>
      `⏰ Your appointment is in 1 hour:\n\n📋 ${v.serviceName}\n📅 Today at ${v.time}`,
  },

  // ─── Cancellation (to client) ───
  cancellation: {
    uk: (v: TemplateVariables) =>
      `❌ Запис скасовано\n\n📋 ${v.serviceName}\n📅 ${v.date} о ${v.time}\n\nПричина: ${v.reason || 'Не вказано'}\n\nЩоб записатися знову, натисніть кнопку нижче.`,
    en: (v: TemplateVariables) =>
      `❌ Booking cancelled\n\n📋 ${v.serviceName}\n📅 ${v.date} at ${v.time}\n\nReason: ${v.reason || 'Not specified'}\n\nTo rebook, tap the button below.`,
  },

  // ─── Cancellation (to master) ───
  cancellation_master: {
    uk: (v: TemplateVariables) =>
      `❌ Клієнт скасував запис\n\n👤 ${v.clientName}\n📋 ${v.serviceName}\n📅 ${v.date} о ${v.time}\nПричина: ${v.reason || 'Не вказано'}`,
    en: (v: TemplateVariables) =>
      `❌ Client cancelled booking\n\n👤 ${v.clientName}\n📋 ${v.serviceName}\n📅 ${v.date} at ${v.time}\nReason: ${v.reason || 'Not specified'}`,
  },

  // ─── Reschedule (to client) ───
  reschedule: {
    uk: (v: TemplateVariables) =>
      `📅 Запис перенесено\n\n📋 ${v.serviceName}\n📅 Новий час: ${v.date} о ${v.time}\n⏱ ${v.duration} хв`,
    en: (v: TemplateVariables) =>
      `📅 Booking rescheduled\n\n📋 ${v.serviceName}\n📅 New time: ${v.date} at ${v.time}\n⏱ ${v.duration} min`,
  },
} as const;

type TemplateType = keyof typeof templates;

/**
 * Render a notification template with given variables.
 * docs/telegram/notifications.md — Language fallback
 */
export function renderTemplate(
  type: TemplateType,
  langCode: string | null | undefined,
  variables: TemplateVariables,
): string {
  const template = templates[type];
  if (!template) {
    throw new Error(`Unknown notification template: ${type}`);
  }

  const lang = resolveLanguage(langCode);
  return template[lang](variables);
}

export { TemplateType, resolveLanguage };
