/**
 * Prefetch critical API data during authentication.
 *
 * Instead of waiting: auth → render → hooks fire → fetch → show data,
 * we start fetching dashboard + bookings AS SOON as auth succeeds,
 * so data is already in the TanStack Query cache when the hooks mount.
 */

import type { QueryClient } from '@tanstack/react-query';
import { api } from './api';
import type {
  ApiResponse,
  PaginatedResponse,
  Booking,
  DashboardData,
  FinanceSummary,
  Transaction,
  Subscription,
  SubscriptionPayment,
} from '@/types';

let queryClientRef: QueryClient | null = null;

function preloadMasterPages(): void {
  void Promise.all([
    import('@/pages/master/AnalyticsPage'),
    import('@/pages/master/FinancePage'),
    import('@/pages/master/SubscriptionPage'),
  ]);
}

export function prefetchMasterInsights(): void {
  if (!queryClientRef) return;

  preloadMasterPages();

  queryClientRef.prefetchQuery({
    queryKey: ['analytics', 'dashboard', 'week'],
    queryFn: () => api.get<ApiResponse<DashboardData>>('/analytics/dashboard?period=week').then((r) => r.data),
    staleTime: 60_000,
  });

  queryClientRef.prefetchQuery({
    queryKey: ['finance', 'summary', undefined],
    queryFn: () => api.get<ApiResponse<FinanceSummary>>('/finance/summary').then((r) => r.data),
    staleTime: 60_000,
  });

  queryClientRef.prefetchQuery({
    queryKey: ['finance', 'transactions'],
    queryFn: () => api.get<ApiResponse<PaginatedResponse<Transaction>>>('/finance/transactions').then((r) => r.data),
    staleTime: 60_000,
  });

  queryClientRef.prefetchQuery({
    queryKey: ['subscription', 'status'],
    queryFn: async () => {
      try {
        const res = await api.get<ApiResponse<Subscription>>('/subscription');
        return res.data;
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });

  queryClientRef.prefetchQuery({
    queryKey: ['subscription', 'payments'],
    queryFn: async () => {
      try {
        const res = await api.get<ApiResponse<SubscriptionPayment[]>>('/subscription/payments');
        return res.data;
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
  });
}

export function setQueryClient(qc: QueryClient): void {
  queryClientRef = qc;
}

/** Call right after successful auth for master role */
export function prefetchMasterData(): void {
  if (!queryClientRef) return;

  preloadMasterPages();

  // Prefetch all bookings (calendar landing page needs them)
  queryClientRef.prefetchQuery({
    queryKey: ['bookings', 'list', undefined],
    queryFn: () => api.get<ApiResponse<PaginatedResponse<Booking>>>('/bookings').then((r) => r.data),
    staleTime: 60_000,
  });

  // Prefetch upcoming bookings
  queryClientRef.prefetchQuery({
    queryKey: ['bookings', 'list', { upcoming: 'true' }],
    queryFn: () => api.get<ApiResponse<PaginatedResponse<Booking>>>('/bookings?upcoming=true').then((r) => r.data),
    staleTime: 60_000,
  });

  prefetchMasterInsights();
}

/** Call right after successful auth for client role */
export function prefetchClientData(): void {
  if (!queryClientRef) return;

  // Prefetch client's bookings
  queryClientRef.prefetchQuery({
    queryKey: ['bookings', 'list', { upcoming: 'true' }],
    queryFn: () => api.get<ApiResponse<PaginatedResponse<Booking>>>('/bookings?upcoming=true').then((r) => r.data),
    staleTime: 60_000,
  });
}
