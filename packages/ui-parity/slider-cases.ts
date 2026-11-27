import { parityFrame } from "./frame";

const width = 256;
const height = 44;

export const sliderCases = [
  { id: "slider-midpoint-light", theme: "light", label: "Kecepatan animasi", min: 0, max: 2, step: 0.25, value: 1,
    disabled: false, dir: "ltr" },
  { id: "slider-disabled-end-dark", theme: "dark", label: "Volume audio", min: 0, max: 10, step: 1, value: 10,
    disabled: true, dir: "ltr" },
  { id: "slider-start-rtl-light", theme: "light", label: "Posisi bacaan", min: 0, max: 10, step: 1, value: 0,
    disabled: false, dir: "rtl" },
] as const;

export type SliderCaseSpec = (typeof sliderCases)[number];

export const sliderPosition = {
  position: "absolute",
  left: (parityFrame.width - width) / 2,
  top: (parityFrame.height - height) / 2,
  width,
  height,
} as const;
