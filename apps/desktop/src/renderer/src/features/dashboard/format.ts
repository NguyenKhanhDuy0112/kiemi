/** `null` → em dash; otherwise whole percent. */
export const formatPercent = (rate: number | null): string =>
  rate === null ? '—' : `${Math.round(rate * 100)}%`;

export const formatWhen = (at: number): string => {
  const x = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${x.getFullYear()} ${p(x.getHours())}:${p(x.getMinutes())}`;
};

/** Colour classes by pass rate: ≥90% good, ≥70% warning, below bad. */
export function rateTone(rate: number | null): { text: string; bar: string } {
  if (rate === null) return { text: 'text-muted-foreground', bar: 'bg-muted' };
  if (rate >= 0.9) return { text: 'text-green-600', bar: 'bg-green-500' };
  if (rate >= 0.7) return { text: 'text-amber-600', bar: 'bg-amber-500' };
  return { text: 'text-red-600', bar: 'bg-red-500' };
}
