import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Polygon, RadialGradient, Rect, Stop } from "react-native-svg";

import { nativeColors, nativeLinkInks } from "../../../../packages/design-tokens/native-colors";
import { plansGlowOffsets, plansOrnaments } from "../../../../packages/design-tokens/plans-ornaments";
import {
  ornamentCircles, ornamentCornerOffsets, ornamentGlowStop, ornamentPolygonPoints, ornamentViewBox,
  testimonialOrnaments,
} from "../../../../packages/design-tokens/testimonial-ornaments";
import { nativeTypography } from "../../typography";

import { useNativeAppearance } from "../../device/appearance";

const layers = {
  testimonial: {
    ...testimonialOrnaments,
    glows: testimonialOrnaments.glows.map(({ corner, offsetRem, ...glow }) => ({
      ...glow, position: ornamentCornerOffsets(corner, offsetRem * 16),
    })),
  },
  plans: {
    ...plansOrnaments,
    glows: plansOrnaments.glows.map(({ position, ...glow }) => ({
      ...glow, position: plansGlowOffsets(position, value => value * 16),
    })),
  },
};

export function NativePageOrnaments({ variant, theme, opacityScale = 1 }: {
  variant: keyof typeof layers;
  theme: keyof typeof nativeColors;
  opacityScale?: number;
}) {
  if (useNativeAppearance().background === "solid") return null;
  const colors = { primary: nativeColors[theme].primary, ...nativeLinkInks };
  const { glows, rings, shapes, math, opacity } = layers[variant];
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      needsOffscreenAlphaCompositing
      style={[StyleSheet.absoluteFill, styles.clipped, { opacity: opacity[theme] * opacityScale }]}
    >
      {glows.map(({ color, position, size, intensity }, index) => (
        <Svg key={color} width={size} height={size} style={[styles.absolute, position]}>
          <Defs>
            {/* CSS uses the distance to the farthest corner before the stop percentage. */}
            <RadialGradient id={`glow-${index}`} cx={size / 2} cy={size / 2}
              rx={size / Math.SQRT2} ry={size / Math.SQRT2} gradientUnits="userSpaceOnUse">
              <Stop offset="0%" stopColor={colors[color]} stopOpacity={intensity} />
              <Stop offset={`${ornamentGlowStop}%`} stopColor={colors[color]} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={size} height={size} fill={`url(#glow-${index})`} />
        </Svg>
      ))}
      {rings.map(ring => (
        <View key={ring.corner} style={[styles.absolute, styles.clipped, ornamentCornerOffsets(ring.corner, 0)]}>
          <Svg width={ring.size} height={ring.size} viewBox={`0 0 ${ring.size} ${ring.size}`}>
            {ornamentCircles(ring).map(circle => (
              <Circle key={circle.r} {...circle} fill="none" stroke={colors[ring.color]} />
            ))}
          </Svg>
        </View>
      ))}
      <Svg
        width="100%"
        height="100%"
        style={styles.absolute}
        viewBox={`0 0 ${ornamentViewBox.width} ${ornamentViewBox.height}`}
        preserveAspectRatio="xMidYMid slice"
      >
        {shapes.map(shape => (
          <Polygon key={shape.cx} points={ornamentPolygonPoints(shape)} fill="none"
            stroke={colors[shape.color]} strokeWidth={1.5} opacity={shape.opacity} />
        ))}
      </Svg>
      {math.map(({ symbol, x, y, size, rotation, color, opacity: glyphOpacity }) => (
        <View key={symbol} style={[styles.absolute, { left: x, top: y }]}>
          <Text allowFontScaling={false}
            style={[styles.glyph, { width: 2 * size, left: -size, top: -size / 2, fontSize: size, lineHeight: size,
              color: colors[color], opacity: glyphOpacity, transform: [{ rotate: `${rotation}deg` }] }]}>
            {symbol}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  absolute: { position: "absolute" },
  clipped: { overflow: "hidden" },
  glyph: { ...nativeTypography.headingBold, includeFontPadding: false, textAlign: "center" },
});
