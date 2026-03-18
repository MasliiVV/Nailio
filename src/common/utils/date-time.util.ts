export function buildDateTimeInTimezone(dateStr: string, timeStr: string, timezone: string): Date {
  const tempDate = new Date(`${dateStr}T${timeStr}:00Z`);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
  });
  const offset =
    formatter.formatToParts(tempDate).find((part) => part.type === 'timeZoneName')?.value ||
    'GMT+00:00';

  return new Date(`${dateStr}T${timeStr}:00${offset.replace('GMT', '') || '+00:00'}`);
}

export function formatTimeInTimezone(date: Date, timezone: string, locale = 'en-GB'): string {
  return date.toLocaleTimeString(locale, {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatBookingDateTime(
  startTime: Date,
  timezone: string,
  locale = 'uk-UA',
): { date: string; time: string } {
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    day: 'numeric',
    month: 'long',
  }).format(startTime);
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(startTime);

  return { date, time };
}

export function getLocalDateString(date: Date, timezone: string): string {
  return date.toLocaleDateString('en-CA', { timeZone: timezone });
}

export function buildTelegramUserLink(telegramId: bigint): string {
  return `<a href="tg://user?id=${telegramId}">Зв’язатися в Telegram</a>`;
}
