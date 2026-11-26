export function getProgressValue(value: number, max = 100) {
  const upperBound = Number.isFinite(max) && max > 0 ? max : 100;
  const current = Number.isFinite(value) ? Math.min(upperBound, Math.max(0, value)) : 0;
  return { min: 0, max: upperBound, now: current, percent: (current / upperBound) * 100 };
}

export function getIntegerProgressRange({ min, max, now, percent }: ReturnType<typeof getProgressValue>) {
  // React Native's Android accessibility range uses signed 32-bit integers.
  if (Number.isInteger(max) && Number.isInteger(now) && max <= 2_147_483_647) {
    return { min, max, now };
  }
  return { min, max: 100, now: Math.round(percent) };
}
