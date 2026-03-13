import { test as base, type Page } from '@playwright/test';

/**
 * Mock Telegram WebApp environment for e2e tests.
 * Injects window.Telegram.WebApp with required properties.
 */
export const test = base.extend<{ tgPage: Page }>({
  tgPage: async ({ page }, use) => {
    // Inject Telegram WebApp mock before page loads
    await page.addInitScript(() => {
      (window as any).Telegram = {
        WebApp: {
          initData: 'mock_init_data',
          initDataUnsafe: {
            user: {
              id: 12345,
              first_name: 'Test',
              last_name: 'User',
              language_code: 'uk',
            },
            start_param: '',
          },
          version: '7.0',
          platform: 'tdesktop',
          colorScheme: 'light',
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
          viewportHeight: 844,
          viewportStableHeight: 844,
          safeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
          contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
          headerColor: '#ffffff',
          backgroundColor: '#ffffff',
          bottomBarColor: '#f7f7f8',
          ready: () => {},
          expand: () => {},
          close: () => {},
          setHeaderColor: () => {},
          setBackgroundColor: () => {},
          setBottomBarColor: () => {},
          enableClosingConfirmation: () => {},
          disableClosingConfirmation: () => {},
          requestFullscreen: () => {},
          lockOrientation: () => {},
          onEvent: () => {},
          offEvent: () => {},
          MainButton: {
            text: '',
            isVisible: false,
            isActive: true,
            isProgressVisible: false,
            setText: function (text: string) { this.text = text; },
            show: function () { this.isVisible = true; },
            hide: function () { this.isVisible = false; },
            enable: function () { this.isActive = true; },
            disable: function () { this.isActive = false; },
            showProgress: function () { this.isProgressVisible = true; },
            hideProgress: function () { this.isProgressVisible = false; },
            onClick: () => {},
            offClick: () => {},
            setParams: () => {},
          },
          BackButton: {
            isVisible: false,
            show: function () { this.isVisible = true; },
            hide: function () { this.isVisible = false; },
            onClick: () => {},
            offClick: () => {},
          },
          HapticFeedback: {
            impactOccurred: () => {},
            selectionChanged: () => {},
            notificationOccurred: () => {},
          },
          CloudStorage: {
            getItem: (_key: string, cb: Function) => cb(null, ''),
            setItem: (_key: string, _val: string, cb: Function) => cb(null),
            removeItem: (_key: string, cb: Function) => cb(null),
          },
          showConfirm: (_msg: string, cb: Function) => cb(true),
          showAlert: () => {},
          showPopup: () => {},
          openLink: () => {},
          openTelegramLink: () => {},
        },
      };
    });
    await use(page);
  },
});

export { expect } from '@playwright/test';

/**
 * API mock helpers for intercepting backend requests
 */
export async function mockAPI(page: Page, route: string, data: unknown, status = 200) {
  await page.route(`**/api${route}`, (r) =>
    r.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ data, meta: {} }),
    }),
  );
}

export async function mockAuth(page: Page) {
  await mockAPI(page, '/auth/telegram', {
    accessToken: 'mock-token',
    refreshToken: 'mock-refresh',
    user: {
      id: 'user-1',
      telegramId: 12345,
      firstName: 'Test',
      lastName: 'User',
      role: 'master',
      tenantId: 'tenant-1',
    },
    tenant: {
      id: 'tenant-1',
      displayName: 'Test Salon',
      botToken: 'mock-bot-token',
      slug: 'test-salon',
      isActive: true,
      branding: { primaryColor: '#6C5CE7', welcomeMessage: 'Welcome!' },
      subscription: { status: 'active', plan: 'pro', currentPeriodEnd: '2026-12-31' },
    },
    needsOnboarding: false,
  });
}
