import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  ApiResponse,
  Schedule,
  WorkingHours,
  ScheduleOverride,
  CreateOverrideDto,
} from '@/types';
import { getTelegram } from '@/lib/telegram';

export const scheduleKeys = {
  all: ['schedule'] as const,
};

export function useSchedule() {
  return useQuery({
    queryKey: scheduleKeys.all,
    queryFn: async () => {
      const res = await api.get<ApiResponse<Schedule>>('/api/v1/schedule');
      return res.data;
    },
  });
}

export function useUpdateWorkingHours() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (hours: WorkingHours) => {
      const res = await api.put<ApiResponse<Schedule>>('/api/v1/schedule/hours', hours);
      return res.data;
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
      const res = await api.post<ApiResponse<ScheduleOverride>>('/api/v1/schedule/overrides', dto);
      return res.data;
    },
    onSuccess: () => {
      getTelegram()?.HapticFeedback.notificationOccurred('success');
      queryClient.invalidateQueries({ queryKey: scheduleKeys.all });
    },
  });
}

export function useDeleteOverride() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/v1/schedule/overrides/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduleKeys.all });
    },
  });
}
