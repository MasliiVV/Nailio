import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { bookingKeys } from './useBookings';
import type {
  ApiResponse,
  Schedule,
  ScheduleOverride,
  CreateOverrideDto,
  DaySchedule,
  ScheduleDay,
} from '@/types';
import { getTelegram } from '@/lib/telegram';

export const scheduleKeys = {
  all: ['schedule'] as const,
  weekly: () => [...scheduleKeys.all, 'weekly'] as const,
  days: () => [...scheduleKeys.all, 'day'] as const,
  day: (date: string) => [...scheduleKeys.days(), date] as const,
};

export function useSchedule(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: scheduleKeys.weekly(),
    queryFn: async () => {
      const res = await api.get<ApiResponse<Schedule>>('/schedule');
      return res.data;
    },
    enabled: options?.enabled ?? true,
    staleTime: 120_000,
  });
}

export function useUpdateWorkingHours() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { days: ScheduleDay[] }) => {
      const res = await api.put<ApiResponse<Schedule>>('/schedule/hours', payload);
      return res.data;
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: scheduleKeys.weekly() });
      const previous = queryClient.getQueryData<ApiResponse<Schedule>>(scheduleKeys.weekly());

      if (previous) {
        queryClient.setQueryData(scheduleKeys.weekly(), {
          ...previous,
          data: { ...(previous as ApiResponse<Schedule>).data, weekly: payload.days },
        });
      }
      return { previous };
    },
    onError: (_err, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(scheduleKeys.weekly(), context.previous);
      }
      getTelegram()?.HapticFeedback.notificationOccurred('error');
    },
    onSuccess: () => {
      getTelegram()?.HapticFeedback.notificationOccurred('success');
      queryClient.invalidateQueries({ queryKey: scheduleKeys.weekly() });
      queryClient.invalidateQueries({ queryKey: scheduleKeys.days() });
      queryClient.invalidateQueries({ queryKey: bookingKeys.slotsRoot() });
      queryClient.invalidateQueries({ queryKey: bookingKeys.slotsCalendarRoot() });
    },
  });
}

export function useCreateOverride() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: CreateOverrideDto) => {
      const res = await api.post<ApiResponse<ScheduleOverride>>('/schedule/overrides', dto);
      return res.data;
    },
    onSuccess: () => {
      getTelegram()?.HapticFeedback.notificationOccurred('success');
      queryClient.invalidateQueries({ queryKey: scheduleKeys.weekly() });
      queryClient.invalidateQueries({ queryKey: scheduleKeys.days() });
      queryClient.invalidateQueries({ queryKey: bookingKeys.slotsRoot() });
      queryClient.invalidateQueries({ queryKey: bookingKeys.slotsCalendarRoot() });
    },
  });
}

export function useDaySchedule(date: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: scheduleKeys.day(date),
    queryFn: async () => {
      const res = await api.get<ApiResponse<DaySchedule>>(`/schedule/date/${date}`);
      return res.data;
    },
    enabled: !!date && (options?.enabled ?? true),
    staleTime: 30_000,
  });
}

export function useUpdateDaySchedule(date: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: CreateOverrideDto) => {
      const res = await api.put<ApiResponse<DaySchedule>>(`/schedule/date/${date}`, dto);
      return res.data;
    },
    onSuccess: () => {
      getTelegram()?.HapticFeedback.notificationOccurred('success');
      queryClient.invalidateQueries({ queryKey: scheduleKeys.day(date) });
      queryClient.invalidateQueries({ queryKey: bookingKeys.lists() });
      queryClient.invalidateQueries({ queryKey: bookingKeys.slotsRoot() });
      queryClient.invalidateQueries({ queryKey: bookingKeys.slotsCalendarRoot() });
    },
    onError: () => {
      getTelegram()?.HapticFeedback.notificationOccurred('error');
    },
  });
}

export function useDeleteOverride() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/schedule/overrides/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduleKeys.weekly() });
      queryClient.invalidateQueries({ queryKey: scheduleKeys.days() });
      queryClient.invalidateQueries({ queryKey: bookingKeys.slotsRoot() });
      queryClient.invalidateQueries({ queryKey: bookingKeys.slotsCalendarRoot() });
    },
  });
}
