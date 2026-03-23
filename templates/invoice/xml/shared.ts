export function escapeXml(value?: string | number): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function isoDateFromMs(ms?: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
