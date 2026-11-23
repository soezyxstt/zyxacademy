export function computeMobileListFrameHeight({
  frameTop,
  viewportBottom,
  bottomNavRect,
  minHeight = 120,
}: {
  frameTop: number;
  viewportBottom: number;
  bottomNavRect?: { top: number; height: number } | null;
  minHeight?: number;
}): number {
  const availableBottom =
    bottomNavRect && bottomNavRect.height > 0
      ? Math.min(viewportBottom, bottomNavRect.top)
      : viewportBottom;
  return Math.max(minHeight, Math.floor(availableBottom - Math.max(0, frameTop)));
}
