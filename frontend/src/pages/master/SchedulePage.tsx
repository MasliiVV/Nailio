import { useEffect } from 'react';
import { useIntl } from 'react-intl';
import { Plus, Trash2 } from 'lucide-react';
import { useSchedule, useUpdateWorkingHours, useWeeklyScheduleDraft } from '@/hooks';
import { Card, Button, SkeletonList, Section, PageHeader, Toggle } from '@/components/ui';
import { getTelegram } from '@/lib/telegram';
import type { ScheduleDay } from '@/types';
import { WEEK_DAY_KEYS } from '@/lib/schedule';
import styles from './SchedulePage.module.css';

export function SchedulePage() {
  const intl = useIntl();
  const { data: schedule, isLoading } = useSchedule();
  const updateHours = useUpdateWorkingHours();
  const {
    draft,
    replaceDraft,
    toggleDay,
    addSlot,
    copyPreviousDay,
    changeSlot,
    removeSlot,
    serializeDays,
  } = useWeeklyScheduleDraft();

  useEffect(() => {
    if (schedule?.weekly?.length) {
      replaceDraft(schedule.weekly);
    }
  }, [replaceDraft, schedule]);

  const handleToggleDay = (dayOfWeek: number) => {
    getTelegram()?.HapticFeedback.selectionChanged();
    toggleDay(dayOfWeek);
  };

  const handleAddSlot = (dayOfWeek: number) => {
    addSlot(dayOfWeek);
  };

  const handleCopyPreviousDay = (dayOfWeek: number) => {
    copyPreviousDay(dayOfWeek);
    getTelegram()?.HapticFeedback.selectionChanged();
  };

  const handleSlotChange = (dayOfWeek: number, index: number, value: string) => {
    changeSlot(dayOfWeek, index, value);
  };

  const handleRemoveSlot = (dayOfWeek: number, index: number) => {
    removeSlot(dayOfWeek, index);
  };

  const handleSave = () => {
    updateHours.mutate(
      {
        days: serializeDays(),
      },
      {
        onSuccess: () => {
          const message = intl.formatMessage({ id: 'schedule.saved' });
          const tg = getTelegram();
          try {
            tg?.showAlert(message);
          } catch {
            window.alert(message);
          }
        },
      },
    );
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
            const day: ScheduleDay = draft[index]!;

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
