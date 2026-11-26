import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { nativeColors } from "../../packages/design-tokens/native-colors";
import { getSeparatorPosition, separatorCases, separatorFrame } from "../../packages/ui-parity/separator-cases";
import { Separator } from "./components/Separator";

export default function ParityGallery() {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.gallery} showsVerticalScrollIndicator={false}>
        {separatorCases.map(({ id, orientation, theme }) => (
          <View key={id}>
            <View style={styles.marker} />
            <View testID={id} style={[styles.frame, { backgroundColor: nativeColors[theme].background }]}>
              <View style={getSeparatorPosition(orientation)}>
                <Separator orientation={orientation} theme={theme} />
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: nativeColors.light.background },
  gallery: { alignItems: "center", gap: separatorFrame.gap, paddingVertical: separatorFrame.gap },
  marker: {
    width: separatorFrame.width,
    height: separatorFrame.markerHeight,
    backgroundColor: separatorFrame.markerColor,
  },
  frame: { width: separatorFrame.width, height: separatorFrame.height },
});
