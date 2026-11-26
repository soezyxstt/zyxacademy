import { fetch as expoFetch } from "expo/fetch";
import { openBrowserAsync } from "expo-web-browser";
import { Image } from "react-native";
import { useEffect, useState } from "react";
import { pkaInstagramProfile, pkaMeetingLink, pkaProofTarget, pkaRegistrationSheet } from "../../../../../packages/academic/pka-registrations";
import type { LiveRow } from "../../../../../packages/native-parity/academic/administration/live";
import { useNativeSession } from "../../../auth/session-provider";
import { inlineImage } from "../../../network/inline-image";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import type { AcademicTransport } from "../client";
import { NativeSpreadsheetExport } from "../spreadsheet-export";
import { Action, Ink } from "./ui";

export function PkaRegistrationExport({ transport, search, count }: { transport: AcademicTransport; search: string; count: number }) {
  const applied = search.trim().slice(0, 200);
  return <NativeSpreadsheetExport entityType="pka" entityId="tutorial-pka" transport={transport} count={count} filtered={Boolean(applied)}
    build={async signal => {
      const result = await transport.get("/api/native/academic-administration/registrations/export?" + new URLSearchParams({ search: applied }), signal);
      if (!result.ok) throw new Error("Registrations unavailable");
      return pkaRegistrationSheet(await result.json(), applied, transport.origin, transport.locale);
    }} />;
}

export function PkaBrowserLink({ row, transport }: { row: LiveRow; transport: AcademicTransport }) {
  const { transport: session, revalidating } = useNativeSession();
  const { canInteract } = useProtectedInteraction();
  const [failed, setFailed] = useState(false);
  const profile = pkaInstagramProfile(row.pkaInstagram);
  const url = profile ?? pkaMeetingLink(row.pkaScheduleEdit?.meetLink);
  if (!url) return null;
  return <>
    <Action label={profile ? "Buka profil Instagram" : "Buka pertemuan"} disabled={revalidating} onPress={() => {
      if (!canInteract() || revalidating || !session?.isCurrent() || session.scope.accountId !== transport.accountId ||
          session.scope.origin !== transport.origin) return;
      setFailed(false);
      void openBrowserAsync(url).catch(() => setFailed(true));
    }} />
    {failed && <Ink kind="meta">Tautan belum dapat dibuka. Coba lagi.</Ink>}
  </>;
}

export function RegistrationProof({ row, transport }: { row: LiveRow; transport: AcademicTransport }) {
  const { transport: session, revalidating } = useNativeSession();
  const { suspended } = useProtectedInteraction();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ uri: string } | "unavailable" | null>(null);
  const available = !suspended && !revalidating && session?.isCurrent() && session.scope.accountId === transport.accountId && session.scope.origin === transport.origin;
  useEffect(() => {
    const job = new AbortController();
    setResult(null);
    const source = pkaProofTarget(row.pkaProof ?? "", transport.origin);
    if (attempt && available && session && source) void (async () => {
      try {
        const response = source.path
          ? await session.request(source.path, { signal: job.signal, requiredRole: "admin" })
          : await expoFetch(source.href, { credentials: "omit", redirect: "error", signal: job.signal });
        try {
          const mime = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
          if (!mime || !["image/png", "image/webp", "image/jpeg", "image/gif", "image/avif"].includes(mime)) throw new Error("Image unavailable");
          const uri = await inlineImage(response, mime, 10 * 1024 * 1024);
          session.assertCurrent();
          if (!job.signal.aborted) setResult({ uri });
        } finally { if ("dispose" in response) response.dispose(); }
      } catch { if (!job.signal.aborted) setResult("unavailable"); }
    })();
    return () => job.abort();
  }, [attempt, row.pkaProof, transport, session, available]);
  if (!pkaProofTarget(row.pkaProof ?? "", transport.origin)) return <Ink kind="meta">Bukti tidak tersedia.</Ink>;
  if (!attempt || result === "unavailable") return <>
    {result === "unavailable" && <Ink kind="meta">Bukti gambar tidak dapat dimuat.</Ink>}
    <Action label={attempt ? "Muat ulang bukti" : "Lihat bukti follow"} disabled={!available} onPress={() => setAttempt(n => n + 1)} />
  </>;
  if (!available || !result) return <Ink kind="meta">Memuat bukti…</Ink>;
  return <Image source={{ uri: result.uri }} accessible accessibilityLabel={"Bukti follow " + row.title} resizeMode="contain"
    style={{ width: "100%", height: 320 }} onError={() => setResult("unavailable")} />;
}
