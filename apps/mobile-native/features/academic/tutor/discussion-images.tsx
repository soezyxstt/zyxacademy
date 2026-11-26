import { File } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Image, View } from "react-native";
import type { DiscussionAttachment } from "../../../../../lib/discussions/contracts";
import { DISCUSSION_IMAGE_MAX_BYTES } from "../../../../../lib/discussions/image-limits";
import { Button } from "../../../components/Button";
import { scopedFiles } from "../../../device/files";
import type { NativeSessionTransport } from "../../../network/transport";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { Label, tutorLayout } from "./ui";

const imagePolicy = { mimeTypes: ["image/jpeg", "image/png", "image/webp"], maxBytes: DISCUSSION_IMAGE_MAX_BYTES } as const;
type Images = ReturnType<typeof connectTutorDiscussionImages>;
export const TutorDiscussionImages = createContext<Images | null>(null);

export function connectTutorDiscussionImages(session: NativeSessionTransport, locale: "id" | "en", role: "tutor" | "admin" = "tutor") {
  async function pick(channelId: string, threadId: string, signal: AbortSignal): Promise<{ id: string; name: string } | null> {
    const selected = await scopedFiles.pickDocument({
      session, target: { route: `/${role}/discussions`, locale, draftId: threadId + ":" + randomUUID() },
      policy: imagePolicy, signal, isDraftCurrent: () => !signal.aborted && session.isCurrent(),
    });
    if (selected.status === "cancelled" || selected.status === "stale") return null;
    if (selected.status !== "ready") throw new Error(selected.status === "error" ? selected.issue : "unavailable");
    const { document } = selected;
    let response: Awaited<ReturnType<typeof session.request>> | undefined;
    try {
      const form = new FormData();
      form.append("channelId", channelId);
      form.append("file", new File(document.uri));
      response = await session.request("/api/discussions/attachments", {
        method: "POST", body: form, signal, requiredRole: role, headers: { Origin: session.scope.origin },
      });
      if (!response.ok) throw new Error(response.status === 413 ? "size" : "unavailable");
      const result = await response.json();
      session.assertCurrent();
      if (signal.aborted) return null;
      if (!result || typeof result !== "object" || !("id" in result) || typeof result.id !== "string" ||
          !("name" in result) || typeof result.name !== "string") throw new Error("unavailable");
      return { id: result.id, name: result.name };
    } finally {
      response?.dispose();
      document.release();
    }
  }

  async function preview(image: DiscussionAttachment, signal: AbortSignal) {
    const path = "/api/discussions/attachments/" + encodeURIComponent(image.id) + (image.previewAvailable ? "?preview=1" : "");
    const response = await session.request(path, { signal, retry: "transient-read", requiredRole: role });
    try {
      const mime = response.headers.get("content-type")?.split(";")[0] ?? "";
      if (!response.ok || !imagePolicy.mimeTypes.some(type => type === mime) ||
        Number(response.headers.get("content-length")) > imagePolicy.maxBytes) throw new Error("unavailable");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length || bytes.length > imagePolicy.maxBytes) throw new Error("unavailable");
      session.assertCurrent();
      const chunks: string[] = [];
      for (let offset = 0; offset < bytes.length; offset += 8192) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
      return `data:${mime};base64,${globalThis.btoa(chunks.join(""))}`;
    } finally {
      response.dispose();
    }
  }

  return {
    pick, preview,
    share: (attachmentId: string, signal: AbortSignal) => scopedFiles.shareAuthorizedDownload({
      session: { ...session, request: (path, init) => session.request(path, { ...init, requiredRole: role }) },
      target: { kind: "discussion-image", attachmentId }, policy: imagePolicy, signal,
      isTargetCurrent: () => !signal.aborted && session.isCurrent(),
    }),
  };
}

export function TutorDiscussionImage({ image, theme }: { image: DiscussionAttachment; theme: "light" | "dark" }) {
  const images = useContext(TutorDiscussionImages);
  const { canInteract } = useProtectedInteraction();
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), [images, image.id]);
  async function open(original: boolean) {
    if (!images || request.current || !canInteract()) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError("");
    try {
      if (original) {
        const result = await images.share(image.id, controller.signal);
        if (result.status === "error" || result.status === "unavailable") throw new Error("unavailable");
      } else {
        const source = await images.preview(image, controller.signal);
        if (!controller.signal.aborted) setUrl(source);
      }
    } catch {
      if (!controller.signal.aborted) setError("Gambar tidak dapat dibuka. Coba lagi.");
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  if (!images) return null;
  return <View style={tutorLayout.group}>
    {url ? <Image source={{ uri: url }} accessibilityLabel={image.name} accessible resizeMode="contain"
      style={{ width: "100%", aspectRatio: Math.max(0.5, Math.min(2, image.width / image.height)) }}
      onError={() => { setUrl(undefined); setError("Gambar gagal dimuat."); }} />
      : <Button theme={theme} variant="outline" isLoading={busy} onPress={() => void open(false)}>{image.name}</Button>}
    {url ? <Button theme={theme} variant="outline" isLoading={busy} onPress={() => void open(true)}>Buka gambar asli</Button> : null}
    {error ? <Label theme={theme}>{error}</Label> : null}
  </View>;
}
