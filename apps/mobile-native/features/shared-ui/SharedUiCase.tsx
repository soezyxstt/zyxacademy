import { useState } from "react";
import { Dimensions, PixelRatio, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { sharedUiCases } from "../../../../packages/native-parity/shared-ui/cases";
import { SharedUiControlCase } from "./ControlCases";
import { DataCases } from "./DataCases";
import { FirstSliceExample } from "./FirstSliceExample";
import { NavigationCase } from "./NavigationCases";

/** The host resolves the route and loads fonts and SafeAreaProvider before mounting this entry. */
export function SharedUiCase({ id }: { id: string }) {
  const item = sharedUiCases.find((candidate) => candidate.id === id);
  const [frame, setFrame] = useState<{ width: number; height: number }>();
  const insets = useSafeAreaInsets();
  const { scale } = useWindowDimensions();

  if (!item) return <Text accessibilityRole="alert">Kasus shared-ui tidak ditemukan.</Text>;

  const screen = Dimensions.get("screen");
  const px = PixelRatio.getPixelSizeForLayoutSize;
  const insetsPx = [insets.left, insets.top, insets.right, insets.bottom].map(px);
  const screenWidth = px(screen.width);
  const screenHeight = px(screen.height);
  const edgeToEdge = frame && px(frame.width) === screenWidth && px(frame.height) === screenHeight;
  const contentWidth = screenWidth - insetsPx[0] - insetsPx[2];
  const contentHeight = screenHeight - insetsPx[1] - insetsPx[3];
  const dpr = Number(scale.toFixed(6)).toString().replace(".", "-");
  const geometryMarker = edgeToEdge && contentWidth > 0 && contentHeight > 0 ? (
    <View
      accessible
      collapsable={false}
      pointerEvents="none"
      style={[styles.geometryMarker, { top: insets.top + 2, left: insets.left + 2 }]}
      testID={`shared-ui-geometry-${contentWidth}x${contentHeight}-dpr-${dpr}-insets-${insetsPx.join("-")}`}
    />
  ) : null;

  return (
    <View
      collapsable={false}
      onLayout={(event) => setFrame(event.nativeEvent.layout)}
      style={[styles.frame, { backgroundColor: nativeColors[item.theme].background }]}
      testID={`shared-ui-case-${id}`}
    >
      {item.family === "layout" ? <FirstSliceExample key={id} caseId={item.id} /> : (
        <SafeAreaView key={id} style={styles.frame}>
          {item.family === "navigation" ? <NavigationCase id={item.id} geometryMarker={geometryMarker} />
            : item.family === "data" ? <DataCases id={item.id} />
            : <SharedUiControlCase id={item.id} />}
        </SafeAreaView>
      )}
      {geometryMarker}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  geometryMarker: { position: "absolute", width: 1, height: 1 },
});
