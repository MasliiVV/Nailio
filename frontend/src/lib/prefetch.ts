/**
 * Prefetch critical API data during authentication.
 *
 * Instead of waiting: auth → render → hooks fire → fetch → show data,
 * we start fetching dashboard + bookings AS SOON as auth succeeds,
 * so data is already in the TanStack Query cache when the hooks mount.
 */

import type { QueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { ApiResponse, DashboardData, PaginatedResponse, Booking } from '@/types';

let queryClientRef: QueryClient | null = null;

export function setQueryClient(qc: QueryClient): void {
  queryClientRef = qc;
}

/** Call right after successful auth for master role */
export function prefetchMasterData(): void {
  if (!queryClientRef) return;

  // Prefetch dashboard — fire & forget, goes into cache
  queryClientRef.prefetchQuery({
    queryKey: ['analytics', 'dashboard', 'week'],
    queryFn: () => api.get<ApiResponse<DashboardData>>('/analytics/dashboard?period=week').then((r) => r.data),
    staleTime: 60_000,
  });

  // Prefetch upcoming bookings
  queryClientRef.prefetchQuery({
    queryKey: ['bookings', 'list', { upcoming: 'true' }],
    queryFn: () => api.get<ApiResponse<PaginatedResponse<Booking>>>('/bookings?upcoming=true').then((r) => r.data),
    staleTime: 60_000,
  });
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
