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

function isValidSlotTime(time: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time.trim());
}

function timeToMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (normalized % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function normalizeSlotTimes(times: string[]): string[] {
  return [
    ...new Set(times.filter((time) => isValidSlotTime(time)).map((time) => time.trim())),
  ].sort((left, right) => left.localeCompare(right));
}

export function getNextSlotTime(times: string[], fallback = '09:00', stepMinutes = 30): string {
  const normalized = normalizeSlotTimes(times);
  if (normalized.length === 0) {
    return fallback;
  }

  const usedTimes = new Set(normalized);
  let candidateMinutes = timeToMinutes(normalized[normalized.length - 1]!) + stepMinutes;
  const maxAttempts = Math.max(Math.floor(1440 / Math.max(stepMinutes, 1)), 1);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = minutesToTime(candidateMinutes);
    if (!usedTimes.has(candidate)) {
      return candidate;
    }
    candidateMinutes += stepMinutes;
  }

  return fallback;
}
