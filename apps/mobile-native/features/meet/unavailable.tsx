import { useState } from "react";
import { ScrollView, StyleSheet, Text, View, useColorScheme, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path, Rect } from "react-native-svg";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { Button } from "../../components/Button";
import { nativeTypography } from "../../typography";

export function MeetingUnavailable({ title, description, home, onHome, insideSafeArea }: {
  title: string; description: string; home: string; onHome(): void; insideSafeArea?: boolean;
}) {
  const [height, setHeight] = useState(0);
  const { width } = useWindowDimensions();
  const colors = nativeColors[useColorScheme() ?? "light"];
  const gutter = width >= 1024 ? 32 : width >= 640 ? 24 : 16;
  return <SafeAreaView edges={insideSafeArea ? [] : undefined} style={[styles.viewport, { backgroundColor: colors.background }]}>
    <ScrollView style={styles.viewport} onLayout={event => setHeight(event.nativeEvent.layout.height)}>
      <View style={[styles.content, { minHeight: height * 0.6, paddingHorizontal: gutter }]}>
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.mutedForeground}
          strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
          <Path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.934a.5.5 0 0 0-.777-.416L16 11" />
          <Rect x={2} y={6} width={14} height={12} rx={2} />
        </Svg>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>{description}</Text>
        <Button accessibilityRole="link" wrapLabel onPress={onHome} style={styles.action} testID="meeting-home">{home}</Button>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  viewport: { flex: 1 },
  content: { width: "100%", maxWidth: 512, alignSelf: "center", paddingVertical: 24, alignItems: "center", justifyContent: "center", gap: 12 },
  title: { ...nativeTypography.headingBold, fontSize: 24, lineHeight: 32, textAlign: "center", includeFontPadding: false },
  description: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 20, textAlign: "center", includeFontPadding: false },
  action: { height: "auto", minHeight: 32, paddingVertical: 4, flexShrink: 1, maxWidth: "100%" },
});
