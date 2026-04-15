export const APP_LOCK_GRACE_PERIOD_OPTIONS = [0, 15, 30, 60, 300] as const;

export type AppLockGracePeriodSeconds = (typeof APP_LOCK_GRACE_PERIOD_OPTIONS)[number];

export const DEFAULT_APP_LOCK_GRACE_PERIOD_SECONDS: AppLockGracePeriodSeconds = 30;

export function sanitizeAppLockGracePeriodSeconds(
  value?: number | null,
): AppLockGracePeriodSeconds {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_APP_LOCK_GRACE_PERIOD_SECONDS;
  }

  const normalized = Math.max(0, Math.floor(value));
  if ((APP_LOCK_GRACE_PERIOD_OPTIONS as readonly number[]).includes(normalized)) {
    return normalized as AppLockGracePeriodSeconds;
  }

  return DEFAULT_APP_LOCK_GRACE_PERIOD_SECONDS;
}
