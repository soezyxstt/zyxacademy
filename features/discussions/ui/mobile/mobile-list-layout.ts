export function computeMobileListFrameHeight({
  frameTop,
  viewportBottom,
  bottomNavRect,
}: {
  frameTop: number;
  viewportBottom: number;
  bottomNavRect?: { top: number; height: number } | null;
}): number {
  const availableBottom =
    bottomNavRect && bottomNavRect.height > 0
      ? Math.min(viewportBottom, bottomNavRect.top)
      : viewportBottom;
  return Math.max(0, Math.floor(availableBottom - Math.max(0, frameTop)));
}
