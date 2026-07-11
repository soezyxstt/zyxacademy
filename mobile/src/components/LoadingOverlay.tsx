import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { Logo } from './Logo';
import { useTheme } from '../theme';

/**
 * Dedicated loading screen: centered logo at the same 126dp width the web
 * route loader uses, so the native-to-web handoff never resizes the logo.
 * A gentle opacity pulse stands in for the web's draw animation (the web
 * plays its own draw animation once the page takes over).
 */
export function LoadingOverlay() {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[styles.overlay, { backgroundColor: colors.background }]}
      pointerEvents="auto"
    >
      <Animated.View style={{ opacity }}>
        <Logo width={126} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
});
