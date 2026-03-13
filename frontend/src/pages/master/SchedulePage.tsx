import { useState, useRef, useCallback } from 'react';
import { useIntl } from 'react-intl';
import { Trash2 } from 'lucide-react';
import { useSchedule, useUpdateWorkingHours, useCreateOverride, useDeleteOverride } from '@/hooks';
import {
  Card,
  Button,
  Input,
  BottomSheet,
  SkeletonList,
  PageHeader,
  Section,
  Toggle,
  FormGroup,
} from '@/components/ui';
import { getTelegram } from '@/lib/telegram';
import type { WorkingHours, CreateOverrideDto } from '@/types';
import styles from './SchedulePage.module.css';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export function SchedulePage() {
  const intl = useIntl();
  const { data: schedule, isLoading } = useSchedule();
  const updateHours = useUpdateWorkingHours();
  const createOverride = useCreateOverride();
  const deleteOverride = useDeleteOverride();

  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [overrideDate, setOverrideDate] = useState('');
  const [overrideIsDayOff, setOverrideIsDayOff] = useState(true);
  const [overrideStart, setOverrideStart] = useState('09:00');
  const [overrideEnd, setOverrideEnd] = useState('18:00');

  const handleToggleDay = (dayOfWeek: number, hours: WorkingHours | undefined) => {
    getTelegram()?.HapticFeedback.selectionChanged();
    if (hours?.isWorking) {
      updateHours.mutate({
        dayOfWeek,
        isWorking: false,
        startTime: hours.startTime,
        endTime: hours.endTime,
      });
    } else {
      updateHours.mutate({
        dayOfWeek,
        isWorking: true,
        startTime: hours?.startTime || '09:00',
        endTime: hours?.endTime || '18:00',
      });
    }
  };

  const timeChangeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleTimeChange = useCallback(
    (dayOfWeek: number, field: 'startTime' | 'endTime', value: string) => {
      const key = `${dayOfWeek}-${field}`;
      if (timeChangeTimers.current[key]) {
        clearTimeout(timeChangeTimers.current[key]);
      }
      timeChangeTimers.current[key] = setTimeout(() => {
        const existing = schedule?.hours?.find((h: WorkingHours) => h.dayOfWeek === dayOfWeek);
        updateHours.mutate({
          dayOfWeek,
          isWorking: true,
          startTime: field === 'startTime' ? value : existing?.startTime || '09:00',
          endTime: field === 'endTime' ? value : existing?.endTime || '18:00',
        });
      }, 600);
    },
    [schedule, updateHours],
  );

  const handleAddOverride = () => {
    const dto: CreateOverrideDto = {
      date: overrideDate,
      isDayOff: overrideIsDayOff,
      ...(overrideIsDayOff ? {} : { startTime: overrideStart, endTime: overrideEnd }),
    };
    createOverride.mutate(dto, {
      onSuccess: () => {
        setShowOverrideForm(false);
        setOverrideDate('');
      },
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

      <Section title={intl.formatMessage({ id: 'schedule.workingHours' })}>
        <Card padding="none">
          {DAY_KEYS.map((dayKey, index) => {
            const hours = schedule?.hours?.find((h: WorkingHours) => h.dayOfWeek === index);
            const isWorking = hours?.isWorking ?? false;

            return (
              <div key={dayKey} className={styles.dayRow}>
                <div className={styles.dayInfo}>
                  <span className={styles.dayName}>
                    {intl.formatMessage({ id: `schedule.${dayKey}` })}
                  </span>
                  <Toggle checked={isWorking} onChange={() => handleToggleDay(index, hours)} />
                </div>
                {isWorking && (
                  <div className={styles.timeInputs}>
                    <input
                      type="time"
                      className={styles.timeInput}
                      value={hours?.startTime || '09:00'}
                      onChange={(e) => handleTimeChange(index, 'startTime', e.target.value)}
                    />
                    <span className={styles.timeSep}>—</span>
                    <input
                      type="time"
                      className={styles.timeInput}
                      value={hours?.endTime || '18:00'}
                      onChange={(e) => handleTimeChange(index, 'endTime', e.target.value)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      </Section>

      <Section
        title={intl.formatMessage({ id: 'schedule.overrides' })}
        action={
          <Button size="sm" variant="secondary" onClick={() => setShowOverrideForm(true)}>
            + {intl.formatMessage({ id: 'common.add' })}
          </Button>
        }
      >
        {schedule?.overrides && schedule.overrides.length > 0 ? (
          schedule.overrides.map((override) => (
            <Card key={override.id} className={styles.overrideCard}>
              <div className={styles.overrideRow}>
                <div>
                  <div className={styles.overrideDate}>{override.date}</div>
                  <div className={styles.overrideMeta}>
                    {override.isDayOff
                      ? intl.formatMessage({ id: 'schedule.dayOff' })
                      : `${override.startTime} — ${override.endTime}`}
                  </div>
                </div>
                <button
                  className="touchable"
                  onClick={() => deleteOverride.mutate(override.id)}
                  aria-label={intl.formatMessage({ id: 'common.delete' })}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </Card>
          ))
        ) : (
          <p className={styles.emptyText}>{intl.formatMessage({ id: 'schedule.noOverrides' })}</p>
        )}
      </Section>

      <BottomSheet
        open={showOverrideForm}
        onClose={() => setShowOverrideForm(false)}
        title={intl.formatMessage({ id: 'schedule.addOverride' })}
      >
        <FormGroup>
          <Input
            label={intl.formatMessage({ id: 'schedule.date' })}
            type="date"
            value={overrideDate}
            onChange={(e) => setOverrideDate(e.target.value)}
          />
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={overrideIsDayOff}
              onChange={(e) => setOverrideIsDayOff(e.target.checked)}
            />
            <span>{intl.formatMessage({ id: 'schedule.dayOff' })}</span>
          </label>
          {!overrideIsDayOff && (
            <div className={styles.timeRow}>
              <Input
                label={intl.formatMessage({ id: 'schedule.startTime' })}
                type="time"
                value={overrideStart}
                onChange={(e) => setOverrideStart(e.target.value)}
              />
              <Input
                label={intl.formatMessage({ id: 'schedule.endTime' })}
                type="time"
                value={overrideEnd}
                onChange={(e) => setOverrideEnd(e.target.value)}
              />
            </div>
          )}
          <Button
            fullWidth
            loading={createOverride.isPending}
            onClick={handleAddOverride}
            disabled={!overrideDate}
          >
            {intl.formatMessage({ id: 'common.save' })}
          </Button>
        </FormGroup>
      </BottomSheet>
    </div>
  );
}
