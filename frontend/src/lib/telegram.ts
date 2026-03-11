// docs/telegram/mini-app.md — Telegram WebApp SDK wrapper
// Wraps window.Telegram.WebApp for type-safe access

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface ThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  bottom_bar_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
  section_header_text_color?: string;
  section_separator_color?: string;
  subtitle_text_color?: string;
  destructive_text_color?: string;
}

interface WebApp {
  initData: string;
  initDataUnsafe: {
    user?: TelegramUser;
    start_param?: string;
    auth_date: number;
    hash: string;
  };
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: ThemeParams;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  isFullscreen: boolean;
  safeAreaInset: { top: number; bottom: number; left: number; right: number };
  contentSafeAreaInset: { top: number; bottom: number; left: number; right: number };

  ready(): void;
  expand(): void;
  close(): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  enableVerticalSwipes(): void;
  disableVerticalSwipes(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  setBottomBarColor(color: string): void;
  requestFullscreen(): void;
  exitFullscreen(): void;
  isVersionAtLeast(version: string): boolean;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  openInvoice(url: string, callback?: (status: string) => void): void;
  showPopup(params: {
    title?: string;
    message: string;
    buttons?: Array<{ id?: string; type?: string; text?: string }>;
  }, callback?: (buttonId: string) => void): void;
  showAlert(message: string, callback?: () => void): void;
  showConfirm(message: string, callback?: (confirmed: boolean) => void): void;

  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    isProgressVisible: boolean;
    setText(text: string): void;
    onClick(callback: () => void): void;
    offClick(callback: () => void): void;
    show(): void;
    hide(): void;
    enable(): void;
    disable(): void;
    showProgress(leaveActive?: boolean): void;
    hideProgress(): void;
    setParams(params: Record<string, unknown>): void;
  };

  SecondaryButton: {
    text: string;
    isVisible: boolean;
    setText(text: string): void;
    onClick(callback: () => void): void;
    offClick(callback: () => void): void;
    show(): void;
    hide(): void;
    setParams(params: Record<string, unknown>): void;
  };

  BackButton: {
    isVisible: boolean;
    onClick(callback: () => void): void;
    offClick(callback: () => void): void;
    show(): void;
    hide(): void;
  };

  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };

  CloudStorage: {
    setItem(key: string, value: string, callback?: (err: Error | null, stored?: boolean) => void): void;
    getItem(key: string, callback: (err: Error | null, value?: string) => void): void;
    getItems(keys: string[], callback: (err: Error | null, values?: Record<string, string>) => void): void;
    removeItem(key: string, callback?: (err: Error | null, removed?: boolean) => void): void;
    getKeys(callback: (err: Error | null, keys?: string[]) => void): void;
  };

  onEvent(eventType: string, handler: (...args: unknown[]) => void): void;
  offEvent(eventType: string, handler: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: WebApp;
    };
  }
}

// ─── Helpers ───

function getWebApp(): WebApp | null {
  return window.Telegram?.WebApp ?? null;
}

export function getTelegram(): WebApp {
  const wa = getWebApp();
  if (!wa) throw new Error('Telegram WebApp is not available');
  return wa;
}

export function isTelegramEnv(): boolean {
  return !!getWebApp()?.initData;
}

/** Get raw initData string for backend auth */
export function getInitData(): string {
  return getTelegram().initData;
}

/** Get user info from initDataUnsafe (display only, don't trust) */
export function getUser(): TelegramUser | undefined {
  return getTelegram().initDataUnsafe.user;
}

/** Get start_param (tenant slug) */
export function getStartParam(): string | undefined {
  return getTelegram().initDataUnsafe.start_param;
}

/** Get language code with fallback to 'uk' */
export function getLanguage(): 'uk' | 'en' {
  const lang = getUser()?.language_code;
  return lang === 'en' ? 'en' : 'uk';
}

/** Initialize the Mini App */
export function initTelegramApp(): void {
  const wa = getWebApp();
  if (!wa) return;

  wa.ready();
  wa.expand();

  // Apply safe area CSS variables
  applySafeArea(wa);

  // Listen for theme changes
  wa.onEvent('themeChanged', () => {
    applyThemeColors(wa);
  });

  applyThemeColors(wa);
}

/** Apply Telegram theme colors as CSS custom properties */
function applyThemeColors(wa: WebApp): void {
  const root = document.documentElement;
  const tp = wa.themeParams;

  root.style.setProperty('--tg-bg', tp.bg_color ?? '#ffffff');
  root.style.setProperty('--tg-text', tp.text_color ?? '#000000');
  root.style.setProperty('--tg-hint', tp.hint_color ?? '#999999');
  root.style.setProperty('--tg-link', tp.link_color ?? '#2678b6');
  root.style.setProperty('--tg-button', tp.button_color ?? '#3390ec');
  root.style.setProperty('--tg-button-text', tp.button_text_color ?? '#ffffff');
  root.style.setProperty('--tg-secondary-bg', tp.secondary_bg_color ?? '#f0f0f0');
  root.style.setProperty('--tg-header-bg', tp.header_bg_color ?? '#ffffff');
  root.style.setProperty('--tg-section-bg', tp.section_bg_color ?? '#ffffff');
  root.style.setProperty('--tg-section-header', tp.section_header_text_color ?? '#3390ec');
  root.style.setProperty('--tg-separator', tp.section_separator_color ?? '#e0e0e0');
  root.style.setProperty('--tg-subtitle', tp.subtitle_text_color ?? '#999999');
  root.style.setProperty('--tg-accent', tp.accent_text_color ?? '#3390ec');
  root.style.setProperty('--tg-destructive', tp.destructive_text_color ?? '#df3f40');
  root.style.setProperty('--tg-bottom-bar', tp.bottom_bar_bg_color ?? '#ffffff');

  root.setAttribute('data-theme', wa.colorScheme);
}

/** Apply safe area insets as CSS variables */
function applySafeArea(wa: WebApp): void {
  const root = document.documentElement;
  const si = wa.safeAreaInset;
  const csi = wa.contentSafeAreaInset;

  root.style.setProperty('--safe-top', `${si.top}px`);
  root.style.setProperty('--safe-bottom', `${si.bottom}px`);
  root.style.setProperty('--safe-left', `${si.left}px`);
  root.style.setProperty('--safe-right', `${si.right}px`);
  root.style.setProperty('--content-safe-top', `${csi.top}px`);
  root.style.setProperty('--content-safe-bottom', `${csi.bottom}px`);

  wa.onEvent('safeAreaChanged', () => {
    const s = wa.safeAreaInset;
    root.style.setProperty('--safe-top', `${s.top}px`);
    root.style.setProperty('--safe-bottom', `${s.bottom}px`);
    root.style.setProperty('--safe-left', `${s.left}px`);
    root.style.setProperty('--safe-right', `${s.right}px`);
  });
}

// ─── CloudStorage helpers (promisified) ───

export function cloudStorageSet(key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getTelegram().CloudStorage.setItem(key, value, (err) => {
      err ? reject(err) : resolve();
    });
  });
}

export function cloudStorageGet(key: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    getTelegram().CloudStorage.getItem(key, (err, value) => {
      err ? reject(err) : resolve(value);
    });
  });
}

export function cloudStorageRemove(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getTelegram().CloudStorage.removeItem(key, (err) => {
      err ? reject(err) : resolve();
    });
  });
}
