import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DatePicker } from '../components/ui/DatePicker/DatePicker';

describe('DatePicker', () => {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  it('renders date buttons', () => {
    render(<DatePicker selectedDate={todayKey} onSelect={() => {}} />);
    const buttons = screen
      .getAllByRole('button')
      .filter((button) => !button.textContent?.includes('‹') && !button.textContent?.includes('›'));
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders month navigation', () => {
    render(<DatePicker selectedDate={todayKey} onSelect={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByLabelText('Попередній місяць')).toBeInTheDocument();
    expect(screen.getByLabelText('Наступний місяць')).toBeInTheDocument();
  });

  it('renders visible dates for custom daysAhead', () => {
    render(<DatePicker selectedDate={todayKey} onSelect={() => {}} daysAhead={7} />);
    expect(screen.getByText(String(today.getDate()))).toBeInTheDocument();
  });

  it('highlights selected date', () => {
    render(<DatePicker selectedDate={todayKey} onSelect={() => {}} />);
    const buttons = screen.getAllByRole('button');
    const selectedButton = buttons.find((btn) => btn.className.includes('selected'));
    expect(selectedButton).toBeTruthy();
  });

  it('marks today with special class', () => {
    render(<DatePicker selectedDate="" onSelect={() => {}} />);
    const buttons = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-label')?.includes(String(today.getDate())));
    const todayBtn = buttons.find((btn) => btn.className.includes('today'));
    expect(todayBtn).toBeTruthy();
  });

  it('calls onSelect with date key on click', () => {
    const onSelect = vi.fn();
    render(<DatePicker selectedDate={todayKey} onSelect={onSelect} daysAhead={7} />);
    const dayButtons = screen
      .getAllByRole('button')
      .filter((button) => button.hasAttribute('aria-label') && !button.hasAttribute('disabled'));
    fireEvent.click(dayButtons[1]!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('renders month title', () => {
    render(<DatePicker selectedDate={todayKey} onSelect={() => {}} daysAhead={60} />);
    const monthLabels = [
      'Січ',
      'Лют',
      'Бер',
      'Кві',
      'Тра',
      'Чер',
      'Лип',
      'Сер',
      'Вер',
      'Жов',
      'Лис',
      'Гру',
    ];
    const currentMonthLabel = monthLabels[today.getMonth()];
    expect(
      screen.getByText(new RegExp(`${currentMonthLabel}\\s+${today.getFullYear()}`)),
    ).toBeInTheDocument();
  });

  it('renders weekday header in Ukrainian', () => {
    render(<DatePicker selectedDate={todayKey} onSelect={() => {}} />);
    const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
    dayNames.forEach((name) => {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    });
  });

  it('disables unavailable dates and shows cross mark', () => {
    render(
      <DatePicker
        selectedDate={todayKey}
        onSelect={() => {}}
        availabilityByDate={{ [todayKey]: 'unavailable' }}
      />,
    );

    const todayButton = screen.getByLabelText(new RegExp(String(today.getDate())));
    expect(todayButton).toBeDisabled();
    expect(screen.getByText('❌')).toBeInTheDocument();
  });
});
