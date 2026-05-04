export function groszeToZl(grosze: number): string {
  return (grosze / 100).toFixed(2);
}

export function zlToGrosze(input: string): number | null {
  const trimmed = input.trim().replace(',', '.');
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function formatPriceZl(grosze: number | null): string {
  if (grosze == null) return '—';
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
  }).format(grosze / 100);
}

export function formatPurchasedAt(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('pl-PL');
}
