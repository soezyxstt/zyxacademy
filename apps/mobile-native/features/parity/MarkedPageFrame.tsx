import type { ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function MarkedPageFrame({ frame, index, children }: {
  frame: Readonly<{ width: number; height: number }>;
  index: number;
  children: ReactNode;
}) {
  const marker = { width: frame.width - index, height: 1, backgroundColor: "#e000ef" };
  return <SafeAreaView style={{ flex: 1, alignItems: "flex-start" }}>
    <View accessible={false} style={marker} />
    <View style={[frame, { overflow: "hidden" }]}>{children}</View>
    <View accessible={false} style={marker} />
  </SafeAreaView>;
}
