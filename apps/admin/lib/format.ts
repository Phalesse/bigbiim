export function formatMinorAmount(amount: number | string | null | undefined, currency: string) {
  if (amount === null || amount === undefined || amount === '') return '—';
  const minorUnits = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isSafeInteger(minorUnits)) return `${amount} ${currency} (unités mineures)`;
  try {
    const digits = new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      maximumFractionDigits: digits,
    }).format(minorUnits / 10 ** digits);
  } catch {
    return `${amount} ${currency} (unités mineures)`;
  }
}
