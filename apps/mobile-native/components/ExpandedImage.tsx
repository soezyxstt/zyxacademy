import { Image, Modal, Text, useColorScheme } from "react-native";
import { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { nativeColors } from "../../../packages/design-tokens/native-colors";
import { Button } from "./Button";

export function ExpandedImage({ uri, label, locale, theme, close }: {
  uri: string; label: string; locale: string; theme?: keyof typeof nativeColors; close(): void;
}) {
  const system = useColorScheme();
  const palette = theme ?? (system === "dark" ? "dark" : "light");
  const colors = nativeColors[palette];
  const en = locale.startsWith("en");
  const [failed, setFailed] = useState(false);
  return <Modal visible onRequestClose={close} animationType="none">
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Button theme={palette} variant="ghost" onPress={close}>{en ? "Close image" : "Tutup gambar"}</Button>
      {failed ? <Text accessibilityRole="alert" style={{ color: colors.foreground }}>{en ? "The image could not be loaded." : "Gambar belum dapat dimuat."}</Text> :
        <Image accessible accessibilityLabel={label} source={{ uri }} resizeMode="contain" style={{ flex: 1, width: "100%" }} onError={() => setFailed(true)} />}
    </SafeAreaView>
  </Modal>;
}
