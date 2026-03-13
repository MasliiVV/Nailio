import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiResponse, DashboardData } from '@/types';

export const analyticsKeys = {
  all: ['analytics'] as const,
  dashboard: (period: string) => [...analyticsKeys.all, 'dashboard', period] as const,
};

export function useDashboard(period: 'week' | 'month' | 'year' = 'week') {
  return useQuery({
    queryKey: analyticsKeys.dashboard(period),
    queryFn: async () => {
      const res = await api.get<ApiResponse<DashboardData>>(
        `/analytics/dashboard?period=${period}`,
      );
      return res.data;
    },
    staleTime: 60_000, // 1 min
  });
}
