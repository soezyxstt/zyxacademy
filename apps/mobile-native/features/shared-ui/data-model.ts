export function getGridColumnCount(width: number, minItemWidth: number, gap: number, maxColumns: number) {
  return Math.max(1, Math.min(maxColumns, Math.floor((width + gap) / (minItemWidth + gap))));
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
