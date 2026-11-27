import { parityFrame } from "./frame";

export const skeletonCases = [
  { id: "skeleton-line-light", theme: "light", width: 192, height: 16 },
  { id: "skeleton-block-light", theme: "light", width: 256, height: 48 },
  { id: "skeleton-line-dark", theme: "dark", width: 192, height: 16 },
] as const;

export function getSkeletonPosition(width: number, height: number) {
  return {
    position: "absolute",
    left: (parityFrame.width - width) / 2,
    top: (parityFrame.height - height) / 2,
    width,
    height,
  } as const;
}
