import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiResponse, Subscription, SubscriptionPayment, CheckoutResponse } from '@/types';
import { getTelegram } from '@/lib/telegram';

export const subscriptionKeys = {
  all: ['subscription'] as const,
  status: () => [...subscriptionKeys.all, 'status'] as const,
  payments: () => [...subscriptionKeys.all, 'payments'] as const,
};

export function useSubscription() {
  return useQuery({
    queryKey: subscriptionKeys.status(),
    queryFn: async () => {
      const res = await api.get<ApiResponse<Subscription>>('/api/v1/subscription');
      return res.data;
    },
    staleTime: 60_000,
  });
}

export function useSubscriptionPayments() {
  return useQuery({
    queryKey: subscriptionKeys.payments(),
    queryFn: async () => {
      const res = await api.get<ApiResponse<SubscriptionPayment[]>>(
        '/api/v1/subscription/payments',
      );
      return res.data;
    },
  });
}

export function useCheckout() {
  return useMutation({
    mutationFn: async (provider: 'monobank' | 'liqpay') => {
      const res = await api.post<ApiResponse<CheckoutResponse>>('/api/v1/subscription/checkout', {
        provider,
      });
      return res.data;
    },
    onSuccess: (data) => {
      // Open payment page in Telegram's in-app browser
      const tg = getTelegram();
      if (tg) {
        tg.openLink(data.paymentUrl);
      } else {
        window.open(data.paymentUrl, '_blank');
      }
    },
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await api.post('/api/v1/subscription/cancel');
    },
    onSuccess: () => {
      getTelegram()?.HapticFeedback.notificationOccurred('warning');
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
    },
  });
}
