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
  clientTelegramLink?: string; // e.g. "<a href='tg://user?id=123'>@username</a>"
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
      `📅 Новий запис!\n\n👤 ${v.clientName}${v.clientTelegramLink ? ` (${v.clientTelegramLink})` : ''}\n📋 ${v.serviceName}\n📅 ${v.date} о ${v.time}\n📱 ${v.clientPhone || 'Не вказано'}`,
    en: (v: TemplateVariables) =>
      `📅 New booking!\n\n👤 ${v.clientName}${v.clientTelegramLink ? ` (${v.clientTelegramLink})` : ''}\n📋 ${v.serviceName}\n📅 ${v.date} at ${v.time}\n📱 ${v.clientPhone || 'Not specified'}`,
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
      `⏰ Через 1 годину у вас запис:\n\n📋 ${v.serviceName}\n📅 Сьогодні о ${v.time}\n⏱ ${v.duration} хв\n💰 ${_formatPrice(v.price)} грн\n\nПідтвердіть свій візит 👇`,
    en: (v: TemplateVariables) =>
      `⏰ Your appointment is in 1 hour:\n\n📋 ${v.serviceName}\n📅 Today at ${v.time}\n⏱ ${v.duration} min\n💰 ${_formatPrice(v.price)} UAH\n\nConfirm your visit 👇`,
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
      `❌ Запис скасовано\n\n👤 ${v.clientName}${v.clientTelegramLink ? ` (${v.clientTelegramLink})` : ''}\n📋 ${v.serviceName}\n📅 ${v.date} о ${v.time}\nПричина: ${v.reason || 'Не вказано'}`,
    en: (v: TemplateVariables) =>
      `❌ Booking cancelled\n\n👤 ${v.clientName}${v.clientTelegramLink ? ` (${v.clientTelegramLink})` : ''}\n📋 ${v.serviceName}\n📅 ${v.date} at ${v.time}\nReason: ${v.reason || 'Not specified'}`,
  },

  // ─── Reschedule (to client) ───
  reschedule: {
    uk: (v: TemplateVariables) =>
      `📅 Запис перенесено\n\n📋 ${v.serviceName}\n📅 Новий час: ${v.date} о ${v.time}\n⏱ ${v.duration} хв`,
    en: (v: TemplateVariables) =>
      `📅 Booking rescheduled\n\n📋 ${v.serviceName}\n📅 New time: ${v.date} at ${v.time}\n⏱ ${v.duration} min`,
  },

  // ─── Time suggestion (to client — master proposes another time) ───
  time_suggestion: {
    uk: (v: TemplateVariables) =>
      `🕐 <b>Майстер пропонує інший час</b>\n\nНа жаль, обраний вами час недоступний.\nМайстер пропонує інший варіант для запису:\n\n📋 ${v.serviceName}\n⏱ ${v.duration} хв\n💰 ${_formatPrice(v.price)} грн\n\nОберіть зручний час нижче 👇`,
    en: (v: TemplateVariables) =>
      `🕐 <b>Master suggests another time</b>\n\nUnfortunately, your chosen time is not available.\nThe master suggests an alternative:\n\n📋 ${v.serviceName}\n⏱ ${v.duration} min\n💰 ${_formatPrice(v.price)} UAH\n\nChoose a convenient time below 👇`,
  },

  // ─── Client on time (to master) ───
  client_ontime: {
    uk: (v: TemplateVariables) =>
      `✅ Клієнт <b>${v.clientName}</b>${v.clientTelegramLink ? ` (${v.clientTelegramLink})` : ''} підтвердив, що прийде вчасно\n\n📋 ${v.serviceName}\n📅 ${v.date} о ${v.time}`,
    en: (v: TemplateVariables) =>
      `✅ Client <b>${v.clientName}</b>${v.clientTelegramLink ? ` (${v.clientTelegramLink})` : ''} confirmed they will be on time\n\n📋 ${v.serviceName}\n📅 ${v.date} at ${v.time}`,
  },

  // ─── Client running late (to master) ───
  client_late: {
    uk: (v: TemplateVariables) =>
      `⏰ Клієнт <b>${v.clientName}</b>${v.clientTelegramLink ? ` (${v.clientTelegramLink})` : ''} повідомив, що трохи запізниться\n\n📋 ${v.serviceName}\n📅 ${v.date} о ${v.time}`,
    en: (v: TemplateVariables) =>
      `⏰ Client <b>${v.clientName}</b>${v.clientTelegramLink ? ` (${v.clientTelegramLink})` : ''} informed they will be a bit late\n\n📋 ${v.serviceName}\n📅 ${v.date} at ${v.time}`,
  },

  // ─── Client message to master ───
  client_message: {
    uk: (v: TemplateVariables) =>
      `💬 Повідомлення від клієнта <b>${v.clientName}</b>${v.clientTelegramLink ? ` (${v.clientTelegramLink})` : ''}\n📱 ${v.clientPhone || 'Не вказано'}\n\n📋 Запис: ${v.serviceName}\n📅 ${v.date} о ${v.time}\n\n📝 ${v.reason || ''}`,
    en: (v: TemplateVariables) =>
      `💬 Message from client <b>${v.clientName}</b>${v.clientTelegramLink ? ` (${v.clientTelegramLink})` : ''}\n📱 ${v.clientPhone || 'Not specified'}\n\n📋 Booking: ${v.serviceName}\n📅 ${v.date} at ${v.time}\n\n📝 ${v.reason || ''}`,
  },

  // ─── Booking confirmed (to client — after master confirms) ───
  booking_confirmed: {
    uk: (v: TemplateVariables) =>
      `✅ <b>Ваш запис підтверджено!</b>\n\n📋 ${v.serviceName}\n📅 ${v.date} о ${v.time}\n⏱ ${v.duration} хв\n💰 ${_formatPrice(v.price)} грн\n\nДо зустрічі! 💅`,
    en: (v: TemplateVariables) =>
      `✅ <b>Your booking is confirmed!</b>\n\n📋 ${v.serviceName}\n📅 ${v.date} at ${v.time}\n⏱ ${v.duration} min\n💰 ${_formatPrice(v.price)} UAH\n\nSee you! 💅`,
  },

  // ─── Time accepted by client (to master) ───
  time_accepted: {
    uk: (v: TemplateVariables) =>
      `✅ Клієнт <b>${v.clientName}</b>${v.clientTelegramLink ? ` (${v.clientTelegramLink})` : ''} прийняв запропонований час\n\n📋 ${v.serviceName}\n📅 ${v.date} о ${v.time}\n\nЗапис підтверджено!`,
    en: (v: TemplateVariables) =>
      `✅ Client <b>${v.clientName}</b>${v.clientTelegramLink ? ` (${v.clientTelegramLink})` : ''} accepted the suggested time\n\n📋 ${v.serviceName}\n📅 ${v.date} at ${v.time}\n\nBooking confirmed!`,
  },

  // ─── Time declined by client (to master) ───
  time_declined: {
    uk: (v: TemplateVariables) =>
      `❌ Клієнт <b>${v.clientName}</b>${v.clientTelegramLink ? ` (${v.clientTelegramLink})` : ''} відхилив запропонований час\n\n📋 ${v.serviceName}`,
    en: (v: TemplateVariables) =>
      `❌ Client <b>${v.clientName}</b>${v.clientTelegramLink ? ` (${v.clientTelegramLink})` : ''} declined the suggested time\n\n📋 ${v.serviceName}`,
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
