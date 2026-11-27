import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

/** Transient marks identify the fixture and safe-area bounds. Saved evidence uses the subsequent clean frame. */
export function EvidenceFrame({ ordinal, children }: { ordinal: number; children: ReactNode }) {
  const [laidOut, setLaidOut] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!laidOut) return;
    let settle = 0;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const start = requestAnimationFrame(() => {
      settle = requestAnimationFrame(() => {
        setVisible(true);
        timeout = setTimeout(() => setVisible(false), 2250);
      });
    });
    return () => {
      cancelAnimationFrame(start);
      cancelAnimationFrame(settle);
      clearTimeout(timeout);
    };
  }, [laidOut, ordinal]);
  return <View style={styles.frame} onLayout={() => setLaidOut(true)}>
    {children}
    {visible && <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}>
      <View style={[styles.stamp, { top: 0, left: 0, backgroundColor: `rgb(224, ${ordinal}, 239)` }]} />
      <View style={[styles.stamp, { bottom: 0, right: 0, backgroundColor: `rgb(223, ${ordinal}, 234)` }]} />
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  stamp: { position: "absolute", width: 4, height: 4 },
});
