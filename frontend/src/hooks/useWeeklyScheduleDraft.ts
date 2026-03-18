import { useCallback, useState } from 'react';
import type { ScheduleDay } from '@/types';
import { createEmptyWeeklySchedule, getNextSlotTime, normalizeSlotTimes } from '@/lib/schedule';

function cloneDays(days: ScheduleDay[]): ScheduleDay[] {
  return days.map((day) => ({ ...day, slots: [...day.slots] }));
}

export function useWeeklyScheduleDraft(initialDays: ScheduleDay[] = createEmptyWeeklySchedule()) {
  const [draft, setDraft] = useState<ScheduleDay[]>(cloneDays(initialDays));

  const replaceDraft = useCallback((days: ScheduleDay[]) => {
    setDraft(cloneDays(days));
  }, []);

  const updateDay = useCallback((dayOfWeek: number, updater: (day: ScheduleDay) => ScheduleDay) => {
    setDraft((previous) =>
      previous.map((day) => (day.dayOfWeek === dayOfWeek ? updater(day) : day)),
    );
  }, []);

  const toggleDay = useCallback(
    (dayOfWeek: number) => {
      updateDay(dayOfWeek, (day) => {
        if (day.isDayOff) {
          return {
            ...day,
            isDayOff: false,
            slots: day.slots.length > 0 ? day.slots : ['09:00'],
          };
        }

        return { ...day, isDayOff: true, slots: [] };
      });
    },
    [updateDay],
  );

  const addSlot = useCallback(
    (dayOfWeek: number) => {
      updateDay(dayOfWeek, (day) => ({
        ...day,
        isDayOff: false,
        slots: [...day.slots, getNextSlotTime(day.slots)],
      }));
    },
    [updateDay],
  );

  const copyPreviousDay = useCallback((dayOfWeek: number) => {
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
  }, []);

  const changeSlot = useCallback(
    (dayOfWeek: number, index: number, value: string) => {
      updateDay(dayOfWeek, (day) => ({
        ...day,
        slots: day.slots.map((slot, slotIndex) => (slotIndex === index ? value : slot)),
      }));
    },
    [updateDay],
  );

  const removeSlot = useCallback(
    (dayOfWeek: number, index: number) => {
      updateDay(dayOfWeek, (day) => {
        const nextSlots = day.slots.filter((_, slotIndex) => slotIndex !== index);
        return {
          ...day,
          slots: nextSlots,
          isDayOff: nextSlots.length === 0,
        };
      });
    },
    [updateDay],
  );

  const serializeDays = useCallback(
    () =>
      draft.map((day) => {
        const normalizedSlots = day.isDayOff ? [] : normalizeSlotTimes(day.slots);
        return {
          ...day,
          slots: normalizedSlots,
          isDayOff: day.isDayOff || normalizedSlots.length === 0,
        };
      }),
    [draft],
  );

  return {
    draft,
    replaceDraft,
    toggleDay,
    addSlot,
    copyPreviousDay,
    changeSlot,
    removeSlot,
    serializeDays,
  } as const;
}
