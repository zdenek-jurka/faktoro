export function normalizeAppLockPinInput(value: string): string {
  return value.replace(/\D+/g, '').slice(0, 10);
}
