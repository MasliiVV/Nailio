import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiResponse, Service, CreateServiceDto, UpdateServiceDto } from '@/types';
import { getTelegram } from '@/lib/telegram';

export const serviceKeys = {
  all: ['services'] as const,
  list: () => [...serviceKeys.all, 'list'] as const,
  detail: (id: string) => [...serviceKeys.all, id] as const,
};

export function useServices(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: serviceKeys.list(),
    queryFn: async () => {
      const res = await api.get<ApiResponse<Service[]>>('/services');
      return res.data;
    },
    enabled: options?.enabled ?? true,
    staleTime: 120_000,
  });
}

export function useService(id: string) {
  return useQuery({
    queryKey: serviceKeys.detail(id),
    queryFn: async () => {
      const res = await api.get<ApiResponse<Service>>(`/services/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useCreateService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: CreateServiceDto) => {
      const res = await api.post<ApiResponse<Service>>('/services', dto);
      return res.data;
    },
    onSuccess: () => {
      getTelegram()?.HapticFeedback.notificationOccurred('success');
      queryClient.invalidateQueries({ queryKey: serviceKeys.all });
    },
  });
}

export function useUpdateService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto: UpdateServiceDto }) => {
      const res = await api.put<ApiResponse<Service>>(`/services/${id}`, dto);
      return res.data;
    },
    onSuccess: () => {
      getTelegram()?.HapticFeedback.notificationOccurred('success');
      queryClient.invalidateQueries({ queryKey: serviceKeys.all });
    },
  });
}

export function useDeleteService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/services/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serviceKeys.all });
    },
  });
}
