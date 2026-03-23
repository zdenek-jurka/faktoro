type SeriesConfig = {
  pattern?: string | null;
  fallbackPattern?: string | null;
  prefix?: string | null;
  nextNumber?: number | string | null;
  padding?: number | string | null;
  perDevice?: boolean | null;
  deviceCode?: string | null;
  syncDeviceName?: string | null;
  syncDeviceId?: string | null;
  fallbackPrefix: string;
};

export function sanitizeSeriesPart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '')
    .toUpperCase();
}

export function getSeriesPaddingFromPattern({
  pattern,
  fallbackPattern,
  defaultPadding = 4,
}: {
  pattern?: string | null;
  fallbackPattern?: string | null;
  defaultPadding?: number;
}): number {
  const source = pattern?.trim() || fallbackPattern?.trim() || '';
  const hashMatch = source.match(/#+/);
  const derivedPadding = hashMatch?.[0]?.length ?? defaultPadding;
  return Math.min(8, Math.max(1, Math.floor(derivedPadding)));
}

export function buildSeriesIdentifier(config: SeriesConfig): string {
  const nextNumberRaw = Number(config.nextNumber);
  const paddingRaw = Number(config.padding);
  const nextNumber = Number.isFinite(nextNumberRaw) ? Math.max(1, Math.floor(nextNumberRaw)) : 1;
  const padding = Number.isFinite(paddingRaw)
    ? Math.min(8, Math.max(1, Math.floor(paddingRaw)))
    : 4;

  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');

  let deviceToken = '';
  if (config.perDevice) {
    const source =
      config.deviceCode?.trim() ||
      config.syncDeviceName?.trim() ||
      config.syncDeviceId?.slice(-4) ||
      'DEV';
    deviceToken = sanitizeSeriesPart(source) || 'DEV';
  }

  const pattern = config.pattern?.trim() || config.fallbackPattern?.trim();
  if (pattern) {
    let result = pattern;
    result = result.replaceAll('YYYY', yyyy).replaceAll('YY', yy);
    result = result.replaceAll('MM', mm).replaceAll('DD', dd);
    result = result.replaceAll('DEV', config.perDevice ? deviceToken : '');

    const hashMatch = result.match(/#+/);
    if (hashMatch) {
      const hashMask = hashMatch[0];
      const maskedNumber = String(nextNumber).padStart(hashMask.length, '0');
      result = result.replace(hashMask, maskedNumber);
    }

    return result;
  }

  const prefix = sanitizeSeriesPart(config.prefix?.trim() || config.fallbackPrefix);
  const safePrefix = prefix || config.fallbackPrefix;
  const numericPart = String(nextNumber).padStart(padding, '0');
  const devicePart = config.perDevice && deviceToken ? `-${deviceToken}` : '';
  return `${safePrefix}${devicePart}-${numericPart}`;
}
