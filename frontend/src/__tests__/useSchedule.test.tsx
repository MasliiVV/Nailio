import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { useUpdateWorkingHours, scheduleKeys } from '@/hooks/useSchedule';
import { api } from '@/lib/api';
import type { Schedule } from '@/types';

vi.mock('@/lib/api', () => ({
  api: {
    put: vi.fn(),
  },
}));

vi.mock('@/lib/telegram', () => ({
  getTelegram: () => ({
    HapticFeedback: {
      notificationOccurred: vi.fn(),
    },
  }),
}));

describe('useUpdateWorkingHours', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps weekly schedule cache shape when saving slots', async () => {
    const initialSchedule: Schedule = {
      weekly: [
        { dayOfWeek: 0, isDayOff: false, slots: ['09:00'] },
        { dayOfWeek: 1, isDayOff: true, slots: [] },
        { dayOfWeek: 2, isDayOff: true, slots: [] },
        { dayOfWeek: 3, isDayOff: true, slots: [] },
        { dayOfWeek: 4, isDayOff: true, slots: [] },
        { dayOfWeek: 5, isDayOff: true, slots: [] },
        { dayOfWeek: 6, isDayOff: true, slots: [] },
      ],
      overrides: [],
    };

    const updatedSchedule: Schedule = {
      ...initialSchedule,
      weekly: [
        { dayOfWeek: 0, isDayOff: false, slots: ['09:00', '09:30'] },
        ...initialSchedule.weekly.slice(1),
      ],
    };

    vi.mocked(api.put).mockResolvedValue({ data: updatedSchedule } as never);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(scheduleKeys.weekly(), initialSchedule);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useUpdateWorkingHours(), { wrapper });

    result.current.mutate({ days: updatedSchedule.weekly });

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/schedule/hours', {
        days: updatedSchedule.weekly,
      });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(scheduleKeys.weekly())).toEqual(updatedSchedule);
    });
  });
});