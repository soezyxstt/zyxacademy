import { useState } from "react";
import { FlatList, Image, StyleSheet, Text, View, useColorScheme } from "react-native";
import { OFFLINE_LIBRARY_COPY } from "../../../packages/offline/library-copy";
import { nativeColors } from "../../../packages/design-tokens/native-colors";
import { NativeListRow, NativeStatusPanel } from "../features/shared-ui/layout";
import type { OfflineCatalogVideo } from "./catalog-model";
import type { NativeOfflineMetadataSnapshot } from "./metadata-store";
import type { NativeOfflineLocale } from "./sync-contract";

export type OfflineLibrarySection = "readings" | "courses" | "videos" | "achievements" | "storage";

export function OfflineCatalogView({ metadata, section, locale, offline, onCourse, onVideo }: {
  metadata: NativeOfflineMetadataSnapshot | null;
  section: "courses" | "videos" | "achievements";
  locale: NativeOfflineLocale;
  offline: boolean;
  onCourse(courseId: string): void;
  onVideo(courseId: string, video: OfflineCatalogVideo): void;
}) {
  const theme = useColorScheme() ?? "light";
  const colors = nativeColors[theme];
  const copy = OFFLINE_LIBRARY_COPY[locale];
  const active = Date.now();
  const courses = metadata?.courses.filter(course => course.leaseExpiresAt > active) ?? [];
  const courseTitles = new Map(courses.map(course => [course.id, course.title]));
  const catalogs = metadata?.catalogs?.filter(catalog => catalog.leaseExpiresAt > active) ?? [];
  if (section === "courses") return <FlatList
    data={courses} keyExtractor={course => course.id} accessibilityLabel={copy.courses} testID="offline-library-courses"
    ListEmptyComponent={<NativeStatusPanel title={copy.noCourses} />}
    renderItem={({ item }) => <NativeListRow layout="compact" theme={theme} title={item.title}
      subtitle={`${item.materials.length} ${copy.items}`} testID={`offline-library-course-${item.id}`}
      primary={{ role: "button", onPress: () => onCourse(item.id) }} />}
  />;
  if (section === "videos") {
    const videos = catalogs.flatMap(catalog => catalog.kind === "video_catalog" && courseTitles.has(catalog.courseId)
      ? catalog.videos.map(video => ({ video, courseId: catalog.courseId, courseTitle: courseTitles.get(catalog.courseId) })) : []);
    return <FlatList
      data={videos} keyExtractor={({ courseId, video }) => JSON.stringify([courseId, video.id])} accessibilityLabel={copy.videos}
      testID="offline-library-videos"
      ListHeaderComponent={videos.length ? <Text style={[styles.notice, { color: colors.mutedForeground }]}>{copy.videoNeedsConnection}</Text> : null}
      ListEmptyComponent={<NativeStatusPanel title={copy.noVideos} />}
      renderItem={({ item }) => <NativeListRow layout="compact" theme={theme} title={item.video.title}
        subtitle={[item.courseTitle, item.video.playlistTitle, item.video.durationSeconds === undefined ? null
          : `${Math.floor(item.video.durationSeconds / 60)}:${String(item.video.durationSeconds % 60).padStart(2, "0")}`].filter(Boolean).join(" · ")} testID={`offline-library-video-${item.video.id}`}
        leading={item.video.thumbnail && item.video.thumbnail.leaseExpiresAt > active ? <Thumbnail key={item.video.thumbnail.uri} uri={item.video.thumbnail.uri} /> : undefined}
        primary={item.video.playable && !offline ? { role: "button", label: `${copy.open} ${item.video.title}`, onPress: () => onVideo(item.courseId, item.video) }
          : undefined} />}
    />;
  }
  const achievements = catalogs.find(catalog => catalog.kind === "achievement_catalog")?.achievements ?? [];
  return <FlatList
    data={achievements} keyExtractor={item => item.id} accessibilityLabel={copy.achievements} testID="offline-library-achievements"
    ListEmptyComponent={<NativeStatusPanel title={copy.noAchievements} />}
    renderItem={({ item }) => <NativeListRow layout="compact" theme={theme} title={item.title}
      subtitle={[item.description, item.thresholds.length ? item.thresholds.join(" / ") : null].filter(Boolean).join(" · ")} />}
  />;
}

function Thumbnail({ uri }: { uri: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? null : <View style={styles.thumbnail}>
    <Image accessible={false} source={{ uri }} style={styles.thumbnail} resizeMode="cover" onError={() => setFailed(true)} />
  </View>;
}

const styles = StyleSheet.create({
  notice: { marginBottom: 8, fontSize: 12 },
  thumbnail: { width: 56, height: 32, borderRadius: 4 },
});
