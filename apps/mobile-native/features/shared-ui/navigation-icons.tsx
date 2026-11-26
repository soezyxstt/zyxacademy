import Svg, { Path, Rect } from "react-native-svg";

const paths = {
  back: "m12 19-7-7 7-7M5 12h14",
  home: "m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 21v-7h6v7",
  book: "M12 7v14M3 18V5c4-1 6 0 9 2 3-2 5-3 9-2v13c-4-1-6 0-9 2-3-2-5-3-9-2Z",
  schedule: "M8 2v4m8-4v4M3 10h18M3 6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM8 15h3m3 0h2",
  // MessageSquareText, used in the Student and Tutor web destinations.
  discuss: "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2zM7 11h10M7 15h6M7 7h8",
  account: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m12-14a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  classes: "m2 10 10-5 10 5-10 5-10-5Zm4 2v5c3 3 9 3 12 0v-5m4-2v6",
  people: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4m-3-12a4 4 0 0 1 0 8m-3-4a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  ops: "m12 14 4-4M3.34 19a10 10 0 1 1 17.32 0",
  search: "M20 20l-4-4m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  notifications: "M18 8a6 6 0 0 0-12 0c0 6-3 7-3 9h18c0-2-3-3-3-9m-8 12a2 2 0 0 0 4 0",
  "ops-ai": "m7 8 3 3-3 3m6 0h4M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  "switch-course": "m7 15 5 5 5-5m-10-6 5-5 5 5",
  chevron: "m6 9 6 6 6-6",
  close: "m6 6 12 12M18 6 6 18",
  send: "m22 2-7 20-4-9-9-4zM22 2 11 13",
  lock: "M7 11V7a5 5 0 0 1 10 0v4M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Zm7 4v3",
  "chevron-right": "m9 18 6-6-6-6",
  "arrow-right": "M5 12h14m-7-7 7 7-7 7",
  "arrow-up-right": "M7 17 17 7M7 7h10v10",
  sliders: "M3 6h10m4 0h4M13 3v6M3 12h4m4 0h10M7 9v6M3 18h12m4 0h2M15 15v6",
  flame: "M12 22c4.42 0 8-3.58 8-8 0-4-2.5-7-5.5-9 .5 3-1 5-2.5 6C12 7 10 4 7 2c1 4-1 7-2 9-1 2-1 3-1 4a8 8 0 0 0 8 7Z",
  layers: "m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5",
  clipboard: "M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3M10 2h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM8 11h.01M12 11h4M8 16h.01M12 16h4",
  target: "M22 12a10 10 0 1 1-20 0 10 10 0 1 1 20 0ZM18 12a6 6 0 1 1-12 0 6 6 0 1 1 12 0ZM14 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0Z",
  "circle-check": "M22 12a10 10 0 1 1-20 0 10 10 0 1 1 20 0ZM8 12l3 3 5-6",
  key: "M15 7h.01M21 8a5 5 0 0 1-6.8 4.67L7 20H3v-4l7.3-7.2A5 5 0 1 1 21 8Z",
  check: "m5 12 4 4L19 6",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 13h8m-8 4h8",
  video: "M16 10l4.5-3a1 1 0 0 1 1.5.8v8.4a1 1 0 0 1-1.5.8L16 14M4 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z",
  "list-checks": "m3 6 2 2 4-4m2 3h10M3 15l2 2 4-4m2 3h10",
  terminal: "m4 17 6-5-6-5m8 12h8",
  compass: "M22 12a10 10 0 1 1-20 0 10 10 0 1 1 20 0Zm-6-4-2 6-6 2 2-6Z",
  "trending-up": "m3 17 6-6 4 4 8-8m-6 0h6v6",
  trophy: "M8 21h8m-4-5v5M7 4h10v6a5 5 0 0 1-10 0V4Zm0 3H3v2a4 4 0 0 0 4 4m10-6h4v2a4 4 0 0 1-4 4",
  award: "M19 9a7 7 0 1 1-14 0 7 7 0 0 1 14 0ZM8 15l-2 7 6-3 6 3-2-7",
  radio: "M5 5a10 10 0 0 0 0 14m14 0a10 10 0 0 0 0-14M8 8a6 6 0 0 0 0 8m8 0a6 6 0 0 0 0-8m-2 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
} as const;

// LayoutDashboard and LayoutGrid, used in the Admin web navigation.
const rectangles = {
  dashboard: [[3, 3, 7, 9], [14, 3, 7, 5], [14, 12, 7, 9], [3, 16, 7, 5]],
  more: [[3, 3, 7, 7], [14, 3, 7, 7], [14, 14, 7, 7], [3, 14, 7, 7]],
} as const;

export type NavigationIconName = keyof typeof paths | keyof typeof rectangles;

export function NavigationIcon({ name, color, size }: { name: NavigationIconName; color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}
      fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {name === "dashboard" || name === "more"
        ? rectangles[name].map(([x, y, width, height]) => (
          <Rect key={`${x}-${y}`} x={x} y={y} width={width} height={height} rx={1} />
        ))
        : <Path d={paths[name]} />}
    </Svg>
  );
}

export function BrandSymbol({ color, width = 34, height = 20 }: { color: string; width?: number; height?: number }) {
  // Paths from public/brand/zyx-logo-symbol-color.svg and its reversed variant.
  return (
    <Svg width={width} height={height} viewBox="0 0 370 216" accessible={false}>
      <Path d="M262.25 66.0576L309.5 0H369.5L292.25 108L369.5 216H309.5L268.486 158.661C275.133 144.348 279 126.43 279 104C279 56 293.001 32 302.001 26C274.001 37 270.21 75.5 263.5 92.5C259.39 102.914 253.201 114.236 244.281 124.821L155 0H215L262.25 66.0576Z" fill="#cc542b" />
      <Path d="M139 0L176.75 52.7764L95.0488 167H133C206.5 167 239.65 125.559 252.5 93C259.21 76 273.5 37 301.5 26C292.5 32 278.786 43 270.5 105C256.067 213 172.5 216 114.5 216H0L119.451 49H0V0H139Z" fill={color} />
    </Svg>
  );
}
