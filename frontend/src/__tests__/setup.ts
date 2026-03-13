import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

// Mock Telegram WebApp
vi.mock('@/lib/telegram', () => ({
  getTelegram: () => ({
    HapticFeedback: {
      impactOccurred: vi.fn(),
      selectionChanged: vi.fn(),
      notificationOccurred: vi.fn(),
    },
    MainButton: {
      setText: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      showProgress: vi.fn(),
      hideProgress: vi.fn(),
      onClick: vi.fn(),
      offClick: vi.fn(),
    },
    showConfirm: vi.fn((_msg, cb) => cb(true)),
    showAlert: vi.fn(),
    BackButton: { show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn() },
  }),
  initTelegram: vi.fn(),
}));

// Mock react-intl
vi.mock('react-intl', async () => {
  const actual = await vi.importActual('react-intl');
  return {
    ...actual,
    useIntl: () => ({
      formatMessage: ({ id }: { id: string }, values?: Record<string, unknown>) => {
        if (values) {
          return `${id}:${JSON.stringify(values)}`;
        }
        return id;
      },
    }),
  };
});

// Mock react-router-dom navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: 'test-id', serviceId: 'test-service-id' }),
  };
});

export { mockNavigate };
