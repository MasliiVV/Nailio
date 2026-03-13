import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DatePicker } from '../components/ui/DatePicker/DatePicker';

describe('DatePicker', () => {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  it('renders date buttons', () => {
    render(<DatePicker selectedDate={todayKey} onSelect={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders 30 days by default', () => {
    render(<DatePicker selectedDate={todayKey} onSelect={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(30);
  });

  it('renders custom daysAhead', () => {
    render(<DatePicker selectedDate={todayKey} onSelect={() => {}} daysAhead={7} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(7);
  });

  it('highlights selected date', () => {
    render(<DatePicker selectedDate={todayKey} onSelect={() => {}} />);
    const buttons = screen.getAllByRole('button');
    const selectedButton = buttons.find((btn) => btn.className.includes('selected'));
    expect(selectedButton).toBeTruthy();
  });

  it('marks today with special class', () => {
    render(<DatePicker selectedDate="" onSelect={() => {}} />);
    const buttons = screen.getAllByRole('button');
    const todayBtn = buttons.find((btn) => btn.className.includes('today'));
    expect(todayBtn).toBeTruthy();
  });

  it('calls onSelect with date key on click', () => {
    const onSelect = vi.fn();
    render(<DatePicker selectedDate={todayKey} onSelect={onSelect} daysAhead={7} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[1]!); // Click second date
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('renders month labels', () => {
    render(<DatePicker selectedDate={todayKey} onSelect={() => {}} daysAhead={60} />);
    // Should have at least one month label visible
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
    expect(screen.getByText(currentMonthLabel!)).toBeInTheDocument();
  });

  it('renders day names in Ukrainian', () => {
    render(<DatePicker selectedDate={todayKey} onSelect={() => {}} />);
    const dayNames = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    // At least one day name should be present
    const found = dayNames.some((name) => screen.queryAllByText(name).length > 0);
    expect(found).toBe(true);
  });
});
