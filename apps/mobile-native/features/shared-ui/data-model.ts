export const defaultGridGap = 12;

// Container queries in the Student document list, in dp at the default text scale.
const documentGridBreakpoints = [464, 704, 944, 1184];

export function getGridColumnCount(
  width: number,
  fontScale: number,
  { minItemWidth, gap, maxColumns = 5 }: { minItemWidth?: number; gap?: number; maxColumns?: number } = {},
) {
  const scale = Math.max(1, fontScale);
  const itemGap = gap ?? defaultGridGap;
  const columns = minItemWidth === undefined && gap === undefined
    ? 1 + documentGridBreakpoints.filter((breakpoint) => width >= breakpoint * scale).length
    : Math.floor((width + itemGap) / ((minItemWidth ?? 228) * scale + itemGap));
  return Math.max(1, Math.min(maxColumns, columns));
}

export function getPaginationState(page: number, pageCount: number, pending: boolean) {
  const count = Number.isFinite(pageCount) ? Math.max(0, Math.trunc(pageCount)) : 0;
  const requested = Number.isFinite(page) ? Math.trunc(page) : 1;
  const current = Math.min(count, Math.max(1, requested));

  return {
    current,
    count,
    previous: !pending && current > 1 ? current - 1 : null,
    next: !pending && current < count ? current + 1 : null,
  };
}
