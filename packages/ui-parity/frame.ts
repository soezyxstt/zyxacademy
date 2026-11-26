export const parityFrame = {
  width: 320,
  height: 100,
  markerColor: "#e000ef",
  markerHeight: 1,
  gap: 8,
} as const;

export function getParityFrameHeight(caseId: string) {
  switch (caseId) {
    case "notification-inbox-empty-light": return 216;
    case "notification-inbox-unread-light": return 168;
    case "notification-inbox-mixed-dark": return 264;
    default: return parityFrame.height;
  }
}
