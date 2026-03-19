import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SmartRebookingPage } from '../pages/master/SmartRebookingPage';
import { useClients, useReturnReminders } from '@/hooks';
import {
  useGenerateRebookingMessage,
  useRebookingOverview,
  useSendRebookingCampaign,
} from '@/hooks/useRebooking';

vi.mock('@/hooks', () => ({
  useClients: vi.fn(),
  useReturnReminders: vi.fn(),
}));

vi.mock('@/hooks/useRebooking', () => ({
  useGenerateRebookingMessage: vi.fn(),
  useRebookingOverview: vi.fn(),
  useSendRebookingCampaign: vi.fn(),
}));

const mockOverview = {
  selectedDate: '2026-03-17',
  defaultCycleDays: 21,
  bestSendTime: '18:00',
  heatmap: [
    { date: '2026-03-17', totalSlots: 10, bookedSlots: 7, freeSlots: 3, occupancyRate: 70 },
  ],
  emptySlots: [
    {
      date: '2026-03-17',
      startTime: '10:00',
      endTime: '11:00',
      freeSlotCount: 2,
      isMorning: true,
    },
    {
      date: '2026-03-18',
      startTime: '13:00',
      endTime: '14:00',
      freeSlotCount: 2,
      isMorning: false,
    },
  ],
  recommendations: [
    {
      clientId: 'client-1',
      firstName: 'Anna',
      lastName: 'K',
      telegramId: '111',
      lastVisitAt: '2026-02-20T10:00:00.000Z',
      expectedReturnDate: '2026-03-17T10:00:00.000Z',
      averageCycleDays: 21,
      visitCount: 4,
      ltv: 400000,
      priority: 'high' as const,
      priorityScore: 90,
      reason: 'Пора нагадати',
      segments: ['due_soon', 'visits_3_plus'] as const,
      favoriteService: { id: 'service-1', name: 'Манікюр' },
    },
    {
      clientId: 'client-2',
      firstName: 'Olha',
      lastName: null,
      telegramId: '222',
      lastVisitAt: '2026-02-21T10:00:00.000Z',
      expectedReturnDate: '2026-03-18T10:00:00.000Z',
      averageCycleDays: 22,
      visitCount: 3,
      ltv: 220000,
      priority: 'medium' as const,
      priorityScore: 65,
      reason: 'Пора написати',
      segments: ['due_soon'] as const,
      favoriteService: { id: 'service-2', name: 'Покриття' },
    },
  ],
  kpis: {
    repeatClientRate: 55,
    occupancyRate: 70,
    averageLtv: 280000,
  },
  sendLog: [
    {
      id: 'log-1',
      type: 'slot_fill' as const,
      date: '2026-03-16',
      startTime: '15:00',
      endTime: '16:00',
      createdAt: '2026-03-15T10:00:00.000Z',
      status: 'active' as const,
      sentCount: 4,
      bookedCount: 1,
      closedCount: 0,
    },
  ],
};

const mockClients = {
  items: [
    {
      id: 'client-1',
      firstName: 'Anna',
      lastName: 'K',
      phone: null,
      telegramId: '111',
      notes: null,
      tags: [],
      isBlocked: false,
      lastVisitAt: '2026-02-20T10:00:00.000Z',
    },
    {
      id: 'client-2',
      firstName: 'Olha',
      lastName: null,
      phone: null,
      telegramId: '222',
      notes: null,
      tags: [],
      isBlocked: false,
      lastVisitAt: '2026-02-21T10:00:00.000Z',
    },
  ],
  nextCursor: null,
  hasMore: false,
};

const mockReturnReminders = [
  {
    id: 'client-1',
    firstName: 'Anna',
    lastName: 'K',
    phone: null,
    telegramId: '111',
    notes: null,
    tags: [],
    isBlocked: false,
    lastVisitAt: '2026-02-20T10:00:00.000Z',
    expectedReturnDate: '2026-03-17T10:00:00.000Z',
    daysUntilReturn: 1,
  },
];

