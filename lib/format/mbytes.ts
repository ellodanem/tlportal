/** Format megabytes for display (base 1024). */
export function formatMegabytes(mb: number | null | undefined, digits = 1): string {
  if (mb == null || Number.isNaN(mb)) return "—";
  if (mb < 1024) return `${mb.toFixed(digits)} MB`;
  return `${(mb / 1024).toFixed(digits)} GB`;
}
