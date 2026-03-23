import { ClientModel } from '@/model';

function isValidBillingInterval(minutes: number | null | undefined): minutes is number {
  return typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0;
}

export function parseBillingIntervalMinutesInput(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return undefined;

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;
  return parsed;
}

export function sanitizeBillingIntervalMinutes(
  minutes: number | null | undefined,
): number | undefined {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return undefined;
  return Math.max(1, Math.floor(minutes));
}

export function getEffectiveBillingIntervalMinutes(
  client: ClientModel | undefined,
  defaultBillingInterval?: number | null,
): number | undefined {
  if (client?.billingIntervalEnabled && isValidBillingInterval(client.billingIntervalMinutes)) {
    return client.billingIntervalMinutes;
  }

  if (isValidBillingInterval(defaultBillingInterval)) {
    return defaultBillingInterval;
  }

  return undefined;
}

export function hasEffectiveBillingInterval(
  client: ClientModel | undefined,
  defaultBillingInterval?: number | null,
): boolean {
  return getEffectiveBillingIntervalMinutes(client, defaultBillingInterval) !== undefined;
}

/**
 * Rounds up time in seconds according to the effective billing interval.
 * Client-specific settings take precedence over the app default.
 * @param seconds - Time in seconds
 * @param client - Client with optional billing interval override
 * @param defaultBillingInterval - App-level default billing interval in minutes
 * @returns Rounded time in seconds
 */
export function roundTimeByInterval(
  seconds: number,
  client: ClientModel | undefined,
  defaultBillingInterval?: number | null,
): number {
  const intervalMinutes = getEffectiveBillingIntervalMinutes(client, defaultBillingInterval);
  if (!intervalMinutes) {
    return seconds;
  }

  const intervalSeconds = intervalMinutes * 60;
  return Math.ceil(seconds / intervalSeconds) * intervalSeconds;
}

/**
 * Calculates total billable time for multiple time entries
 * @param entries - Array of {duration: number, clientId: string}
 * @param clients - Map of client ID to ClientModel
 * @returns Total billable time in seconds
 */
export function calculateBillableTime(
  entries: Array<{ duration: number; clientId: string }>,
  clients: Map<string, ClientModel>,
  defaultBillingInterval?: number | null,
): number {
  return entries.reduce((total, entry) => {
    const client = clients.get(entry.clientId);
    const roundedTime = roundTimeByInterval(entry.duration, client, defaultBillingInterval);
    return total + roundedTime;
  }, 0);
}
