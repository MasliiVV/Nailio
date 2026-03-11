import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  ApiResponse,
  Service,
  CreateServiceDto,
  UpdateServiceDto,
} from '@/types';
import { getTelegram } from '@/lib/telegram';

export const serviceKeys = {
  all: ['services'] as const,
  list: () => [...serviceKeys.all, 'list'] as const,
  detail: (id: string) => [...serviceKeys.all, id] as const,
};

export function useServices() {
  return useQuery({
    queryKey: serviceKeys.list(),
    queryFn: async () => {
      const res = await api.get<ApiResponse<Service[]>>('/api/v1/services');
      return res.data;
    },
  });
}

export function useService(id: string) {
  return useQuery({
    queryKey: serviceKeys.detail(id),
    queryFn: async () => {
      const res = await api.get<ApiResponse<Service>>(`/api/v1/services/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useCreateService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: CreateServiceDto) => {
      const res = await api.post<ApiResponse<Service>>('/api/v1/services', dto);
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
      const res = await api.put<ApiResponse<Service>>(`/api/v1/services/${id}`, dto);
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
      await api.delete(`/api/v1/services/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serviceKeys.all });
    },
  });
}
