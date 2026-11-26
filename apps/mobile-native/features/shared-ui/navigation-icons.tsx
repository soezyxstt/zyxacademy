import Svg, { Path } from "react-native-svg";

const paths = {
  back: "m12 19-7-7 7-7M5 12h14",
  home: "m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 21v-7h6v7",
  book: "M12 7v14M3 18V5c4-1 6 0 9 2 3-2 5-3 9-2v13c-4-1-6 0-9 2-3-2-5-3-9-2Z",
  schedule: "M8 2v4m8-4v4M3 10h18M3 6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM8 15h3m3 0h2",
  discuss: "M21 11a8 8 0 0 1-8 8H7l-4 2v-6a8 8 0 0 1 8-12h2a8 8 0 0 1 8 8ZM8 9h8m-8 4h5",
  account: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m12-14a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  classes: "m2 10 10-5 10 5-10 5-10-5Zm4 2v5c3 3 9 3 12 0v-5m4-2v6",
  people: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4m-3-12a4 4 0 0 1 0 8m-3-4a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  ops: "M20 19a9 9 0 1 0-16 0m8-5 4-4M11 14a1 1 0 1 0 2 0 1 1 0 1 0-2 0",
  more: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  search: "M20 20l-4-4m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  notifications: "M18 8a6 6 0 0 0-12 0c0 6-3 7-3 9h18c0-2-3-3-3-9m-8 12a2 2 0 0 0 4 0",
  "ops-ai": "m7 8 3 3-3 3m6 0h4M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  "switch-course": "m8 9 4-4 4 4m-8 6 4 4 4-4",
  chevron: "m6 9 6 6 6-6",
  close: "m6 6 12 12M18 6 6 18",
  check: "m5 12 4 4L19 6",
} as const;

export type NavigationIconName = keyof typeof paths;

export function NavigationIcon({ name, color, size }: { name: NavigationIconName; color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path d={paths[name]} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function BrandSymbol({ color }: { color: string }) {
  // Paths from public/brand/zyx-logo-symbol-color.svg and its reversed variant.
  return (
    <Svg width={34} height={20} viewBox="0 0 370 216" accessible={false}>
      <Path d="M262.25 66.0576L309.5 0H369.5L292.25 108L369.5 216H309.5L268.486 158.661C275.133 144.348 279 126.43 279 104C279 56 293.001 32 302.001 26C274.001 37 270.21 75.5 263.5 92.5C259.39 102.914 253.201 114.236 244.281 124.821L155 0H215L262.25 66.0576Z" fill="#cc542b" />
      <Path d="M139 0L176.75 52.7764L95.0488 167H133C206.5 167 239.65 125.559 252.5 93C259.21 76 273.5 37 301.5 26C292.5 32 278.786 43 270.5 105C256.067 213 172.5 216 114.5 216H0L119.451 49H0V0H139Z" fill={color} />
    </Svg>
  );
}
