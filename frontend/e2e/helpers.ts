import { test as base, type BrowserContext, type Page } from '@playwright/test';

type MockTelegramWindow = Window & {
  __telegramAlerts?: string[];
  Telegram?: {
    WebApp: unknown;
  };
};

function installTelegramMock() {
  const telegramWindow = window as MockTelegramWindow;
  const webApp = {
    initData: 'mock_init_data',
    initDataUnsafe: {
      user: {
        id: 12345,
        first_name: 'Test',
        last_name: 'User',
        language_code: 'uk',
      },
      start_param: '',
      auth_date: Math.floor(Date.now() / 1000),
      hash: 'mock_hash',
    },
    version: '7.0',
    platform: 'tdesktop',
    colorScheme: 'light' as const,
    themeParams: {
      bg_color: '#ffffff',
      text_color: '#000000',
      hint_color: '#999999',
      link_color: '#2481cc',
      button_color: '#2481cc',
      button_text_color: '#ffffff',
      secondary_bg_color: '#f0f0f0',
      header_bg_color: '#ffffff',
      accent_text_color: '#2481cc',
      section_bg_color: '#ffffff',
      section_header_text_color: '#6d6d72',
      section_separator_color: '#c8c7cc',
      subtitle_text_color: '#999999',
      destructive_text_color: '#ff3b30',
      bottom_bar_bg_color: '#f7f7f8',
    },
    isExpanded: true,
    isFullscreen: false,
    viewportHeight: 844,
    viewportStableHeight: 844,
    safeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
    contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
    ready: () => {},
    expand: () => {},
    close: () => {},
    setHeaderColor: () => {},
    setBackgroundColor: () => {},
    setBottomBarColor: () => {},
    enableClosingConfirmation: () => {},
    disableClosingConfirmation: () => {},
    enableVerticalSwipes: () => {},
    disableVerticalSwipes: () => {},
    requestFullscreen: () => {},
    exitFullscreen: () => {},
    isVersionAtLeast: () => true,
    onEvent: () => {},
    offEvent: () => {},
    openInvoice: (_url: string, callback?: (status: string) => void) => callback?.('paid'),
    showPopup: (
      _params: {
        title?: string;
        message: string;
        buttons?: Array<{ id?: string; type?: string; text?: string }>;
      },
      callback?: (buttonId: string) => void,
    ) => callback?.('ok'),
    MainButton: {
      text: '',
      color: '#2481cc',
      textColor: '#ffffff',
      isVisible: false,
      isActive: true,
      isProgressVisible: false,
      setText: function (text: string) {
        this.text = text;
      },
      show: function () {
        this.isVisible = true;
      },
      hide: function () {
        this.isVisible = false;
      },
      enable: function () {
        this.isActive = true;
      },
      disable: function () {
        this.isActive = false;
      },
      showProgress: function () {
        this.isProgressVisible = true;
      },
      hideProgress: function () {
        this.isProgressVisible = false;
      },
      onClick: (_callback: () => void) => {},
      offClick: (_callback: () => void) => {},
      setParams: (_params: Record<string, unknown>) => {},
    },
    SecondaryButton: {
      text: '',
      isVisible: false,
      setText: function (text: string) {
        this.text = text;
      },
      onClick: (_callback: () => void) => {},
      offClick: (_callback: () => void) => {},
      show: function () {
        this.isVisible = true;
      },
      hide: function () {
        this.isVisible = false;
      },
      setParams: (_params: Record<string, unknown>) => {},
    },
    BackButton: {
      isVisible: false,
      show: function () {
        this.isVisible = true;
      },
      hide: function () {
        this.isVisible = false;
      },
      onClick: (_callback: () => void) => {},
      offClick: (_callback: () => void) => {},
    },
    HapticFeedback: {
      impactOccurred: () => {},
      selectionChanged: () => {},
      notificationOccurred: () => {},
    },
    CloudStorage: {
      getItem: (_key: string, callback: (err: Error | null, value?: string) => void) =>
        callback(null, ''),
      setItem: (
        _key: string,
        _val: string,
        callback?: (err: Error | null, stored?: boolean) => void,
      ) => callback?.(null, true),
      getItems: (
        _keys: string[],
        callback: (err: Error | null, values?: Record<string, string>) => void,
      ) => callback(null, {}),
      removeItem: (_key: string, callback?: (err: Error | null, removed?: boolean) => void) =>
        callback?.(null, true),
      getKeys: (callback: (err: Error | null, keys?: string[]) => void) => callback(null, []),
    },
    showConfirm: (_msg: string, callback?: (confirmed: boolean) => void) => callback?.(true),
    showAlert: (message: string, callback?: () => void) => {
      telegramWindow.__telegramAlerts?.push(message);
      callback?.();
    },
    openLink: (_url: string, _options?: { try_instant_view?: boolean }) => {},
    openTelegramLink: (_url: string) => {},
  };

  telegramWindow.__telegramAlerts = telegramWindow.__telegramAlerts || [];
  Object.defineProperty(window, 'Telegram', {
    configurable: true,
    writable: true,
    value: { WebApp: webApp },
  });
  Object.defineProperty(globalThis, 'Telegram', {
    configurable: true,
    writable: true,
    value: { WebApp: webApp },
  });
  telegramWindow.Telegram = { WebApp: webApp };
}

