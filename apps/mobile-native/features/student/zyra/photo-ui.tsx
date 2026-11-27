import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import { ZYRA_IMAGE_MAX_COUNT, ZYRA_IMAGE_MAX_SOURCE_BYTES, type ZyraMessageAttachment } from "../../../../../lib/zyra/images/contracts";
import { nativeColors, nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import { Button } from "../../../components/Button";
import { belongsToPhotoDraft, scopedPhotos, type DraftPhoto, type PhotoSource } from "../../../device/photo";
import type { NativeSessionTransport } from "../../../network/transport";
import { NavigationIcon } from "../../shared-ui/navigation-icons";
import { deleteZyraImage, readZyraImage, uploadZyraImage, type ZyraUploadedImage } from "./images";

type DraftImage = { local: DraftPhoto; uploaded: ZyraUploadedImage };
type Theme = keyof typeof nativeColors;
type PhotoOptions = { session: NativeSessionTransport; courseId: string; pathname: string; locale: "en" | "id"; current(): boolean };

export function useZyraPhotos({ session, courseId, pathname, locale, current }: PhotoOptions) {
  const [items, setItems] = useState<DraftImage[]>([]);
  const latest = useRef<DraftImage[]>([]);
  const operation = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  function update(items: DraftImage[]) { latest.current = items; setItems(items); }
  function cancel() {
    operation.current?.abort();
    operation.current = null;
    setBusy(false);
  }
  function clear() {
    for (const item of latest.current) item.local.release();
    update([]);
    setFailed(false);
  }
  useEffect(() => () => {
    operation.current?.abort();
    operation.current = null;
    for (const item of latest.current) item.local.release();
    latest.current = [];
  }, [session, courseId, pathname]);

  async function pick(source: PhotoSource, threadId?: string) {
    if (operation.current || latest.current.length >= ZYRA_IMAGE_MAX_COUNT || !current()) return;
    const controller = new AbortController();
    operation.current = controller;
    const active = () => operation.current === controller && !controller.signal.aborted && current();
    const request = { session, target: { route: pathname, draftId: randomUUID(), locale },
      output: { format: "jpeg" as const, maxBytes: ZYRA_IMAGE_MAX_SOURCE_BYTES }, discardOnRestore: true as const, isDraftCurrent: active };
    setBusy(true); setFailed(false);
    let photo: DraftPhoto | undefined;
    try {
      const selection = await scopedPhotos.pick(source, request);
      if (selection.status === "cancelled" || selection.status === "stale") return;
      if (selection.status !== "ready") throw new Error("Photo unavailable");
      photo = selection.photo;
      if (!belongsToPhotoDraft(photo, request)) return;
      const chat = latest.current[0]?.uploaded.sessionId ?? threadId ?? null;
      const uploaded = await uploadZyraImage(session, courseId, chat, photo, controller.signal);
      if (!active()) return;
      update([...latest.current, { local: photo, uploaded }]);
      photo = undefined;
    } catch { if (active()) setFailed(true); }
    finally {
      photo?.release();
      if (operation.current === controller) { operation.current = null; setBusy(false); }
    }
  }

  async function remove(item: DraftImage) {
    if (operation.current || !current()) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true); setFailed(false);
    try {
      await deleteZyraImage(session, courseId, item.uploaded, controller.signal);
      if (operation.current !== controller || !current()) return;
      item.local.release();
      update(latest.current.filter(candidate => candidate !== item));
    } catch { if (operation.current === controller && current()) setFailed(true); }
    finally { if (operation.current === controller) { operation.current = null; setBusy(false); } }
  }
  return { items, busy, failed, pick, remove, clear, cancel,
    supported: Platform.OS === "android" || Platform.OS === "ios", warn: () => setFailed(true) };
}

