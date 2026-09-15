const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
  ['second', 1],
];

function formatUnits(totalSeconds: number, locale?: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(totalSeconds);
  for (const [unit, size] of UNITS) {
    if (abs >= size || unit === 'second') {
      const value = Math.round(totalSeconds / size);
      return rtf.format(value, unit);
    }
  }
  return rtf.format(0, 'second');
}

/** "3 minutes ago" / "in 2 hours". Rendered client-side in the visitor's locale. */
export function formatRelative(iso: string, now: Date = new Date(), locale?: string): string {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return '';
  return formatUnits(Math.round((target.getTime() - now.getTime()) / 1000), locale);
}

/** "Expires in 23 hours" / "Never expires" / "Expired". */
export function formatExpiry(expiresAt: string | null, now: Date = new Date(), locale?: string): string {
  if (!expiresAt) return 'Never expires';
  const target = new Date(expiresAt);
  if (Number.isNaN(target.getTime())) return 'Never expires';
  if (target.getTime() <= now.getTime()) return 'Expired';
  return `Expires ${formatUnits(Math.round((target.getTime() - now.getTime()) / 1000), locale)}`;
}

/** Full timestamp for tooltips. */
export function formatAbsolute(iso: string, locale?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
