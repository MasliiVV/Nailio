import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ClientMessageSheet } from '@/components/ClientMessageSheet/ClientMessageSheet';
import { useSendClientMessage } from '@/hooks';
import { useGenerateRebookingMessage, useRebookingOverview } from '@/hooks/useRebooking';

vi.mock('@/components/ui', () => ({
  BottomSheet: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title?: string;
    children: ReactNode;
  }) =>
    open ? (
      <div>
        {title ? <h3>{title}</h3> : null}
        {children}
      </div>
    ) : null,
  Button: ({
    children,
    onClick,
    disabled,
    loading,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    loading?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled || loading}>
      {children}
    </button>
  ),
}));

vi.mock('@/hooks', () => ({
  useSendClientMessage: vi.fn(),
}));

vi.mock('@/hooks/useRebooking', () => ({
  useGenerateRebookingMessage: vi.fn(),
  useRebookingOverview: vi.fn(),
}));

const mockGenerateMessage = vi.fn();
const mockSendMessage = vi.fn();

const mockOverview = {
  selectedDate: '2026-03-18',
  emptySlots: [
    {
      date: '2026-03-18',
      startTime: '10:00',
      endTime: '11:00',
    },
  ],
};

describe('ClientMessageSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGenerateMessage.mockResolvedValue({ message: 'AI polished message' });
    mockSendMessage.mockResolvedValue({ success: true });

    vi.mocked(useRebookingOverview).mockReturnValue({
      data: mockOverview,
    } as unknown as ReturnType<typeof useRebookingOverview>);

    vi.mocked(useGenerateRebookingMessage).mockReturnValue({
      mutateAsync: mockGenerateMessage,
      isPending: false,
      isError: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useGenerateRebookingMessage>);

    vi.mocked(useSendClientMessage).mockReturnValue({
      mutateAsync: mockSendMessage,
      isPending: false,
      isError: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useSendClientMessage>);
  });

  it('requires a topic before AI generation', () => {
    render(<ClientMessageSheet clientId="client-1" mode="promo" open onClose={() => {}} />);

    expect(screen.getByRole('button', { name: 'clients.aiPromoGenerate' })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('clients.aiPromoTopicPlaceholder'), {
      target: { value: 'м’яке нагадування про повторний візит' },
    });

    expect(screen.getByRole('button', { name: 'clients.aiPromoGenerate' })).toBeEnabled();
  });

  it('appends generated promo text and keeps cursor at the end', async () => {
    render(<ClientMessageSheet clientId="client-1" mode="promo" open onClose={() => {}} />);

    const topicTextarea = screen.getByPlaceholderText('clients.aiPromoTopicPlaceholder');
    const messageTextarea = screen.getByPlaceholderText('clients.reminderPromoPlaceholder');

    fireEvent.change(topicTextarea, {
      target: { value: 'акцент на ранкових слотах' },
    });
    fireEvent.change(messageTextarea, {
      target: { value: 'Existing draft' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'clients.aiPromoRegenerate' }));

    await waitFor(() => {
      expect(mockGenerateMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignType: 'cycle_followup',
          clientIds: ['client-1'],
          date: '2026-03-18',
          startTime: '10:00',
          endTime: '11:00',
          tone: 'friendly',
          extraInstructions: 'акцент на ранкових слотах',
          slotOptions: [{ date: '2026-03-18', startTime: '10:00', endTime: '11:00' }],
        }),
      );
    });

    await waitFor(() => {
      expect(messageTextarea).toHaveValue('Existing draft\n\nAI polished message');
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const textarea = screen.getByPlaceholderText(
      'clients.reminderPromoPlaceholder',
    ) as HTMLTextAreaElement;
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(textarea.value.length);
    expect(textarea.selectionEnd).toBe(textarea.value.length);
  });
});
