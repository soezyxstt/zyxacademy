export function visibleNavigationTabs(
  widths: readonly number[],
  availableWidth: number,
  moreWidth: number,
  gap: number,
): number {
  const totalWidth = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * gap;
  if (totalWidth <= availableWidth) return widths.length;

  let used = moreWidth;
  let visible = 0;
  for (const width of widths) {
    if (used + width + gap > availableWidth) break;
    used += width + gap;
    visible++;
  }
  return visible;
}
