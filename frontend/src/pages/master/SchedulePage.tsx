import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { Plus, Trash2 } from 'lucide-react';
import { useSchedule, useUpdateWorkingHours } from '@/hooks';
import { Card, Button, SkeletonList, Section, PageHeader, Toggle } from '@/components/ui';
import { getTelegram } from '@/lib/telegram';
import type { ScheduleDay } from '@/types';
import {
  createEmptyWeeklySchedule,
  getNextSlotTime,
  normalizeSlotTimes,
  WEEK_DAY_KEYS,
} from '@/lib/schedule';
import styles from './SchedulePage.module.css';

export function SchedulePage() {
  const intl = useIntl();
  const { data: schedule, isLoading } = useSchedule();
  const updateHours = useUpdateWorkingHours();
  const [draft, setDraft] = useState<ScheduleDay[]>(createEmptyWeeklySchedule());

  useEffect(() => {
    if (schedule?.weekly?.length) {
      setDraft(
        createEmptyWeeklySchedule().map((day) => {
          const existing = schedule.weekly.find((entry) => entry.dayOfWeek === day.dayOfWeek);
          return existing ? { ...existing, slots: [...existing.slots] } : day;
        }),
      );
    }
  }, [schedule]);

  const updateDay = (dayOfWeek: number, updater: (day: ScheduleDay) => ScheduleDay) => {
    setDraft((previous) =>
      previous.map((day) => (day.dayOfWeek === dayOfWeek ? updater(day) : day)),
    );
  };

  const handleToggleDay = (dayOfWeek: number) => {
    getTelegram()?.HapticFeedback.selectionChanged();
    updateDay(dayOfWeek, (day) => {
      if (day.isDayOff) {
        return { ...day, isDayOff: false, slots: day.slots.length > 0 ? day.slots : ['09:00'] };
      }
      return { ...day, isDayOff: true, slots: [] };
    });
  };

  const handleAddSlot = (dayOfWeek: number) => {
    updateDay(dayOfWeek, (day) => ({
      ...day,
      isDayOff: false,
      slots: [...day.slots, getNextSlotTime(day.slots)],
    }));
  };

  const handleCopyPreviousDay = (dayOfWeek: number) => {
    if (dayOfWeek === 0) return;

    setDraft((previous) => {
      const sourceDay = previous.find((day) => day.dayOfWeek === dayOfWeek - 1);
      if (!sourceDay || sourceDay.isDayOff || sourceDay.slots.length === 0) {
        return previous;
      }

      return previous.map((day) =>
        day.dayOfWeek === dayOfWeek
          ? {
              ...day,
              isDayOff: false,
              slots: [...sourceDay.slots],
            }
          : day,
      );
    });

    getTelegram()?.HapticFeedback.selectionChanged();
  };

  const handleSlotChange = (dayOfWeek: number, index: number, value: string) => {
    updateDay(dayOfWeek, (day) => ({
      ...day,
      slots: day.slots.map((slot, slotIndex) => (slotIndex === index ? value : slot)),
    }));
  };

  const handleRemoveSlot = (dayOfWeek: number, index: number) => {
    updateDay(dayOfWeek, (day) => {
      const nextSlots = day.slots.filter((_, slotIndex) => slotIndex !== index);
      return {
        ...day,
        slots: nextSlots,
        isDayOff: nextSlots.length === 0,
      };
    });
  };

  const handleSave = () => {
    updateHours.mutate({
      days: draft.map((day) => ({
        ...day,
        slots: day.isDayOff ? [] : normalizeSlotTimes(day.slots),
        isDayOff: day.isDayOff || normalizeSlotTimes(day.slots).length === 0,
      })),
    });
  };

  if (isLoading) {
    return (
      <div className="page">
        <SkeletonList count={7} />
      </div>
    );
  }

  return (
    <div className="page animate-fade-in">
      <PageHeader title={intl.formatMessage({ id: 'schedule.title' })} />

      <Section title={intl.formatMessage({ id: 'schedule.slotTemplate' })}>
        <Card padding="none">
          {WEEK_DAY_KEYS.map((dayKey, index) => {
            const day = draft[index]!;

            return (
              <div key={dayKey} className={styles.dayRow}>
                <div className={styles.dayInfo}>
                  <span className={styles.dayName}>
                    {intl.formatMessage({ id: `schedule.${dayKey}` })}
                  </span>
                  <Toggle checked={!day.isDayOff} onChange={() => handleToggleDay(index)} />
                </div>
                {day.isDayOff ? (
                  <div className={styles.dayOffText}>
                    {intl.formatMessage({ id: 'schedule.dayOff' })}
                  </div>
                ) : (
                  <div className={styles.slotList}>
                    {day.slots.map((slot, slotIndex) => (
                      <div key={`${day.dayOfWeek}-${slotIndex}`} className={styles.slotRow}>
                        <input
                          type="time"
                          className={styles.timeInput}
                          value={slot}
                          onChange={(e) =>
                            handleSlotChange(day.dayOfWeek, slotIndex, e.target.value)
                          }
                        />
                        <button
                          type="button"
                          className={styles.iconButton}
                          onClick={() => handleRemoveSlot(day.dayOfWeek, slotIndex)}
                          aria-label={intl.formatMessage({ id: 'common.delete' })}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    <div className={styles.slotActions}>
                      {day.dayOfWeek > 0 && (
                        <button
                          type="button"
                          className={styles.secondarySlotButton}
                          onClick={() => handleCopyPreviousDay(day.dayOfWeek)}
                        >
                          {intl.formatMessage({ id: 'schedule.copyPreviousDay' })}
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.addSlotButton}
                        onClick={() => handleAddSlot(day.dayOfWeek)}
                      >
                        <Plus size={16} />
                        {intl.formatMessage({ id: 'schedule.addSlot' })}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      </Section>

      <Section title={intl.formatMessage({ id: 'schedule.dayOverrides' })}>
        <Card>
          <p className={styles.hintText}>{intl.formatMessage({ id: 'schedule.overrideHint' })}</p>
        </Card>
      </Section>

      <Button fullWidth loading={updateHours.isPending} onClick={handleSave}>
        {intl.formatMessage({ id: 'common.save' })}
      </Button>
    </div>
  );
}
