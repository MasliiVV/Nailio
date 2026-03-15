import { useEffect, useMemo, useState } from 'react';
import styles from './DatePicker.module.css';
import { getTelegram } from '@/lib/telegram';

interface DatePickerProps {
  selectedDate: string; // YYYY-MM-DD
  onSelect: (date: string) => void;
  daysAhead?: number;
  availabilityByDate?: Record<string, 'available' | 'unavailable' | 'loading'>;
}

const DAY_NAMES_UK = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTH_NAMES_UK = [
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

const CALENDAR_DAY_NAMES_UK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addMonths(date: Date, diff: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + diff, 1);
}

function isSameMonth(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function parseDateKey(value: string): Date | null {
  if (!value) return null;

  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
}

export function DatePicker({
  selectedDate,
  onSelect,
  daysAhead = 30,
  availabilityByDate,
}: DatePickerProps) {
  const { minDate, maxDate } = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + daysAhead - 1);

    return { minDate: start, maxDate: end };
  }, [daysAhead]);

  const initialVisibleMonth = useMemo(() => {
    const selected = parseDateKey(selectedDate);
    if (selected && selected >= minDate && selected <= maxDate) {
      return startOfMonth(selected);
    }
    return startOfMonth(minDate);
  }, [selectedDate, minDate, maxDate]);

  const [visibleMonth, setVisibleMonth] = useState(initialVisibleMonth);

  useEffect(() => {
    setVisibleMonth(initialVisibleMonth);
  }, [initialVisibleMonth]);

  const calendarDays = useMemo(() => {
    const firstDayOfMonth = startOfMonth(visibleMonth);
    const lastDayOfMonth = endOfMonth(visibleMonth);
    const firstWeekday = (firstDayOfMonth.getDay() + 6) % 7;
    const daysInMonth = lastDayOfMonth.getDate();

    const cells: Array<Date | null> = [];

    for (let i = 0; i < firstWeekday; i++) {
      cells.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day));
    }

    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    return cells;
  }, [visibleMonth]);

  const canGoPrev = startOfMonth(visibleMonth) > startOfMonth(minDate);
  const canGoNext = startOfMonth(visibleMonth) < startOfMonth(maxDate);

  const handleSelect = (date: string) => {
    getTelegram()?.HapticFeedback.selectionChanged();
    onSelect(date);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.navButton}
          onClick={() => setVisibleMonth((prev) => addMonths(prev, -1))}
          disabled={!canGoPrev}
          aria-label="Попередній місяць"
        >
          ‹
        </button>
        <div className={styles.monthTitle}>
          {MONTH_NAMES_UK[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
        </div>
        <button
          type="button"
          className={styles.navButton}
          onClick={() => setVisibleMonth((prev) => addMonths(prev, 1))}
          disabled={!canGoNext}
          aria-label="Наступний місяць"
        >
          ›
        </button>
      </div>

      <div className={styles.weekdays}>
        {CALENDAR_DAY_NAMES_UK.map((dayName) => (
          <span key={dayName} className={styles.weekday}>
            {dayName}
          </span>
        ))}
      </div>

      <div className={styles.grid}>
        {calendarDays.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className={styles.emptyCell} aria-hidden="true" />;
          }

          const key = formatDateKey(date);
          const isSelected = key === selectedDate;
          const today = isToday(date);
          const availability = availabilityByDate?.[key];
          const isOutOfRange = date < minDate || date > maxDate;
          const isUnavailable = availability === 'unavailable';
          const isLoading = availability === 'loading';
          const isDisabled = isOutOfRange || isUnavailable;

          return (
            <button
              key={key}
              type="button"
              className={[
                styles.dateItem,
                isSelected ? styles.selected : '',
                today ? styles.today : '',
                isUnavailable ? styles.unavailable : '',
                isLoading ? styles.loading : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => handleSelect(key)}
              disabled={isDisabled}
              aria-label={`${DAY_NAMES_UK[date.getDay()]} ${date.getDate()}`}
              aria-pressed={isSelected}
            >
              <span className={styles.dayNumber}>{date.getDate()}</span>
              {isUnavailable ? <span className={styles.dayStatus}>❌</span> : null}
              {isLoading ? <span className={styles.dayHint}>…</span> : null}
              {!isUnavailable && !isLoading && isSameMonth(date, visibleMonth) ? (
                <span className={styles.dayHint}>{DAY_NAMES_UK[date.getDay()]}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
