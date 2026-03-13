/**
 * Prefetch critical API data during authentication.
 *
 * Instead of waiting: auth → render → hooks fire → fetch → show data,
 * we start fetching dashboard + bookings AS SOON as auth succeeds,
 * so data is already in the TanStack Query cache when the hooks mount.
 */

import type { QueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { ApiResponse, PaginatedResponse, Booking } from '@/types';

let queryClientRef: QueryClient | null = null;

export function setQueryClient(qc: QueryClient): void {
  queryClientRef = qc;
}

/** Call right after successful auth for master role */
export function prefetchMasterData(): void {
  if (!queryClientRef) return;

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
