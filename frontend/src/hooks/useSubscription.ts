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
      try {
        const res = await api.get<ApiResponse<Subscription>>('/subscription');
        return res.data;
      } catch (err: unknown) {
        // 404 means no subscription yet — return null instead of throwing
        if (
          err &&
          typeof err === 'object' &&
          'statusCode' in err &&
          (err as { statusCode: number }).statusCode === 404
        ) {
          return null;
        }
        throw err;
      }
    },
    staleTime: 60_000,
  });
}

export function useSubscriptionPayments() {
  return useQuery({
    queryKey: subscriptionKeys.payments(),
    queryFn: async () => {
      try {
        const res = await api.get<ApiResponse<SubscriptionPayment[]>>('/subscription/payments');
        return res.data;
      } catch (err: unknown) {
        if (
          err &&
          typeof err === 'object' &&
          'statusCode' in err &&
          (err as { statusCode: number }).statusCode === 404
        ) {
          return [];
        }
        throw err;
      }
    },
    staleTime: 60_000,
  });
}

export function useCheckout() {
  return useMutation({
    mutationFn: async (provider: 'monobank' | 'liqpay') => {
      const res = await api.post<ApiResponse<CheckoutResponse>>('/subscription/checkout', {
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
      await api.post('/subscription/cancel');
    },
    onSuccess: () => {
      getTelegram()?.HapticFeedback.notificationOccurred('warning');
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
    },
  });
}
