import { parityFrame } from "./frame";

const trackWidth = 256;
const trackHeight = 8;

export const progressCases = [
  { id: "progress-empty-light", theme: "light", value: 0, max: 100, label: "Kemajuan kuis" },
  { id: "progress-partial-dark", theme: "dark", value: 3, max: 8, label: "Kemajuan misi" },
  { id: "progress-full-light", theme: "light", value: 8, max: 8, label: "Kemajuan lencana" },
] as const;

export type ProgressCaseSpec = (typeof progressCases)[number];

export function getProgressPosition() {
  return {
    position: "absolute",
    left: (parityFrame.width - trackWidth) / 2,
    top: (parityFrame.height - trackHeight) / 2,
    width: trackWidth,
    height: trackHeight,
  } as const;
}
