import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiResponse, Client, ClientDetail, PaginatedResponse } from '@/types';
import { getTelegram } from '@/lib/telegram';

export const clientKeys = {
  all: ['clients'] as const,
  list: (search?: string) => [...clientKeys.all, 'list', search] as const,
  detail: (id: string) => [...clientKeys.all, id] as const,
};

export function useClients(search?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: clientKeys.list(search),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const qs = params.toString();
      const res = await api.get<ApiResponse<PaginatedResponse<Client>>>(
        `/clients${qs ? `?${qs}` : ''}`,
      );
      return res.data;
    },
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: clientKeys.detail(id),
    queryFn: async () => {
      const res = await api.get<ApiResponse<ClientDetail>>(`/clients/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

export function useBlockClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/clients/${id}/block`);
    },
    onSuccess: () => {
      getTelegram()?.HapticFeedback.notificationOccurred('warning');
      queryClient.invalidateQueries({ queryKey: clientKeys.all });
    },
  });
}

export function useUnblockClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/clients/${id}/unblock`);
    },
    onSuccess: () => {
      getTelegram()?.HapticFeedback.notificationOccurred('success');
      queryClient.invalidateQueries({ queryKey: clientKeys.all });
    },
  });
}
