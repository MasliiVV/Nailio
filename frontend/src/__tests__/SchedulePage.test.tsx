import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SchedulePage } from '@/pages/master/SchedulePage';
import { useSchedule, useUpdateWorkingHours, useWeeklyScheduleDraft } from '@/hooks';

const mockShowAlert = vi.fn();
const mockMutate = vi.fn();

vi.mock('@/components/ui', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
  SkeletonList: () => <div>loading</div>,
  Section: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  Toggle: ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <button type="button" aria-pressed={checked} onClick={onChange}>
      toggle
    </button>
  ),
}));

vi.mock('@/hooks', () => ({
  useSchedule: vi.fn(),
  useUpdateWorkingHours: vi.fn(),
  useWeeklyScheduleDraft: vi.fn(),
}));

vi.mock('@/lib/telegram', () => ({
  getTelegram: () => ({
    HapticFeedback: {
      selectionChanged: vi.fn(),
    },
    showAlert: mockShowAlert,
  }),
}));

describe('SchedulePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useSchedule).mockReturnValue({
      data: {
        weekly: [
          { dayOfWeek: 0, isDayOff: false, slots: ['09:00'] },
          { dayOfWeek: 1, isDayOff: true, slots: [] },
          { dayOfWeek: 2, isDayOff: true, slots: [] },
          { dayOfWeek: 3, isDayOff: true, slots: [] },
          { dayOfWeek: 4, isDayOff: true, slots: [] },
          { dayOfWeek: 5, isDayOff: true, slots: [] },
          { dayOfWeek: 6, isDayOff: true, slots: [] },
        ],
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useSchedule>);

    vi.mocked(useWeeklyScheduleDraft).mockReturnValue({
      draft: [
        { dayOfWeek: 0, isDayOff: false, slots: ['09:00'] },
        { dayOfWeek: 1, isDayOff: true, slots: [] },
        { dayOfWeek: 2, isDayOff: true, slots: [] },
        { dayOfWeek: 3, isDayOff: true, slots: [] },
        { dayOfWeek: 4, isDayOff: true, slots: [] },
        { dayOfWeek: 5, isDayOff: true, slots: [] },
        { dayOfWeek: 6, isDayOff: true, slots: [] },
      ],
      replaceDraft: vi.fn(),
      toggleDay: vi.fn(),
      addSlot: vi.fn(),
      copyPreviousDay: vi.fn(),
      changeSlot: vi.fn(),
      removeSlot: vi.fn(),
      serializeDays: vi.fn(() => [{ dayOfWeek: 0, isDayOff: false, slots: ['09:00'] }]),
    } as unknown as ReturnType<typeof useWeeklyScheduleDraft>);

    vi.mocked(useUpdateWorkingHours).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateWorkingHours>);
  });

  it('shows saved confirmation after successful schedule save', () => {
    render(<SchedulePage />);

    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    expect(mockMutate).toHaveBeenCalledWith(
      {
        days: [{ dayOfWeek: 0, isDayOff: false, slots: ['09:00'] }],
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
      }),
    );

    const [, options] = mockMutate.mock.calls[0]!;
    options.onSuccess();

    expect(mockShowAlert).toHaveBeenCalledWith('schedule.saved');
  });
});
