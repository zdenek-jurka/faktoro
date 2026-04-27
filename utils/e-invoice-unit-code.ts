const UNIT_CODE_BY_LOCAL_UNIT: Record<string, string> = {
  custom: 'C62',
  day: 'DAY',
  d: 'DAY',
  h: 'HUR',
  hour: 'HUR',
  hours: 'HUR',
  manday: 'DAY',
  'man-day': 'DAY',
  md: 'DAY',
  piece: 'H87',
  pieces: 'H87',
  project: 'C62',
  unit: 'C62',
};

export function resolveUneceUnitCode(unit?: string | null): string | null {
  const normalized = (unit || '').trim();
  if (!normalized) return null;

  const directCode = normalized.toUpperCase();
  if (/^[A-Z0-9]{2,3}$/.test(directCode)) {
    return directCode;
  }

  return UNIT_CODE_BY_LOCAL_UNIT[normalized.toLowerCase()] || null;
}
