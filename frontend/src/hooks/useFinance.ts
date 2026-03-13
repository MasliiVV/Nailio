import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  ApiResponse,
  Transaction,
  FinanceSummary,
  CreateTransactionDto,
  PaginatedResponse,
} from '@/types';
import { getTelegram } from '@/lib/telegram';

export const financeKeys = {
  all: ['finance'] as const,
  transactions: () => [...financeKeys.all, 'transactions'] as const,
  summary: (period?: string) => [...financeKeys.all, 'summary', period] as const,
};

export function useTransactions() {
  return useQuery({
    queryKey: financeKeys.transactions(),
    queryFn: async () => {
      const res =
        await api.get<ApiResponse<PaginatedResponse<Transaction>>>('/finance/transactions');
      return res.data;
    },
  });
}

export function useFinanceSummary(period?: string) {
  return useQuery({
    queryKey: financeKeys.summary(period),
    queryFn: async () => {
      const params = period ? `?period=${period}` : '';
      const res = await api.get<ApiResponse<FinanceSummary>>(`/finance/summary${params}`);
      return res.data;
    },
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: CreateTransactionDto) => {
      const res = await api.post<ApiResponse<Transaction>>('/finance/transactions', dto);
      return res.data;
    },
    onSuccess: () => {
      getTelegram()?.HapticFeedback.notificationOccurred('success');
      queryClient.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
}
