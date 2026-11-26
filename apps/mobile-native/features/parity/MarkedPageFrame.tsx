import type { ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function MarkedPageFrame({ frame, index, children, markerColor = "#e000ef" }: {
  frame: Readonly<{ width: number; height: number }>;
  index: number;
  children: ReactNode;
  markerColor?: string;
}) {
  const marker = { width: frame.width - index, height: 1, backgroundColor: markerColor };
  return <SafeAreaView style={{ flex: 1, alignItems: "flex-start" }}>
    <View accessible={false} style={marker} />
    <View style={[frame, { overflow: "hidden" }]}>{children}</View>
    <View accessible={false} style={marker} />
  </SafeAreaView>;
}
