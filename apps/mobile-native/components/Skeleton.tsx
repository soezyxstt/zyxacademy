import { useEffect, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  useColorScheme,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { nativeColors, nativeRadii } from "../../../packages/design-tokens/native-colors";
import { useReducedMotion } from "../device/reduced-motion";

type SkeletonProps = {
  theme?: keyof typeof nativeColors;
  style?: StyleProp<ViewStyle>;
};

const pulseEasing = Easing.bezier(0.4, 0, 0.6, 1);

export function Skeleton({ theme, style }: SkeletonProps) {
  const systemTheme = useColorScheme();
  const colors = nativeColors[theme ?? systemTheme ?? "light"];
  const reduceMotion = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (reduceMotion) return;

    const pulse = Animated.loop(Animated.timing(opacity, {
      toValue: 0.5,
      duration: 2000,
      // The web pulse reaches minimum opacity halfway through the cycle.
      easing: (progress) => pulseEasing(1 - Math.abs(2 * progress - 1)),
      useNativeDriver: true,
      isInteraction: false,
    }));
    pulse.start();

    return () => {
      pulse.stop();
      pulse.reset();
    };
  }, [opacity, reduceMotion]);

  return (
    <Animated.View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.base, { backgroundColor: colors.muted }, style, { opacity: reduceMotion ? 0.65 : opacity }]}
    />
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: nativeRadii.md },
});
