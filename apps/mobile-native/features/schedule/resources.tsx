import { randomUUID } from "expo-crypto";
import { File } from "expo-file-system";
import { useIsFocused, useNavigation } from "expo-router";
import { openBrowserAsync } from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import {
  SCHEDULE_ACCOUNT, SCHEDULE_SESSION, safeScheduleLink, scheduleFilePolicy, scheduleResourcePath,
  type NativeScheduleResources, type ScheduleCommand, type ScheduleRole,
} from "../../../../packages/native-parity/schedule/resources";
import { useNativeAccountContext } from "../../auth/use-account-context";
import { useNativeSession } from "../../auth/session-provider";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import type { DraftDocument } from "../../device/file-controller";
import { scopedFiles } from "../../device/files";
import { useProtectedInteraction } from "../../routing/protected-interaction";
import { nativeTypography } from "../../typography";

type ScheduleResource = NativeScheduleResources["resources"][number];
type Theme = keyof typeof nativeColors;
type Attempt = { document: DraftDocument; requestId: string };
type Notice = { text: string; error: boolean };
const styles = StyleSheet.create({
  stack: { gap: 8 },
  line: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  row: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8, gap: 4 },
});

class ScheduleFailure extends Error {
  constructor(readonly status: number) { super("Schedule resources"); }
}