const mockGenerateMessage = vi.fn();
const mockSendCampaign = vi.fn();

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/master/rebooking?date=2026-03-17&slot=10:00']}>
      <Routes>
        <Route path="/master/rebooking" element={<SmartRebookingPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SmartRebookingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useRebookingOverview).mockReturnValue({
      data: mockOverview,
      isLoading: false,
    } as unknown as ReturnType<typeof useRebookingOverview>);

    vi.mocked(useClients).mockReturnValue({
      data: mockClients,
      isLoading: false,
    } as unknown as ReturnType<typeof useClients>);

    vi.mocked(useReturnReminders).mockReturnValue({
      data: mockReturnReminders,
      isLoading: false,
    } as unknown as ReturnType<typeof useReturnReminders>);

    mockGenerateMessage.mockResolvedValue({ message: 'generated message' });
    mockSendCampaign.mockResolvedValue({ success: true, sentCount: 2 });

    vi.mocked(useGenerateRebookingMessage).mockReturnValue({
      mutateAsync: mockGenerateMessage,
      isPending: false,
    } as unknown as ReturnType<typeof useGenerateRebookingMessage>);

    vi.mocked(useSendRebookingCampaign).mockReturnValue({
      mutateAsync: mockSendCampaign,
      isPending: false,
    } as unknown as ReturnType<typeof useSendRebookingCampaign>);
  });

  it('renders redesigned rebooking sections without heatmap', () => {
    renderPage();

    expect(screen.getByText('rebooking.flow.slot')).toBeInTheDocument();
    expect(screen.getByText('rebooking.flow.cycle')).toBeInTheDocument();
    expect(screen.getByText('rebooking.step.slot')).toBeInTheDocument();
    expect(screen.getByText('rebooking.showDetails')).toBeInTheDocument();
    expect(screen.queryByText('rebooking.heatmap')).not.toBeInTheDocument();
  });

  it('generates slot-fill and cycle-followup messages with correct payloads', async () => {
    renderPage();

    fireEvent.click(screen.getAllByRole('button', { name: 'rebooking.improveText' })[0]!);
    fireEvent.click(screen.getByText('rebooking.flow.cycle'));
    fireEvent.click(screen.getByRole('button', { name: 'rebooking.improveText' }));

    await waitFor(() => {
      expect(mockGenerateMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          campaignType: 'slot_fill',
          date: '2026-03-17',
          startTime: '10:00',
          endTime: '11:00',
        }),
      );
    });

    await waitFor(() => {
      expect(mockGenerateMessage).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          campaignType: 'slot_fill',
          date: '2026-03-17',
          startTime: '10:00',
          endTime: '11:00',
        }),
      );
    });

    await waitFor(() => {
      expect(mockGenerateMessage).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          campaignType: 'cycle_followup',
          slotOptions: [
            { date: '2026-03-17', startTime: '10:00', endTime: '11:00' },
            { date: '2026-03-18', startTime: '13:00', endTime: '14:00' },
          ],
        }),
      );
    });
  });

  it('shows manual client picker for empty-slot promo', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'rebooking.editRecipients' }));

    await waitFor(() => {
      expect(screen.getByText('rebooking.recipientPickerTitle.slot')).toBeInTheDocument();
      expect(screen.getAllByText(/Anna/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Olha/).length).toBeGreaterThan(0);
    });
  });

  it('sends explicit client lists for slot and cycle flows', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'rebooking.sendSlotPromo' }));

    await waitFor(() => {
      expect(mockSendCampaign).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          campaignType: 'slot_fill',
          clientIds: expect.arrayContaining(['client-1', 'client-2']),
          slotOptions: [
            { date: '2026-03-17', startTime: '10:00', endTime: '11:00' },
            { date: '2026-03-18', startTime: '13:00', endTime: '14:00' },
          ],
        }),
      );
    });

    fireEvent.click(screen.getByText('rebooking.flow.cycle'));
    fireEvent.click(screen.getByRole('button', { name: 'rebooking.sendCyclePromo' }));

    await waitFor(() => {
      expect(mockSendCampaign).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          campaignType: 'cycle_followup',
          clientIds: expect.arrayContaining(['client-1', 'client-2']),
          slotOptions: [
            { date: '2026-03-17', startTime: '10:00', endTime: '11:00' },
            { date: '2026-03-18', startTime: '13:00', endTime: '14:00' },
          ],
        }),
      );
    });
  });
});
