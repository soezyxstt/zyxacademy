import { componentNames, galleryCases, type GalleryCase } from "../../packages/ui-parity/gallery";
import { useEffect, useState, type ReactNode } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { nativeColors } from "../../packages/design-tokens/native-colors";
import { parityFrame } from "../../packages/ui-parity/frame";
import { getSeparatorPosition } from "../../packages/ui-parity/separator-cases";
import { getSkeletonPosition } from "../../packages/ui-parity/skeleton-cases";
import { Separator } from "./components/Separator";
import { ChoiceCase } from "./ChoiceCases";
import { ControlCase } from "./ControlCases";
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

function Specimen({ item }: { item: GalleryCase }) {
  switch (item.family) {
    case "control":
      return <ControlCase id={item.id} />;
    case "choice":
      return <ChoiceCase id={item.id} />;
    case "skeleton":
      return <Skeleton theme={item.theme} style={getSkeletonPosition(item.width, item.height)} />;
    case "separator":
      return (
        <View style={getSeparatorPosition(item.orientation)}>
          {item.orientation === "vertical" ? (
            <Separator orientation={item.orientation} theme={item.theme} decorative={false} accessibilityLabel="Pemisah bagian" />
          ) : (
            <Separator orientation={item.orientation} theme={item.theme} />
          )}
        </View>
      );
  }
}

export default function ParityGallery() {
  const [component, setComponent] = useState(componentNames[0]);

  useEffect(() => {
    function open(url: string | null | undefined) {
      const name = componentNames.find((candidate) => url === `zyx-native-parity://gallery/${candidate}`);
      if (name) setComponent(name);
    }
    let initial = true;
    const subscription = Linking.addEventListener("url", ({ url }) => {
      initial = false;
      open(url);
    });
    void Linking.getInitialURL().then((url) => { if (initial) open(url); });
    return () => { initial = false; subscription.remove(); };
  }, []);

  return (
    <SafeAreaView style={styles.screen}>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {componentNames.map((name) => (
            <Pressable accessibilityRole="button" accessibilityState={{ selected: component === name }}
              key={name} onPress={() => setComponent(name)} style={styles.tab}>
              <Text style={{ color: nativeColors.light.foreground }}>{name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <ScrollView key={component} contentContainerStyle={styles.gallery} showsVerticalScrollIndicator={false}>
        <View style={[styles.marker, { width: 16 + componentNames.indexOf(component) }]} />
        {galleryCases.filter((item) => item.component === component).map((item) => (
          <ParityCaseFrame key={item.id} id={item.id} theme={item.theme}>
            <Specimen item={item} />
          </ParityCaseFrame>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tab: { minHeight: 44, paddingHorizontal: 12, justifyContent: "center" },
  screen: { flex: 1, backgroundColor: nativeColors.light.background },
  gallery: { alignItems: "center", gap: parityFrame.gap, paddingVertical: parityFrame.gap },
  marker: {
    width: parityFrame.width,
    height: parityFrame.markerHeight,
    backgroundColor: parityFrame.markerColor,
  },
  frame: { width: parityFrame.width, height: parityFrame.height },
});
