export const WEEK_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export interface EditableScheduleDay {
  dayOfWeek: number;
  isDayOff: boolean;
  slots: string[];
}

export function createEmptyWeeklySchedule(): EditableScheduleDay[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    isDayOff: true,
    slots: [],
  }));
}

export function normalizeSlotTimes(times: string[]): string[] {
  return [...new Set(times.filter((time) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(time.trim())).map((time) => time.trim()))].sort(
    (left, right) => left.localeCompare(right),
  );
}
