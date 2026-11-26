export function courseScrollOffsetForMount(offset: number, androidDensity?: number): number {
  if (androidDensity === undefined || androidDensity === 1 || offset === 0) return offset;

  // Android's contentOffset prop truncates the DIP-to-pixel conversion. Aim
  // inside the saved pixel so Float32 rounding cannot send it one pixel back.
  const pixel = Math.round(offset * androidDensity);
  return (pixel + 0.25) / androidDensity;
}