/**
 * Mock Telegram WebApp environment for e2e tests.
 * Injects window.Telegram.WebApp with required properties.
 */
export const test = base.extend<{ tgPage: Page }>({
  tgPage: async ({ context, page }: { context: BrowserContext; page: Page }, use) => {
    await context.addInitScript(installTelegramMock);
    await use(page);
  },
});

export { expect } from '@playwright/test';

/**
 * API mock helpers for intercepting backend requests
 */
export async function mockAPI(page: Page, route: string, data: unknown, status = 200) {
  await page.route(`**/api/v1${route}`, (r) =>
    r.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ data, meta: {} }),
    }),
  );
}

export async function mockMasterBackgroundRequests(page: Page) {
  const context = page.context();
  const routeApi = async (route: string, data: unknown, status = 200) => {
    await context.route(`**/api/v1${route}`, (request) =>
      request.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ data, meta: {} }),
      }),
    );
  };

  await context.route('**/api/v1/bookings*', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          items: [],
          nextCursor: null,
          hasMore: false,
        },
        meta: {},
      }),
    });
  });

  await routeApi('/analytics/dashboard*', {
    today: {
      bookings: 0,
      completed: 0,
      revenue: 0,
      nextBooking: null,
    },
    period: {
      totalBookings: 0,
      completed: 0,
      cancelled: 0,
      noShows: 0,
      revenue: 0,
      newClients: 0,
      popularServices: [],
    },
  });

  await routeApi('/finance/summary', {
    income: 0,
    expense: 0,
    net: 0,
  });

  await routeApi('/finance/transactions', {
    items: [],
    nextCursor: null,
    hasMore: false,
  });

  await routeApi('/subscription', {
    status: 'expired',
    plan: 'basic',
    pricePerMonth: null,
    currentPeriodEnd: new Date().toISOString(),
    trialEndsAt: null,
    cancelledAt: null,
    daysLeft: 0,
  });

  await routeApi('/subscription/payments', []);
}

export async function mockAuth(page: Page) {
  await mockMasterBackgroundRequests(page);

  await mockAPI(page, '/auth/telegram', {
    accessToken: 'mock-token',
    refreshToken: 'mock-refresh',
    role: 'master',
    needsOnboarding: false,
    profile: {
      id: 'user-1',
      firstName: 'Test',
      lastName: 'User',
      phone: null,
      avatarUrl: null,
      telegramId: '12345',
    },
    tenant: {
      id: 'tenant-1',
      displayName: 'Test Salon',
      slug: 'test-salon',
      logoUrl: null,
      branding: { primaryColor: '#6C5CE7', welcomeMessage: 'Welcome!' },
      botUsername: 'test_bot',
    },
  });
}

export async function getTelegramAlerts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const telegramWindow = window as MockTelegramWindow;

    return telegramWindow.__telegramAlerts || [];
  });
}

export async function openMiniApp(page: Page, path: string) {
  await page.goto(path);
  await page.evaluate(installTelegramMock);

  const retryButton = page.getByRole('button', { name: /Спробувати ще|Try again/i });
  if (await retryButton.isVisible().catch(() => false)) {
    await retryButton.click();
  }
}
