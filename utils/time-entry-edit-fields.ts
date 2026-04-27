import { toLocalISODate } from '@/utils/iso-date';

export type TimeEntryRateSource = 'price_list' | 'manual';

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

export function formatTimeEntryDateInput(timestamp: number): string {
  return toLocalISODate(timestamp);
}

export function formatTimeEntryTimeInput(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function formatDurationMinutesInput(seconds?: number): string {
  if (!seconds || seconds <= 0) return '';
  const minutes = seconds / 60;
  if (Number.isInteger(minutes)) return String(minutes);
  return String(Number(minutes.toFixed(2)));
}

export function formatRateInput(rate?: number): string {
  if (rate == null || !Number.isFinite(rate)) return '';
  if (Number.isInteger(rate)) return String(rate);
  return String(Number(rate.toFixed(2)));
}

export function parseDateTimeInput(dateValue: string, timeValue: string): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeValue.trim());
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  const parsed = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day ||
    parsed.getHours() !== hours ||
    parsed.getMinutes() !== minutes
  ) {
    return null;
  }

  return parsed.getTime();
}

export function parseDurationSecondsInput(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;
  const minutes = Number(normalized);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.round(minutes * 60);
}

export function parseRateInput(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;
  const rate = Number(normalized);
  if (!Number.isFinite(rate) || rate < 0) return null;
  return rate;
}
