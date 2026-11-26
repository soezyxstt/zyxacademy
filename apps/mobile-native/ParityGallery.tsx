import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { nativeColors } from "../../packages/design-tokens/native-colors";
import { parityFrame } from "../../packages/ui-parity/frame";
import { getSeparatorPosition, separatorCases } from "../../packages/ui-parity/separator-cases";
import { getSkeletonPosition, skeletonCases } from "../../packages/ui-parity/skeleton-cases";
import { Separator } from "./components/Separator";
import { Skeleton } from "./components/Skeleton";

type ParityCaseFrameProps = { id: string; theme: keyof typeof nativeColors; children: ReactNode };

function ParityCaseFrame({ id, theme, children }: ParityCaseFrameProps) {
  return (
    <View>
      <View style={styles.marker} />
      <View testID={id} style={[styles.frame, { backgroundColor: nativeColors[theme].background }]}>
        {children}
      </View>
    </View>
  );
}

export default function ParityGallery() {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.gallery} showsVerticalScrollIndicator={false}>
        {separatorCases.map(({ id, orientation, theme }) => (
          <ParityCaseFrame key={id} id={id} theme={theme}>
            <View style={getSeparatorPosition(orientation)}>
              <Separator orientation={orientation} theme={theme} />
            </View>
          </ParityCaseFrame>
        ))}
        {skeletonCases.map(({ id, theme, width, height }) => (
          <ParityCaseFrame key={id} id={id} theme={theme}>
            <Skeleton theme={theme} style={getSkeletonPosition(width, height)} />
          </ParityCaseFrame>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: nativeColors.light.background },
  gallery: { alignItems: "center", gap: parityFrame.gap, paddingVertical: parityFrame.gap },
  marker: {
    width: parityFrame.width,
    height: parityFrame.markerHeight,
    backgroundColor: parityFrame.markerColor,
  },
  frame: { width: parityFrame.width, height: parityFrame.height },
});
