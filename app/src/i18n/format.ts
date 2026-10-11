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
