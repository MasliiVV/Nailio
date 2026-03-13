import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AdminTenantDetail, AdminTenantSummary, ApiResponse } from '@/types';

export const adminTenantKeys = {
  all: ['admin-tenants'] as const,
  list: () => [...adminTenantKeys.all, 'list'] as const,
  detail: (id: string) => [...adminTenantKeys.all, id] as const,
};

export function useAdminTenants() {
  return useQuery({
    queryKey: adminTenantKeys.list(),
    queryFn: async () => {
      const response = await api.get<ApiResponse<AdminTenantSummary[]>>('/admin/tenants');
      return response.data;
    },
  });
}

export function useAdminTenant(id: string) {
  return useQuery({
    queryKey: adminTenantKeys.detail(id),
    queryFn: async () => {
      const response = await api.get<ApiResponse<AdminTenantDetail>>(`/admin/tenants/${id}`);
      return response.data;
    },
    enabled: !!id,
  });
}
