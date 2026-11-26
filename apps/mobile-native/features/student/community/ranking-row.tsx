import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { getFrameCollection } from "../../../../../lib/gamification/collection-art";
import type { StudentIdentity } from "../../../../../packages/native-parity/student/community/contracts";
import { rankLabels } from "../../../../../packages/student-community/labels";
import { Avatar } from "../../../components/Avatar";
import { nativeTypography } from "../../../typography";
import { useCommunity } from "./ui";

function profilePhoto(url: string | null | undefined, origin: string) {
  if (!url) return undefined;
  try {
    const photo = new URL(url, origin);
    return photo.protocol === "https:" && !photo.username && !photo.password ? photo.href : undefined;
  } catch { return undefined; }
}

export function RankingRowView({ position, name, identity, metric, details, own, first }: {
  position: string; name: string; identity?: StudentIdentity | null; metric: string;
  details?: readonly string[]; own?: boolean; first: boolean;
}) {
  const { colors, theme, session, navigate, tr } = useCommunity();
  const label = identity?.displayName || name;
  const initial = Array.from(label.trim())[0]?.toLocaleUpperCase(session.locale) || "?";
  const rank = identity && Object.hasOwn(rankLabels, identity.rankKey) ? rankLabels[identity.rankKey as keyof typeof rankLabels] : null;
  const frame = getFrameCollection(identity?.equippedFrameId);
  const [failedFrame, setFailedFrame] = useState<string>();
  const [focused, setFocused] = useState(false);
  const frameUri = frame ? new URL(frame.src, session.origin).href : undefined;
  const showFrame = frame && frameUri && failedFrame !== frameUri;
  const displayedName = own ? `${label} (${tr("Anda", "You")})` : label;
  const content = <>
    <View style={styles.avatar}>
      <Avatar decorative theme={theme} variant="profile" initials={initial}
        source={profilePhoto(identity?.avatarUrl, session.origin)} size={showFrame ? 40 * frame.aperture : 40} />
      {showFrame && <Image accessible={false} source={{ uri: frameUri }} style={styles.frame} onError={() => setFailedFrame(frameUri)} />}
    </View>
    <View style={styles.labels}>
      <Text style={[styles.name, { color: colors.foreground }]}>{displayedName}</Text>
      {rank && <Text style={[styles.detail, { color: colors.mutedForeground }]}>{rank}</Text>}
    </View>
  </>;
  return <View style={[styles.row, details ? styles.topAligned : undefined,
    !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
    <View style={[styles.position, details && { borderRadius: 8, backgroundColor: `${colors.muted}99` }]}>
      <Text style={[styles.number, { color: colors.foreground }]}>{position}</Text>
    </View>
    <View style={styles.main}>
      {identity ? <Pressable accessibilityRole="link" accessibilityLabel={[displayedName, rank].filter(Boolean).join(", ")}
        onPress={() => navigate(`/students/${encodeURIComponent(identity.publicId)}`)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={({ pressed }) => [styles.identity, pressed && { backgroundColor: colors.muted },
          focused && { outlineWidth: 2, outlineColor: colors.accent }]}>
        {content}
      </Pressable> : <View style={styles.identity}>{content}</View>}
      {details?.map((line, index) => <Text key={index} style={[styles.detail, { color: colors.mutedForeground }]}>{line}</Text>)}
    </View>
    <Text style={[details ? styles.score : styles.number, { color: details ? colors.primary : colors.foreground }]}>{metric}</Text>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  topAligned: { alignItems: "flex-start" },
  position: { width: 32, minHeight: 32, alignItems: "center", justifyContent: "center" },
  main: { flex: 1, minWidth: 0, gap: 3 },
  identity: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, borderRadius: 6 },
  labels: { flex: 1, minWidth: 0 },
  avatar: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  frame: { position: "absolute", width: 40, height: 40 },
  name: { ...nativeTypography.bodySemibold, fontSize: 14, lineHeight: 20, includeFontPadding: false },
  number: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"], includeFontPadding: false },
  score: { ...nativeTypography.headingBold, fontSize: 16, lineHeight: 24, fontVariant: ["tabular-nums"], includeFontPadding: false },
  detail: { ...nativeTypography.bodyRegular, fontSize: 12, lineHeight: 18, includeFontPadding: false },
});
