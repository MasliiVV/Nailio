import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { useCreateBooking, bookingKeys } from '@/hooks/useBookings';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    post: vi.fn(),
  },
  ApiRequestError: class ApiRequestError extends Error {},
}));

vi.mock('@/lib/telegram', () => ({
  getTelegram: () => ({
    HapticFeedback: {
      notificationOccurred: vi.fn(),
    },
  }),
}));

describe('useCreateBooking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invalidates client calendar availability queries after booking creation', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: { id: 'booking-1' } } } as never);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCreateBooking(), { wrapper });

    result.current.mutate({
      serviceId: 'service-1',
      startTime: '2026-03-18T10:00:00',
    });

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/bookings', {
        serviceId: 'service-1',
        startTime: '2026-03-18T10:00:00',
      });
    });

    await waitFor(() => {
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: bookingKeys.slotsCalendarRoot(),
      });
    });
  });
});