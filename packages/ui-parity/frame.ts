export const parityFrame = {
  width: 320,
  height: 100,
  markerColor: "#e000ef",
  markerHeight: 1,
  gap: 8,
} as const;

export function getParityFrameHeight(component: string) {
  return component === "notification-inbox" ? 216 : parityFrame.height;
}
