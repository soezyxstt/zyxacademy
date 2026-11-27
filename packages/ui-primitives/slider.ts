export type SliderRange = Readonly<{ min: number; max: number; step: number }>;

export function getSliderRange(min: number, max: number, step: number): SliderRange {
  const lower = Number.isFinite(min) ? min : 0;
  const upper = Number.isFinite(max - lower) ? Math.max(lower, max) : lower;
  return { min: lower, max: upper, step: Number.isFinite(step) && step > 0 ? step : 1 };
}

export function clampSliderValue(value: number, { min, max }: SliderRange) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}

export function snapSliderValue(value: number, range: SliderRange) {
  const { min, step } = range;
  const [coefficient, exponent = "0"] = String(step).split("e");
  const precision = Math.max(0, (coefficient.split(".")[1]?.length ?? 0) - Number(exponent));
  const factor = 10 ** Math.min(precision, 308);
  const stepped = Math.round((clampSliderValue(value, range) - min) / step) * step + min;
  const scaled = stepped * factor;
  return clampSliderValue(Number.isFinite(scaled) ? Math.round(scaled) / factor : stepped, range);
}

export function sliderStartsAtRight(direction: "ltr" | "rtl", inverted: boolean) {
  return (direction === "rtl") !== inverted;
}

export function sliderValueAtOffset(offset: number, width: number, range: SliderRange, fromRight: boolean) {
  if (!(width > 0)) return range.min;
  const fraction = Math.max(0, Math.min(1, offset / width));
  return snapSliderValue(range.min + (range.max - range.min) * (fromRight ? 1 - fraction : fraction), range);
}

export function sliderGeometry(value: number, width: number, thumbWidth: number, range: SliderRange, fromRight: boolean) {
  const fraction = range.max === range.min ? 0 : (clampSliderValue(value, range) - range.min) / (range.max - range.min);
  const offset = fromRight ? 1 - fraction : fraction;
  return {
    fillStart: fromRight ? width * offset : 0,
    fillWidth: width * fraction,
    thumbStart: offset * Math.max(0, width - thumbWidth),
  };
}