export function ScheduleResources({ bookingId, role, theme, onUpdated }: {
  bookingId: string; role: ScheduleRole; theme: Theme; onUpdated?(): void;
}) {
  const { transport, getSnapshot, revalidating } = useNativeSession();
  const { context } = useNativeAccountContext();
  const { suspended, canInteract } = useProtectedInteraction();
  const focused = useIsFocused();
  const navigation = useNavigation();
  const colors = nativeColors[theme];
  const locale = context?.locale ?? "id";
  const tr = (id: string, en: string) => locale === "en" ? en : id;
  const path = scheduleResourcePath(role, bookingId);
  const scope = transport?.scope;
  const verified = Boolean(focused && !suspended && !revalidating && transport?.isCurrent() &&
    context && context.roles.includes(role) && context.accountId === scope?.accountId && context.sessionId === scope?.sessionId);
  const verify = useRef(verified);
  verify.current = verified;
  const checkInteraction = useRef(canInteract);
  checkInteraction.current = canInteract;
  const [data, setData] = useState<NativeScheduleResources>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const [refresh, setRefresh] = useState(0);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [selected, setSelected] = useState<Attempt>();
  const [form, setForm] = useState<"link" | "recording" | "summary">();
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [remove, setRemove] = useState<string>();
  const activeOperation = useRef<AbortController | null>(null);
  const staged = useRef<Attempt | undefined>(undefined);
  const isDevice = Platform.OS === "android" || Platform.OS === "ios";

  function setAttempt(next?: Attempt) {
    staged.current?.document.release();
    staged.current = next;
    setSelected(next);
  }

  useEffect(() => {
    setData(undefined);
    setSelected(undefined);
    setBusy(false);
    setNotice(undefined);
    setNeedsRefresh(false);
    setForm(undefined);
    setRemove(undefined);
    return () => {
      activeOperation.current?.abort();
      activeOperation.current = null;
      staged.current?.document.release();
      staged.current = undefined;
    };
  }, [focused, path, transport]);

  useEffect(() => {
    if (!verified || !transport || !scope || !path) return;
    const abort = new AbortController();
    setLoading(true);
    setNeedsRefresh(true);
    const load = async () => {
      const response = await transport.request(path, { signal: abort.signal, retry: "transient-read",
        headers: { [SCHEDULE_ACCOUNT]: scope.accountId, [SCHEDULE_SESSION]: scope.sessionId } });
      try {
        if (!response.ok) throw new ScheduleFailure(response.status);
        const result = await response.json() as NativeScheduleResources;
        if (result?.bookingId !== bookingId || !Array.isArray(result.resources)) throw new ScheduleFailure(503);
        if (abort.signal.aborted || !transport.isCurrent() || !verify.current) return;
        setData(result);
        setNeedsRefresh(false);
      } finally { response.dispose(); }
    };
    void load().catch(error => {
      if (abort.signal.aborted || !transport.isCurrent()) return;
      if (error instanceof ScheduleFailure && [401, 403, 404, 409].includes(error.status)) {
        setData(undefined);
        setAttempt();
        setForm(undefined);
        setNotice({ error: true, text: tr("Sesi tutorial ini tidak dapat diakses.", "This tutorial session is unavailable.") });
      } else {
        setNotice({ error: true, text: tr("Rincian sesi belum termuat. Coba lagi.", "Could not load the session details. Try again.") });
      }
    }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [verified, transport, path, bookingId, refresh, locale]);

  async function run(work: (signal: AbortSignal, bound: () => boolean) => Promise<void>, unknownWrite = false) {
    if (!transport || !verified || !canInteract() || !path || activeOperation.current) return;
    const controller = new AbortController();
    activeOperation.current = controller;
    setBusy(true);
    setNotice(undefined);
    const bound = () => activeOperation.current === controller && !controller.signal.aborted &&
      transport.isCurrent() && navigation.isFocused() && getSnapshot().transport === transport;
    try {
      await work(controller.signal, bound);
    } catch (error) {
      if (!bound()) return;
      const status = error instanceof ScheduleFailure ? error.status : undefined;
      if (status === 401 || status === 403 || status === 404) {
        setData(undefined);
        setAttempt();
        setForm(undefined);
        setNotice({ error: true, text: tr("Sesi tutorial ini tidak dapat diakses.", "This tutorial session is unavailable.") });
      } else if (status === 400 || status === 413 || status === 415) {
        setNotice({ error: true, text: tr("Periksa isian atau pilih berkas PDF, PNG, JPEG, atau WebP hingga 10 MB.", "Check your entries or choose a PDF, PNG, JPEG, or WebP file up to 10 MB.") });
      } else if (unknownWrite) {
        setNeedsRefresh(true);
        setNotice({ error: true, text: tr("Perubahan belum terkonfirmasi. Muat ulang rincian sesi.", "The change is unconfirmed. Reload the session details.") });
      } else {
        setNotice({ error: true, text: tr("Tindakan belum selesai. Coba lagi.", "Could not complete the action. Try again.") });
      }
    } finally {
      if (activeOperation.current === controller) {
        activeOperation.current = null;
        setBusy(false);
      }
    }
  }

  function pick() {
    if (!transport || !path) return;
    void run(async (signal, bound) => {
      const requestId = randomUUID();
      const result = await scopedFiles.pickDocument({
        session: transport, target: { route: path, locale, draftId: requestId },
        signal, isDraftCurrent: bound, policy: scheduleFilePolicy,
      });
      if (result.status === "ready") {
        if (bound()) setAttempt({ document: result.document, requestId });
        else result.document.release();
      } else if (result.status === "error") {
        throw new ScheduleFailure(result.issue === "type" ? 415 : result.issue === "size" ? 413 : 503);
      }
    });
  }

  function save(command?: ScheduleCommand) {
    if (!transport || !scope || !path) return;
    const attachment = staged.current;
    if (!command && !attachment) return;
    void run(async (signal, bound) => {
      const headers = new Headers({ [SCHEDULE_ACCOUNT]: scope.accountId, [SCHEDULE_SESSION]: scope.sessionId });
      let body: FormData | string;
      if (command) {
        headers.set("Content-Type", "application/json");
        body = JSON.stringify(command);
      } else {
        const { document, requestId } = attachment!;
        body = new FormData();
        body.append("file", new File(document.uri), document.name);
        body.append("requestId", requestId);
      }
      const response = await transport.request(path, { method: "POST", body, headers, signal, requiredRole: role });
      try {
        if (!response.ok) throw new ScheduleFailure(response.status);
        const result = await response.json() as { id?: unknown };
        if (typeof result?.id !== "string") throw new ScheduleFailure(503);
        if (!bound()) return;
        if (!command) setAttempt();
        setForm(undefined);
        setRemove(undefined);
        setNotice({ error: false, text: command?.action === "delete"
          ? tr("Materi dihapus.", "Resource removed.") : tr("Perubahan tersimpan.", "Changes saved.") });
        setNeedsRefresh(true);
        setRefresh(value => value + 1);
        if (command?.action === "summary") onUpdated?.();
      } finally { response.dispose(); }
    }, true);
  }

  function open(resource: ScheduleResource) {
    if (!transport) return;
    if (resource.kind !== "file") {
      const url = resource.url && safeScheduleLink(resource.url);
      if (url) void run(async () => { await openBrowserAsync(url); });
      return;
    }
    void run(async (signal, bound) => {
      const result = await scopedFiles.shareAuthorizedDownload({
        session: transport, target: { kind: "schedule-resource", role, bookingId, attachmentId: resource.id },
        policy: scheduleFilePolicy, signal, fileName: resource.label,
        isTargetCurrent: () => bound() && verify.current && checkInteraction.current() && !getSnapshot().revalidating,
      });
      if (result.status === "error") {
        const status = result.issue === "not-found" ? 404 : result.issue === "unauthorized" ? 403 : 503;
        if (status === 404 && bound() && verify.current) {
          setNotice({ error: true, text: tr("Lampiran tidak tersedia.", "The attachment is unavailable.") });
          return;
        }
        throw new ScheduleFailure(status);
      }
      if (result.status === "busy" || result.status === "unavailable") throw new ScheduleFailure(503);
    });
  }

  const heading = (text: string) => <Text accessibilityRole="header" style={[nativeTypography.headingBold, { color: colors.foreground }]}>{text}</Text>;
  const copy = (text: string) => <Text style={[nativeTypography.bodyRegular, { color: colors.foreground }]}>{text}</Text>;
  const unavailable = !verified || loading || busy || needsRefresh;
  const canEdit = Boolean(data?.canWrite && !unavailable);
  const button = (text: string, press: () => void, disabled = unavailable, variant: "outline" | "default" | "destructive" = "outline") =>
    <Button theme={theme} variant={variant} disabled={disabled} onPress={press}>{text}</Button>;

  if (!path || !focused) return null;

  return <View style={styles.stack}>
    {notice ? <Text accessibilityRole={notice.error ? "alert" : undefined} accessibilityLiveRegion="polite"
      style={[nativeTypography.bodyRegular, { color: notice.error ? colors.destructive : colors.foreground }]}>{notice.text}</Text> : null}
    {loading ? <Text accessibilityRole="progressbar" style={{ color: colors.foreground }}>{tr("Memuat rincian sesi…", "Loading session details…")}</Text> : null}
    {verified && !loading && (!data || needsRefresh) ? <View style={styles.line}>
      {button(tr("Muat ulang rincian", "Reload session details"), () => { setNotice(undefined); setRefresh(value => value + 1); }, busy)}
    </View> : null}
    {data && verified ? <>
      {role === "tutor" && data.location ? copy(data.location) : null}
      {role === "tutor" && data.meetUrl && data.status !== "cancelled" && data.status !== "completed" ? <View style={styles.line}>
        {button(tr("Gabung Google Meet", "Join Google Meet"), () => { void run(async () => { await openBrowserAsync(data.meetUrl!); }); })}
      </View> : null}
      {(["pre", "post"] as const).map(phase => {
        const entries = data.resources.filter(resource => resource.phase === phase);
        const note = phase === "pre" ? data.preNotes : data.postNotes;
        if (!entries.length && !note && data.canWrite !== phase) return null;
        return <View key={phase} style={styles.stack}>
          {heading(phase === "pre" ? tr("Persiapan sesi", "Session preparation") : tr("Ringkasan dan materi", "Summary and resources"))}
          {note && (role === "tutor" || phase === "post") ? copy(note) : null}
          {entries.map(resource => <View key={resource.id} style={[styles.row, { borderTopColor: colors.border }]}>
            {resource.available && (resource.kind !== "file" || isDevice)
              ? <Button accessibilityLabel={resource.kind === "file" ? tr(`Simpan atau bagikan ${resource.label}`, `Save or share ${resource.label}`) : resource.label}
                theme={theme} style={{ alignSelf: "flex-start", height: "auto", minHeight: 32 }} variant="ghost" wrapLabel disabled={unavailable}
                onPress={() => open(resource)}>{resource.label}</Button> : copy(resource.label)}
            {resource.canDelete ? <View style={styles.line}>
              {remove === resource.id ? <>
                {button(tr("Konfirmasi hapus", "Confirm removal"), () => save({ action: "delete", id: resource.id }), !canEdit, "destructive")}
                {button(tr("Batal", "Cancel"), () => setRemove(undefined), busy)}
              </> : button(tr("Hapus materi", "Remove resource"), () => setRemove(resource.id), !canEdit)}
            </View> : null}
          </View>)}
        </View>;
      })}
      {data.canWrite ? <View style={styles.line}>
        {isDevice ? button(tr("Pilih lampiran", "Choose attachment"), pick, !canEdit || Boolean(selected)) : null}
        {button(tr("Tambah tautan", "Add link"), () => { setLabel(""); setAddress(""); setForm("link"); }, !canEdit)}
        {data.canWrite === "post" ? <>
          {button(tr("Tambah rekaman", "Add recording"), () => { setLabel(""); setAddress(""); setForm("recording"); }, !canEdit)}
          {button(tr("Edit ringkasan", "Edit summary"), () => { setNotes(data.postNotes ?? ""); setForm("summary"); }, !canEdit)}
        </> : null}
      </View> : null}
      {selected && data.canWrite ? <>
        {copy(selected.document.name)}
        <View style={styles.line}>
          {button(tr("Unggah lampiran", "Upload attachment"), () => save(), !canEdit, "default")}
          {button(tr("Lepas lampiran", "Discard attachment"), () => setAttempt(), busy)}
        </View>
      </> : null}
      {form && data.canWrite ? <View style={styles.stack}>
        {form === "summary"
          ? <Input theme={theme} multiline maxLength={10000} editable={!busy} accessibilityLabel={tr("Ringkasan sesi", "Session summary")}
              value={notes} onChangeText={setNotes} />
          : <>
            <Input theme={theme} maxLength={160} editable={!busy} accessibilityLabel={tr("Judul tautan", "Link title")}
              placeholder={tr("Judul tautan", "Link title")} value={label} onChangeText={setLabel} />
            <Input theme={theme} maxLength={2048} editable={!busy} accessibilityLabel={tr("Alamat tautan", "Link address")}
              placeholder="https://" autoCapitalize="none" keyboardType="url" value={address} onChangeText={setAddress} />
          </>}
        <View style={styles.line}>
          {button(form === "summary" ? tr("Simpan ringkasan dan selesaikan sesi", "Save summary and complete session") : tr("Simpan tautan", "Save link"),
            () => save(form === "summary" ? { action: "summary", notes } : { action: "link", kind: form, label, url: address }),
            !canEdit || (form === "summary" ? !notes.trim() : !label.trim() || !safeScheduleLink(address.trim())), "default")}
          {button(tr("Batal", "Cancel"), () => setForm(undefined), busy)}
        </View>
      </View> : null}
    </> : null}
  </View>;
}
