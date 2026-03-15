import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
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
  day: (date: string) => [...scheduleKeys.all, 'day', date] as const,
};

export function useSchedule() {
  return useQuery({
    queryKey: scheduleKeys.all,
    queryFn: async () => {
      const res = await api.get<ApiResponse<Schedule>>('/schedule');
      return res.data;
    },
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
      await queryClient.cancelQueries({ queryKey: scheduleKeys.all });
      const previous = queryClient.getQueryData<ApiResponse<Schedule>>(scheduleKeys.all);

      if (previous) {
        queryClient.setQueryData(scheduleKeys.all, {
          ...previous,
          data: { ...(previous as ApiResponse<Schedule>).data, weekly: payload.days },
        });
      }
      return { previous };
    },
    onError: (_err, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(scheduleKeys.all, context.previous);
      }
      getTelegram()?.HapticFeedback.notificationOccurred('error');
    },
    onSuccess: () => {
      getTelegram()?.HapticFeedback.notificationOccurred('success');
      queryClient.invalidateQueries({ queryKey: scheduleKeys.all });
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
      queryClient.invalidateQueries({ queryKey: scheduleKeys.all });
    },
  });
}

export function useDaySchedule(date: string) {
  return useQuery({
    queryKey: scheduleKeys.day(date),
    queryFn: async () => {
      const res = await api.get<ApiResponse<DaySchedule>>(`/schedule/date/${date}`);
      return res.data;
    },
    enabled: !!date,
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
      queryClient.invalidateQueries({ queryKey: scheduleKeys.all });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
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
      queryClient.invalidateQueries({ queryKey: scheduleKeys.all });
    },
  });
}
