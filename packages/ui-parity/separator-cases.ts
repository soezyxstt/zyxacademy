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
  const { width, height, contentWidth, contentHeight } = separatorFrame;
  const horizontal = orientation === "horizontal";
  return {
    position: "absolute",
    left: horizontal ? (width - contentWidth) / 2 : width / 2,
    top: horizontal ? height / 2 : (height - contentHeight) / 2,
    width: horizontal ? contentWidth : 1,
    height: horizontal ? 1 : contentHeight,
  } as const;
}