export function ZyraDraftPhotos({ controller, locale, theme, threadId, disabled }: {
  controller: ReturnType<typeof useZyraPhotos>; locale: "en" | "id"; theme: Theme; threadId?: string; disabled: boolean;
}) {
  const en = locale === "en";
  const colors = nativeColors[theme];
  return <View style={styles.wrap}>
    {controller.items.map((item, index) => <View key={item.uploaded.id} style={styles.preview}>
      <Image style={styles.image} source={{ uri: item.local.uri }} accessibilityLabel={en ? `Image ${index + 1}` : `Gambar ${index + 1}`}
        onError={controller.warn} />
      <Button theme={theme} variant="outline" size="icon-sm" accessibilityLabel={en ? `Remove image ${index + 1}` : `Hapus gambar ${index + 1}`}
        disabled={disabled || controller.busy} onPress={() => void controller.remove(item)}
        renderIcon={(color, size) => <NavigationIcon name="close" color={color} size={size} />} />
    </View>)}
    {controller.items.length < ZYRA_IMAGE_MAX_COUNT ? <View style={styles.wrap}>
      <Button theme={theme} size="icon" variant="ghost" accessibilityLabel={en ? "Choose image" : "Pilih gambar"}
        testID="student-zyra-photo-choose" disabled={disabled || controller.busy}
        onPress={() => void controller.pick("library", threadId)} renderIcon={(color, size) => <NavigationIcon name="file" color={color} size={size} />} />
      <Button theme={theme} size="sm" variant="ghost" disabled={disabled || controller.busy} onPress={() => void controller.pick("camera", threadId)}>
        {en ? "Camera" : "Kamera"}
      </Button>
    </View> : null}
    {controller.busy ? <Text accessibilityLiveRegion="polite" style={{ color: colors.mutedForeground }}>{en ? "Preparing image" : "Menyiapkan gambar"}</Text> : null}
    {controller.failed ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{en ? "Check your images and try again." : "Periksa gambar lalu coba lagi."}</Text> : null}
  </View>;
}

export function ZyraSavedPhotos({ items, session, courseId, sessionId, locale, theme, current, selected, select }: PhotoOptions & {
  items: ZyraMessageAttachment[]; sessionId: string; theme: Theme; selected: string | null; select(id: string | null): void;
}) {
  const en = locale === "en";
  const colors = nativeColors[theme];
  const request = useRef<AbortController | null>(null);
  const [preview, setPreview] = useState<{ id: string; uri?: string; failed?: boolean }>();
  useEffect(() => () => { request.current?.abort(); request.current = null; }, [session, sessionId]);
  const previewing = items.some(item => item.id === selected);
  useEffect(() => {
    if (previewing) return;
    request.current?.abort(); request.current = null; setPreview(undefined);
  }, [previewing]);
  async function choose(id: string) {
    if (!current()) return;
    request.current?.abort();
    if (selected === id && preview?.uri) { select(null); setPreview(undefined); return; }
    select(id);
    const controller = new AbortController();
    request.current = controller;
    setPreview({ id });
    try {
      const uri = await readZyraImage(session, courseId, sessionId, id, controller.signal);
      if (request.current === controller && current()) setPreview({ id, uri });
    } catch { if (request.current === controller && current()) setPreview({ id, failed: true }); }
  }
  return <View style={styles.saved}>
    <View style={styles.wrap}>{items.map((item, index) => <Button key={item.id} theme={theme} variant="outline" size="sm"
      isLoading={preview?.id === item.id && !preview.uri && !preview.failed} onPress={() => void choose(item.id)}>
      {en ? `Image ${index + 1}` : `Gambar ${index + 1}`}
    </Button>)}</View>
    {previewing && preview?.uri ? <Image resizeMode="contain" source={{ uri: preview.uri }} style={styles.fullImage}
      accessibilityLabel={en ? "Conversation image" : "Gambar percakapan"} onError={() => setPreview({ id: preview.id, failed: true })} /> : null}
    {previewing && preview?.failed ? <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{en ? "Image unavailable" : "Gambar tidak tersedia"}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  preview: { flexDirection: "row", alignItems: "center", gap: 3 },
  image: { width: 44, height: 44, borderRadius: nativeRadii.md },
  saved: { alignSelf: "flex-end", gap: 4 },
  fullImage: { width: 232, maxWidth: "100%", height: 176 },
});
