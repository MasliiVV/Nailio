import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiResponse, TenantSettings, UpdateBrandingDto } from '@/types';

export const settingsKeys = {
  all: ['settings'] as const,
  detail: () => [...settingsKeys.all, 'detail'] as const,
};

export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.detail(),
    queryFn: async () => {
      const res = await api.get<ApiResponse<TenantSettings & { logoUrl?: string | null; displayName?: string }>>('/settings');
      return res.data;
    },
  });
}

export function useUpdateBranding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: UpdateBrandingDto & { logoUrl?: string }) => {
      const res = await api.put<ApiResponse<{ id: string; displayName: string; slug: string; logoUrl: string | null; branding: Record<string, string | undefined> | null }>>('/settings/branding', dto);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}
