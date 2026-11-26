import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  useColorScheme,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { nativeColors, nativeRadii } from "../../../packages/design-tokens/native-colors";

type SkeletonProps = {
  theme?: keyof typeof nativeColors;
  style?: StyleProp<ViewStyle>;
};

const pulseEasing = Easing.bezier(0.4, 0, 0.6, 1);

export function Skeleton({ theme, style }: SkeletonProps) {
  const systemTheme = useColorScheme();
  const colors = nativeColors[theme ?? systemTheme ?? "light"];
  const [reduceMotion, setReduceMotion] = useState(true);
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    let applyInitialPreference = true;
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      applyInitialPreference = false;
      setReduceMotion(enabled);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (applyInitialPreference) setReduceMotion(enabled);
    }, () => undefined);

    return () => {
      applyInitialPreference = false;
      subscription.remove();
    };
  }, []);

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
