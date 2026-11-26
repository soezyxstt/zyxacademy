export const separatorFrame = {
  width: 320,
  height: 100,
  contentWidth: 256,
  contentHeight: 60,
  markerColor: "#e000ef",
  markerHeight: 1,
  gap: 8,
} as const;

export const separatorCases = [
  { id: "separator-horizontal-light", orientation: "horizontal", theme: "light" },
  { id: "separator-vertical-light", orientation: "vertical", theme: "light" },
  { id: "separator-horizontal-dark", orientation: "horizontal", theme: "dark" },
] as const;

export function getSeparatorPosition(orientation: "horizontal" | "vertical") {
  const horizontal = orientation === "horizontal";
  return {
    position: "absolute",
    left: horizontal ? (separatorFrame.width - separatorFrame.contentWidth) / 2 : separatorFrame.width / 2,
    top: horizontal ? separatorFrame.height / 2 : (separatorFrame.height - separatorFrame.contentHeight) / 2,
    width: horizontal ? separatorFrame.contentWidth : 1,
    height: horizontal ? 1 : separatorFrame.contentHeight,
  } as const;
}
