import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiResponse, UpdateBrandingDto } from '@/types';

export const settingsKeys = {
  all: ['settings'] as const,
  detail: () => [...settingsKeys.all, 'detail'] as const,
};

interface SettingsResponse {
  id: string;
  displayName: string;
  logoUrl: string | null;
  branding: { primaryColor?: string; secondaryColor?: string; welcomeMessage?: string } | null;
  settings: Record<string, unknown>;
  [key: string]: unknown;
}

interface BrandingResponse {
  id: string;
  displayName: string;
  slug: string;
  logoUrl: string | null;
  branding: Record<string, string | undefined> | null;
}

export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.detail(),
    queryFn: async () => {
      const res = await api.get<ApiResponse<SettingsResponse>>('/settings');
      return res.data;
    },
  });
}

export function useUpdateBranding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: UpdateBrandingDto) => {
      const res = await api.put<ApiResponse<BrandingResponse>>('/settings/branding', dto);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}

export function useUploadLogo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.upload<ApiResponse<BrandingResponse>>('/settings/logo', formData);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}

export function useDeleteLogo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await api.delete<ApiResponse<BrandingResponse>>('/settings/logo');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.all });
    },
  });
}
