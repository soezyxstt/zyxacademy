import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Image, Linking, Platform, StyleSheet, Text, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { useNativeSession } from "../../auth/session-provider";
import { Button } from "../../components/Button";
import {
  belongsToPhotoDraft,
  scopedPhotos,
  type PhotoDraftTarget,
  type PhotoOutcome,
  type PhotoSource,
} from "../../device/photo";
import { nativeTypography } from "../../typography";

const target: PhotoDraftTarget = { route: "/internal/photo", locale: "id", draftId: "photo-check" };

function outcomeMessage(outcome: PhotoOutcome | null): string | null {
  switch (outcome?.status) {
    case "ready":
      return `${outcome.recovered ? "Foto dipulihkan" : "Foto siap"} · ${outcome.photo.width} × ${outcome.photo.height} px · ${Math.ceil(outcome.photo.size / 1024)} KiB`;
    case "permission-denied":
      return outcome.canAskAgain ? "Izinkan kamera untuk mengambil foto." : "Izinkan kamera di pengaturan perangkat.";
    case "no-pending": return "Tidak ada foto tertunda untuk draft ini.";
    case "cancelled": return "Pemilihan foto dibatalkan.";
    case "busy": return "Pemilih foto masih terbuka.";
    case "stale": return "Draft sudah berubah. Pilih kembali foto.";
    case "unavailable": return "Pemilih foto tidak tersedia di perangkat ini.";
    case "error":
      if (outcome.issue === "storage") return "Status foto tidak dapat disimpan. Coba lagi.";
      if (outcome.issue === "image-size") return "Foto terlalu besar. Pilih foto yang lebih kecil.";
      if (outcome.issue === "unsupported-image" || outcome.issue === "decode") return "Foto tidak dapat dibaca. Pilih foto lain.";
      return "Pemilih foto tidak berhasil dibuka. Coba lagi.";
    default: return null;
  }
}

export default function InternalPhotoRoute() {
  const router = useRouter();
  const { transport, revalidating } = useNativeSession();
  const colors = nativeColors[useColorScheme() === "dark" ? "dark" : "light"];
  const focused = useRef(false);
  const mounted = useRef(false);
  const working = useRef(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<PhotoOutcome | null>(null);
  const photo = outcome?.status === "ready" ? outcome.photo : null;
  const request = transport ? { session: transport, target, isDraftCurrent: () => focused.current } : null;

  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; };
  }, []));
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => () => photo?.release(), [photo]);
  useEffect(() => { setOutcome(null); }, [transport]);

  const run = async (action: PhotoSource | "recover") => {
    if (!request || !focused.current || !transport?.isCurrent() || revalidating || working.current) return;
    working.current = true;
    setBusy(true);
    try {
      const result = action === "recover"
        ? await scopedPhotos.recover(request)
        : await scopedPhotos.pick(action, request);
      if (!focused.current || !transport.isCurrent()) {
        if (result.status === "ready") result.photo.release();
        return;
      }
      setOutcome(result);
    } finally {
      working.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const visible = outcome?.status === "ready" && (!request || !belongsToPhotoDraft(outcome.photo, request))
    ? null
    : outcome;
  const message = outcomeMessage(visible);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>Kamera dan galeri</Text>
      {transport ? (
        <>
          <View style={styles.actions}>
            <Button disabled={busy || revalidating} onPress={() => void run("camera")}>Ambil foto</Button>
            <Button disabled={busy || revalidating} variant="outline" onPress={() => void run("library")}>Pilih foto</Button>
            {Platform.OS === "android" && (
              <Button disabled={busy || revalidating} variant="outline" onPress={() => void run("recover")}>Pulihkan foto</Button>
            )}
          </View>
          {message && <Text accessibilityLiveRegion="polite" style={[styles.body, { color: colors.foreground }]}>{message}</Text>}
          {visible?.status === "permission-denied" && !visible.canAskAgain && (
            <Button variant="outline" onPress={() => void Linking.openSettings()}>Buka pengaturan</Button>
          )}
          {visible?.status === "ready" && (
            <>
              <Image
                accessibilityLabel="Pratinjau foto pilihan"
                accessibilityRole="image"
                resizeMode="contain"
                source={{ uri: visible.photo.uri }}
                style={[styles.preview, { backgroundColor: colors.muted }]}
                onError={() => setOutcome({ status: "error", issue: "decode" })}
              />
              <Button variant="ghost" onPress={() => setOutcome(null)}>Hapus foto</Button>
            </>
          )}
        </>
      ) : (
        <Button onPress={() => router.push("/internal/session")}>Masuk ke akun staging</Button>
      )}
      <Button variant="ghost" onPress={() => router.replace("/")}>Kembali ke galeri</Button>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", gap: 12, paddingHorizontal: 20 },
  heading: { ...nativeTypography.headingBold, fontSize: 24 },
  body: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preview: { width: "100%", height: 180, borderRadius: 8 },
});
