import { useMemo } from 'react';
import styles from './DatePicker.module.css';
import { getTelegram } from '@/lib/telegram';

interface DatePickerProps {
  selectedDate: string; // YYYY-MM-DD
  onSelect: (date: string) => void;
  daysAhead?: number;
}

const DAY_NAMES_UK = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTH_NAMES_UK = [
  'Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер',
  'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру',
];

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

export function DatePicker({
  selectedDate,
  onSelect,
  daysAhead = 30,
}: DatePickerProps) {
  const dates = useMemo(() => {
    const result: Date[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < daysAhead; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      result.push(d);
    }
    return result;
  }, [daysAhead]);

  const handleSelect = (date: string) => {
    getTelegram()?.HapticFeedback.selectionChanged();
    onSelect(date);
  };

  // Group by month for display
  let currentMonth = -1;

  return (
    <div className={styles.container}>
      <div className={`${styles.scroll} hide-scrollbar`}>
        {dates.map((d) => {
          const key = formatDateKey(d);
          const isSelected = key === selectedDate;
          const today = isToday(d);
          const showMonth = d.getMonth() !== currentMonth;
          currentMonth = d.getMonth();

          return (
            <div key={key} className={styles.dateWrapper}>
              {showMonth && (
                <div className={styles.monthLabel}>
                  {MONTH_NAMES_UK[d.getMonth()]}
                </div>
              )}
              <button
                className={[
                  styles.dateItem,
                  isSelected ? styles.selected : '',
                  today ? styles.today : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => handleSelect(key)}
              >
                <span className={styles.dayName}>
                  {DAY_NAMES_UK[d.getDay()]}
                </span>
                <span className={styles.dayNumber}>{d.getDate()}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
