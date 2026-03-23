export function isPlausibleEmail(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLowerCase() ?? '';
  if (!normalized) return false;

  // Practical UI-level validation for form gating. We only want to reject clearly incomplete
  // addresses like `name@` or `name@example`, not enforce full RFC compliance here.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}
