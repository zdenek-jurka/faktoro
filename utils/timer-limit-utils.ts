export type TimerLimitMode = 'default' | 'custom' | 'disabled';

export const DEFAULT_TIMER_SOFT_LIMIT_MINUTES = 8 * 60;
export const DEFAULT_TIMER_HARD_LIMIT_MINUTES = 10 * 60;

const MIN_TIMER_LIMIT_MINUTES = 1;
const MAX_TIMER_LIMIT_MINUTES = 24 * 60;

export function sanitizeTimerLimitMinutes(value?: number | null): number | undefined {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return undefined;
  }

  const normalized = Math.floor(value);
  if (normalized < MIN_TIMER_LIMIT_MINUTES || normalized > MAX_TIMER_LIMIT_MINUTES) {
    return undefined;
  }

  return normalized;
}

export function parseTimerLimitHoursInput(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const timeMatch = trimmed.match(/^(\d{1,2}):(\d{1,2})$/);
  if (timeMatch) {
    const hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes < 0 || minutes >= 60) {
      return undefined;
    }

    return sanitizeTimerLimitMinutes(hours * 60 + minutes);
  }

  const normalizedDecimal = trimmed.replace(',', '.');
  const parsed = Number(normalizedDecimal);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return sanitizeTimerLimitMinutes(Math.round(parsed * 60));
}

export function formatTimerLimitHours(minutes?: number | null): string {
  const sanitized = sanitizeTimerLimitMinutes(minutes);
  if (!sanitized) {
    return '';
  }

  const hours = Math.floor(sanitized / 60);
  const remainder = sanitized % 60;
  return `${hours}:${String(remainder).padStart(2, '0')}`;
}

export function normalizeTimerLimitMode(value?: string | null): TimerLimitMode {
  if (value === 'custom' || value === 'disabled') {
    return value;
  }

  return 'default';
}

export function validateTimerLimitOrder(input: {
  softLimitMinutes?: number;
  hardLimitMinutes?: number;
}): boolean {
  const soft = sanitizeTimerLimitMinutes(input.softLimitMinutes);
  const hard = sanitizeTimerLimitMinutes(input.hardLimitMinutes);

  if (!soft || !hard) {
    return true;
  }

  return hard > soft;
}
