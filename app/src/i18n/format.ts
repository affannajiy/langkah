import i18n from './index';

// Numbers go through Intl so BM and EN each get their own decimal mark.
function locale(): string {
  return i18n.language === 'ms' ? 'ms-MY' : 'en-MY';
}

// "850 m" under 1 km, then "1.1 km".
export function formatDistance(metres: number): string {
  if (metres < 1000) {
    const m = metres < 100 ? Math.round(metres / 10) * 10 : Math.round(metres / 50) * 50;
    return i18n.t('units.m', { value: new Intl.NumberFormat(locale()).format(Math.max(m, 10)) });
  }
  const km = new Intl.NumberFormat(locale(), { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(metres / 1000);
  return i18n.t('units.km', { value: km });
}

// Whole minutes, at least 1.
export function minutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}

// "Just now", "3 h ago", "2 days ago". Report times in Community.
export function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 60) return i18n.t('time.justNow');
  const hours = Math.round(mins / 60);
  if (hours < 24) return i18n.t('time.hoursAgo', { count: hours });
  return i18n.t('time.daysAgo', { count: Math.round(hours / 24) });
}

// "18 Oct", for expiry dates.
export function shortDate(iso: string): string {
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(new Date(iso));
}

// "1,100" points in either language.
export function formatPoints(points: number): string {
  return new Intl.NumberFormat(locale()).format(points);
}

// "RM10.00".
export function formatRm(rm: number): string {
  return `RM${new Intl.NumberFormat(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rm)}`;
}

// "17 Oct 2026, 8:42 PM", for receipts.
export function dateTime(iso: string): string {
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(
    new Date(iso),
  );
}
