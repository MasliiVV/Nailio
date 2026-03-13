import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  ApiResponse,
  Booking,
  CancelBookingDto,
  CreateBookingDto,
  PaginatedResponse,
  SlotsResponse,
} from '@/types';
import { getTelegram } from '@/lib/telegram';

// ---- Query keys ----
export const bookingKeys = {
  all: ['bookings'] as const,
  list: (params?: Record<string, string>) => [...bookingKeys.all, 'list', params] as const,
  detail: (id: string) => [...bookingKeys.all, id] as const,
  slots: (date: string, serviceId: string) =>
    [...bookingKeys.all, 'slots', date, serviceId] as const,
};

// ---- Fetch slots ----
export function useSlots(date: string, serviceId: string) {
  return useQuery({
    queryKey: bookingKeys.slots(date, serviceId),
    queryFn: async () => {
      const res = await api.get<ApiResponse<SlotsResponse>>(
        `/bookings/slots?date=${date}&serviceId=${serviceId}`,
      );
      return res.data;
    },
    enabled: !!date && !!serviceId,
    staleTime: 30_000, // 30 seconds — slots can change
  });
}

// ---- Fetch bookings list ----
export function useBookings(params?: { status?: string; upcoming?: boolean; cursor?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.upcoming !== undefined) searchParams.set('upcoming', String(params.upcoming));
  if (params?.cursor) searchParams.set('cursor', params.cursor);

  const qs = searchParams.toString();

  return useQuery({
    queryKey: bookingKeys.list(params as Record<string, string>),
    queryFn: async () => {
      const res = await api.get<ApiResponse<PaginatedResponse<Booking>>>(
        `/bookings${qs ? `?${qs}` : ''}`,
      );
      return res.data;
    },
  });
}

// ---- Get single booking ----
export function useBooking(id: string) {
  return useQuery({
    queryKey: bookingKeys.detail(id),
    queryFn: async () => {
      const res = await api.get<ApiResponse<Booking>>(`/bookings/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
}

// ---- Create booking ----
export function useCreateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: CreateBookingDto) => {
      const res = await api.post<ApiResponse<Booking>>('/bookings', dto);
      return res.data;
    },
    onSuccess: () => {
      const tg = getTelegram();
      tg?.HapticFeedback.notificationOccurred('success');
      queryClient.invalidateQueries({ queryKey: bookingKeys.all });
    },
    onError: () => {
      const tg = getTelegram();
      tg?.HapticFeedback.notificationOccurred('error');
    },
  });
}

// ---- Cancel booking ----
export function useCancelBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, dto }: { id: string; dto?: CancelBookingDto }) => {
      const res = await api.post<ApiResponse<Booking>>(`/bookings/${id}/cancel`, dto);
      return res.data;
    },
    onSuccess: (_data, variables) => {
      const tg = getTelegram();
      tg?.HapticFeedback.notificationOccurred('warning');
      queryClient.invalidateQueries({ queryKey: bookingKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: bookingKeys.all });
    },
  });
}

// ---- Complete booking (master) ----
export function useCompleteBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<ApiResponse<Booking>>(`/bookings/${id}/complete`);
      return res.data;
    },
    onSuccess: (_data, id) => {
      const tg = getTelegram();
      tg?.HapticFeedback.notificationOccurred('success');
      queryClient.invalidateQueries({ queryKey: bookingKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: bookingKeys.all });
    },
  });
}

// ---- No-show booking (master) ----
export function useNoShowBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<ApiResponse<Booking>>(`/bookings/${id}/no-show`);
      return res.data;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: bookingKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: bookingKeys.all });
    },
  });
}
