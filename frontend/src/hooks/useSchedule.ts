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
      const res = await api.get<ApiResponse<Schedule>>('/schedule');
      return res.data;
    },
    staleTime: 120_000,
  });
}

export function useUpdateWorkingHours() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      payload: { hours: Array<Omit<WorkingHours, 'isWorking'>> } | WorkingHours,
    ) => {
      const res = await api.put<ApiResponse<Schedule>>('/schedule/hours', payload);
      return res.data;
    },
    // Optimistic update — toggle shows immediately instead of waiting for server
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: scheduleKeys.all });
      const previous = queryClient.getQueryData<ApiResponse<Schedule>>(scheduleKeys.all);

      if (previous && 'dayOfWeek' in payload) {
        const updatedHours = [
          ...(previous.data?.hours || (previous as unknown as Schedule).hours || []),
        ];
        const idx = updatedHours.findIndex((h) => h.dayOfWeek === payload.dayOfWeek);
        const newHour: WorkingHours = {
          dayOfWeek: payload.dayOfWeek,
          isWorking: payload.isWorking,
          startTime: payload.startTime,
          endTime: payload.endTime,
        };
        if (idx >= 0) {
          updatedHours[idx] = newHour;
        } else {
          updatedHours.push(newHour);
        }

        // Handle both { success, data: Schedule } and raw Schedule formats
        const isWrapped = previous && 'success' in (previous as unknown as Record<string, unknown>);
        if (isWrapped) {
          queryClient.setQueryData(scheduleKeys.all, {
            ...previous,
            data: { ...(previous as ApiResponse<Schedule>).data, hours: updatedHours },
          });
        } else {
          queryClient.setQueryData(scheduleKeys.all, {
            ...(previous as unknown as Schedule),
            hours: updatedHours,
          });
        }
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
