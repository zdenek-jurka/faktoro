export function escapeHtml(value?: string | number): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatDate(value: number | undefined, locale: string): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString(locale);
}
