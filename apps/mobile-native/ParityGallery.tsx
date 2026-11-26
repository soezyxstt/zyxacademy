import { componentNames, galleryCases, type GalleryCase } from "../../packages/ui-parity/gallery";
import { type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { nativeColors } from "../../packages/design-tokens/native-colors";
import { getParityFrameHeight, parityFrame } from "../../packages/ui-parity/frame";
import { getSeparatorPosition } from "../../packages/ui-parity/separator-cases";
import { getSkeletonPosition } from "../../packages/ui-parity/skeleton-cases";
import { AvatarCase } from "./AvatarCases";
import { BadgeCase, BetaBadgeCase } from "./BadgeCases";
import { Separator } from "./components/Separator";
import { ProgressCase } from "./ProgressCases";
import { RadioCase } from "./RadioCases";
import { ChoiceCase } from "./ChoiceCases";
import { ControlCase } from "./ControlCases";
import { FormattedDateCase } from "./FormattedDateCases";
import { NotificationInboxCase } from "./NotificationInboxCases";
import { SliderCase } from "./SliderCases";
import { Skeleton } from "./components/Skeleton";

type ParityCaseFrameProps = { id: string; theme: keyof typeof nativeColors; height: number; children: ReactNode };

function ParityCaseFrame({ id, theme, height, children }: ParityCaseFrameProps) {
  return (
    <View>
      <View style={styles.marker} />
      <View testID={id} style={{ width: parityFrame.width, height, backgroundColor: nativeColors[theme].background }}>
        {children}
      </View>
    </View>
  );
}

function Specimen({ item }: { item: GalleryCase }) {
  switch (item.family) {
    case "control":
      return <ControlCase id={item.id} />;
    case "radio":
      return <RadioCase id={item.id} />;
    case "avatar":
      return <AvatarCase item={item} />;
    case "badge":
      return <BadgeCase item={item} />;
    case "beta-badge":
      return <BetaBadgeCase item={item} />;
    case "progress":
      return <ProgressCase item={item} />;
    case "formatted-date":
      return <FormattedDateCase item={item} />;
    case "notification-inbox":
      return <NotificationInboxCase item={item} />;
    case "slider":
      return <SliderCase item={item} />;
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

type GalleryProps = {
  component: GalleryCase["component"];
  onSelect: (name: GalleryCase["component"]) => void;
};

export default function ParityGallery({ component, onSelect }: GalleryProps) {
  return (
    <SafeAreaView style={styles.screen}>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {componentNames.map((name) => (
            <Pressable accessibilityRole="button" accessibilityState={{ selected: component === name }}
              key={name} onPress={() => onSelect(name)} style={styles.tab}>
              <Text style={{ color: nativeColors.light.foreground }}>{name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <ScrollView key={component} contentContainerStyle={styles.gallery} showsVerticalScrollIndicator={false}>
        <View style={[styles.marker, { width: 16 + componentNames.indexOf(component) }]} />
        {galleryCases.filter((item) => item.component === component).map((item) => (
          <ParityCaseFrame key={item.id} id={item.id} theme={item.theme} height={getParityFrameHeight(component)}>
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
});
