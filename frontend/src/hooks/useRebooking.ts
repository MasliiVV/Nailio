import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  ApiResponse,
  GenerateRebookingMessageDto,
  GenerateRebookingMessageResponse,
  RebookingOverview,
  SendRebookingCampaignDto,
} from '@/types';
import { getTelegram } from '@/lib/telegram';

export const rebookingKeys = {
  all: ['rebooking'] as const,
  overview: (date?: string) => [...rebookingKeys.all, 'overview', date] as const,
};

export function useRebookingOverview(date?: string) {
  return useQuery({
    queryKey: rebookingKeys.overview(date),
    queryFn: async () => {
      const suffix = date ? `?date=${date}` : '';
      const res = await api.get<ApiResponse<RebookingOverview>>(`/rebooking/overview${suffix}`);
      return res.data;
    },
    staleTime: 30_000,
  });
}

export function useGenerateRebookingMessage() {
  return useMutation({
    mutationFn: async (dto: GenerateRebookingMessageDto) => {
      const res = await api.post<ApiResponse<GenerateRebookingMessageResponse>>(
        '/rebooking/generate-message',
        dto,
      );
      return res.data;
    },
    onError: () => {
      getTelegram()?.HapticFeedback.notificationOccurred('error');
    },
  });
}

export function useSendRebookingCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: SendRebookingCampaignDto) => {
      const res = await api.post<ApiResponse<{ success: boolean; sentCount: number }>>(
        '/rebooking/campaigns',
        dto,
      );
      return res.data;
    },
    onSuccess: () => {
      getTelegram()?.HapticFeedback.notificationOccurred('success');
      queryClient.invalidateQueries({ queryKey: rebookingKeys.all });
    },
    onError: () => {
      getTelegram()?.HapticFeedback.notificationOccurred('error');
    },
  });
}
