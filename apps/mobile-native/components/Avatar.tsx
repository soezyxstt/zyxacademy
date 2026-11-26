import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, useColorScheme, View, type StyleProp, type ViewStyle } from "react-native";

import { nativeColors } from "../../../packages/design-tokens/native-colors";
import { nativeTypography } from "../typography";

export type AvatarImageStatus = "idle" | "loading" | "loaded" | "error";

type AvatarPictureProps = {
  source?: number | string;
  initials: string;
  theme?: keyof typeof nativeColors;
  onLoadingStatusChange?(status: AvatarImageStatus): void;
};

type AvatarProps = AvatarPictureProps & {
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
} & (
  | { decorative?: false; accessibilityLabel: string }
  | { decorative: true; accessibilityLabel?: never }
);

function AvatarPicture({ source, initials, theme, onLoadingStatusChange }: AvatarPictureProps) {
  const systemTheme = useColorScheme();
  const colors = nativeColors[theme ?? systemTheme ?? "light"];
  const [status, setStatus] = useState<AvatarImageStatus>(source === undefined ? "idle" : "loading");

  useEffect(() => {
    onLoadingStatusChange?.(status);
  }, [onLoadingStatusChange, status]);

  return (
    <View style={styles.content} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {status !== "loaded" && (
        <View style={[styles.fallback, { backgroundColor: colors.muted }]}>
          <Text style={[styles.initials, { color: colors.foreground }]}>{initials}</Text>
        </View>
      )}
      {source !== undefined && status !== "error" && (
        <Image
          source={typeof source === "number" ? source : { uri: source }}
          resizeMode="cover"
          fadeDuration={0}
          style={[styles.image, status !== "loaded" && styles.hiddenImage]}
          onLoad={() => setStatus(current => current === "loading" ? "loaded" : current)}
          onError={() => setStatus(current => current === "loading" ? "error" : current)}
        />
      )}
    </View>
  );
}

export function Avatar({
  accessibilityLabel,
  decorative = false,
  size = 32,
  style,
  testID,
  ...picture
}: AvatarProps) {
  const source = picture.source === "" ? undefined : picture.source;
  const pictureKey = typeof source === "number" ? `asset:${source}` : `uri:${source ?? ""}`;
  return (
    <View
      accessible={!decorative}
      accessibilityElementsHidden={decorative}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
      accessibilityRole={decorative ? undefined : "image"}
      importantForAccessibility={decorative ? "no-hide-descendants" : "yes"}
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }, style]}
      testID={testID}
    >
      <AvatarPicture key={pictureKey} {...picture} source={source} />
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { flexShrink: 0, overflow: "hidden" },
  content: { flex: 1 },
  fallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  initials: { ...nativeTypography.bodySemibold, fontSize: 12, lineHeight: 18, includeFontPadding: false },
  image: { position: "absolute", left: 0, top: 0, width: "100%", height: "100%" },
  hiddenImage: { opacity: 0 },
});
