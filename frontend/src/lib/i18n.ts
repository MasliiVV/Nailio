// docs/telegram/mini-app.md — i18n setup
// react-intl, uk/en, lazy loading
// Language: Telegram.WebApp.initDataUnsafe.user.language_code → 'uk' | 'en'

import { getLanguage } from './telegram';
import ukMessages from '../locales/uk.json';

export type Locale = 'uk' | 'en';

let currentLocale: Locale = 'uk';
const messageCache = new Map<Locale, Record<string, string>>();

// Pre-cache default locale (no async needed)
messageCache.set('uk', ukMessages as Record<string, string>);

/** Detect language from Telegram or use default */
export function detectLocale(): Locale {
  try {
    return getLanguage();
  } catch {
    return 'uk';
  }
}

/** Load messages for a locale (sync for uk, lazy for en) */
export async function loadMessages(locale: Locale): Promise<Record<string, string>> {
  const cached = messageCache.get(locale);
  if (cached) return cached;

  const messages = await import(`../locales/${locale}.json`);
  const data = messages.default as Record<string, string>;
  messageCache.set(locale, data);
  currentLocale = locale;
  return data;
}

export function getCurrentLocale(): Locale {
  return currentLocale;
}
