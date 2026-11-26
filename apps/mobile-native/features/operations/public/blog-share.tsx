import { setStringAsync } from "expo-clipboard";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { blogShareDestinations } from "../../../../../lib/blog-share-destinations";
import { Action, Label, layout, textWith, usePublic } from "./ui";

export function BlogShareCard({ title, url, onShare }: { title: string; url: string; onShare: () => void }) {
  const { colors, copy: { blog } } = usePublic();
  const [copyResult, setCopyResult] = useState<"copied" | "failed" | null>(null);

  async function copyUrl() {
    try {
      setCopyResult(await setStringAsync(url) ? "copied" : "failed");
    } catch {
      setCopyResult("failed");
    }
  }

  return <View style={[layout.panel, { padding: 24, backgroundColor: colors.background, borderColor: colors.border }]}>
    <View style={layout.item}>
      <Label style={{ fontWeight: "700" }}>{blog.shareArticleTitle}</Label>
      <Label tone="muted">{blog.shareArticleDescription}</Label>
    </View>
    <View style={layout.item}>
      <Label tone="meta">{blog.copyUrl.toLocaleUpperCase()}</Label>
      <View style={layout.inline}>
        <Text selectable numberOfLines={1} accessibilityLabel={url}
          style={[styles.url, { borderColor: colors.border, backgroundColor: colors.muted, color: colors.foreground }]}>{url}</Text>
        <Action onPress={copyUrl} accessibilityLabel={blog.copyUrl}>{blog.copy}</Action>
      </View>
      {copyResult && <Label tone={copyResult === "copied" ? "meta" : "error"} live="polite">
        {copyResult === "copied" ? blog.shareCopied : blog.shareCopyFailed}
      </Label>}
    </View>
    <Label tone="meta">{blog.shareTo.toLocaleUpperCase()}</Label>
    <View style={layout.row}>
      {Object.entries(blogShareDestinations(title, url)).map(([platform, destination]) =>
        <Action key={platform} external href={destination} accessibilityLabel={textWith(blog.shareToPlatform, { platform })}>
          {platform}
        </Action>
      )}
      <Action onPress={onShare}>{blog.shareViaSystem}</Action>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  url: { flex: 1, borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 10 },
});
