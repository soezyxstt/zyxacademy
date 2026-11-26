import type { AppearancePreferences } from "../../../lib/appearance-preferences";

// Mirrors the type and spacing scales on personalized web surfaces.
export const readingFontScales: Record<AppearancePreferences["fontSize"], number> = {
  "extra-small": 0.8125, small: 0.875, medium: 0.9375, normal: 1, large: 1.25,
};
export const readingDensityScales: Record<AppearancePreferences["density"], number> = {
  tightest: 0.75, tight: 0.875, normal: 1, loose: 1.125, loosest: 1.25,
};

export function scaleReadingText(scale: number, base: { fontSize: number; lineHeight: number }, style?: { fontSize?: number; lineHeight?: number }) {
  return {
    fontSize: (style?.fontSize ?? base.fontSize) * scale,
    lineHeight: (style?.lineHeight ?? base.lineHeight) * scale,
  };
}
