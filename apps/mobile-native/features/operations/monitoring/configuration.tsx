import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { setStringAsync } from "expo-clipboard";
import {
  MonitoringError, type MonitoringActions, type MonitoringReader, type OfflinePolicy, type OfflineScope, type OfflineSettings, type ShortLink,
} from "../../../../../packages/native-parity/operations/monitoring-contract";
import { Input } from "../../../components/Input";
import { Switch } from "../../../components/Switch";
import { ActionRow, Body, Control, Dialog, List, Options, ReadState, Section, styles, useMonitoringDialog, useMonitoringRead, useMonitoringUi } from "./ui";
import { useMonitoringAction } from "./mutation";
import { ShortLinkQr } from "./link-qr";

type ActionProps = { reader: MonitoringReader; actions?: MonitoringActions };
export type LinkCapabilities = {
  origin: string;
  copy?: (url: string) => Promise<void>;
  renderQr?: (url: string) => ReactNode;
};

export function ShortLinksScreen({ reader, actions, links }: ActionProps & { links?: LinkCapabilities }) {
  const view = useMonitoringRead(reader, { view: "links" });
  const { t, n, date, theme } = useMonitoringUi();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [formError, setFormError] = useState<string>();
  const qrDialog = useMonitoringDialog<ShortLink>();
  const qr = qrDialog.selection?.value;
  const [copied, setCopied] = useState<string>();
  const mutation = useMonitoringAction();
  const copying = useMonitoringAction();
  const slugConflict = mutation.error instanceof MonitoringError && mutation.error.status === 409;
  const shortUrl = (link: ShortLink) => `${links?.origin.replace(/\/$/, "") ?? ""}/s/${encodeURIComponent(link.slug)}`;

  async function copy(url: string) {
    if (links?.copy) await links.copy(url);
    else if (!(await setStringAsync(url))) throw new Error("Clipboard unavailable");
  }

  async function submit() {
    let destination: URL;
    try {
      destination = new URL(url.trim());
      if (!["http:", "https:"].includes(destination.protocol) || destination.username || destination.password || destination.href.length > 2048) throw new Error("Invalid URL");
    } catch {
      setFormError(t("Masukkan tautan HTTP atau HTTPS.", "Enter an HTTP or HTTPS destination."));
      return;
    }
    if (slug.trim() && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(slug.trim())) {
      setFormError(t("Mulai slug dengan huruf atau angka dan gunakan paling banyak 100 karakter.", "Start the slug with a letter or number and use up to 100 characters."));
      return;
    }
    setFormError(undefined);
    if (actions?.createLink && await mutation.run(
      () => actions.createLink!({ url: destination.href, title: title.trim() || null, slug: slug.trim() }),
      view.reload,
    )) {
      setUrl("");
      setTitle("");
      setSlug("");
    }
  }

  return <>
    {actions?.createLink && !view.error && <Section>
      <Body strong>{t("URL tujuan", "Destination URL")}</Body>
      <Input theme={theme} accessibilityLabel={t("URL tujuan", "Destination URL")} value={url} onChangeText={setUrl}
        autoCapitalize="none" keyboardType="url" placeholder="https://..." />
      <Body strong>{t("Judul", "Title")}</Body>
      <Input theme={theme} accessibilityLabel={t("Judul", "Title")} value={title} onChangeText={setTitle} maxLength={500} />
      <Body strong>{t("Slug khusus", "Custom slug")}</Body>
      <Input theme={theme} accessibilityLabel={t("Slug khusus", "Custom slug")} value={slug} onChangeText={setSlug} autoCapitalize="none" maxLength={100} />
      {formError && <View accessibilityRole="alert"><Body error>{formError}</Body></View>}
      <ReadState error={mutation.error} message={slugConflict
        ? t("Slug sudah digunakan. Pilih slug lain.", "This slug is already in use. Choose another.")
        : t("Tautan belum terkonfirmasi. Periksa daftar sebelum mencoba lagi.", "Link creation is unconfirmed. Check the list before trying again.")} />
      <View style={styles.actions}>
        <Control primary label={t("Buat tautan", "Create link")} onPress={() => { void submit(); }}
          busy={mutation.busy} disabled={!url.trim()} />
      </View>
    </Section>}
    {copied && <View accessibilityLiveRegion="polite"><Body>{t(`Disalin: ${copied}`, `Copied: ${copied}`)}</Body></View>}
    <ReadState error={copying.error} message={t("Gagal menyalin tautan.", "Unable to copy the link.")} />
    {view.error || view.loading ? <ReadState {...view} retry={view.reload} /> : view.data?.length ?
      <List>{view.data.map(link => <Section key={link.id}>
        <ActionRow label={link.title || `/s/${link.slug}`}
          detail={`${link.title ? `/s/${link.slug} · ` : ""}${link.url} · ${t(`${n(link.clicks)} klik`, `${n(link.clicks)} clicks`)} · ${date(link.createdAt, true)}`} />
        {links && <View style={styles.actions}>
          <Control label={t("Salin tautan", "Copy link")} disabled={copying.busy}
            onPress={async () => { if (await copying.run(() => copy(shortUrl(link)))) setCopied(`/s/${link.slug}`); }} />
          <Control label={t("Kode QR", "QR code")} onPress={() => qrDialog.open(link, link.id)} focusRef={qrDialog.trigger(link.id)} />
        </View>}
      </Section>)}</List> : <Body muted>{t("Belum ada tautan singkat.", "No short links yet.")}</Body>}
    {qr && <Dialog title={t(`Kode QR untuk /s/${qr.slug}`, `QR code for /s/${qr.slug}`)} visible={qrDialog.selection!.visible}
      onClose={qrDialog.close} onAfterClose={qrDialog.clear} returnFocusRef={qrDialog.returnFocusRef} testID="operations-link-qr-dialog">
      {links?.renderQr?.(shortUrl(qr)) ?? <ShortLinkQr url={shortUrl(qr)} fileName={`qrcode-${qr.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100)}.png`}
        label={t("Kode QR tautan", "Link QR code")} />}
      <Body muted>{shortUrl(qr)}</Body>
    </Dialog>}
  </>;
}

type OfflineNumberKey = keyof Omit<OfflineSettings, "schedule" | "autoCache" | "wifiOnly">;
type OfflineNumberField = { key: OfflineNumberKey; id: string; en: string; unit: number; min: number; max: number };
const hour = 3_600_000;
const day = 24 * hour;
const schedulingFields: OfflineNumberField[] = [
  { key: "metadataMaxAgeMs", id: "Umur metadata (jam)", en: "Metadata age (hours)", unit: hour, min: 1, max: 168 },
  { key: "contentMaxAgeMs", id: "Umur konten (hari)", en: "Content age (days)", unit: day, min: 1, max: 30 },
  { key: "activeCheckIntervalMs", id: "Interval periksa aktif (menit)", en: "Active check interval (minutes)", unit: 60_000, min: 0.5, max: 15 },
];
const storageFields: OfflineNumberField[] = [
  { key: "maxBytes", id: "Kapasitas maksimum (MiB)", en: "Maximum capacity (MiB)", unit: 1024 * 1024, min: 8, max: 1024 },
  { key: "maxEntries", id: "Entri maksimum", en: "Maximum entries", unit: 1, min: 25, max: 1000 },
  { key: "retentionMs", id: "Retensi (hari)", en: "Retention (days)", unit: day, min: 1, max: 90 },
  { key: "accessLeaseMs", id: "Masa izin offline (jam)", en: "Offline access lease (hours)", unit: hour, min: 1, max: 168 },
];

export function OfflineCacheScreen({ reader, actions }: ActionProps) {
  const view = useMonitoringRead(reader, { view: "offline" });
  if (view.error || !view.data) return <ReadState {...view} retry={view.reload} />;
  return <>
    <OfflinePolicyEditor key={view.data.revision} initial={view.data} action={actions?.saveOffline} reload={view.reload} />
    {actions?.revalidateOffline && <OfflineRefresh reader={reader} action={actions.revalidateOffline} />}
  </>;
}

function OfflinePolicyEditor({ initial, action, reload }: {
  initial: OfflinePolicy; action?: NonNullable<MonitoringActions["saveOffline"]>; reload: () => void;
}) {
  const { t, date, theme, n } = useMonitoringUi();
  const [draft, setDraft] = useState<OfflineSettings>(() => {
    const { revision, updatedAt, ...settings } = initial.policy;
    return settings;
  });
  const fields = [...schedulingFields, ...storageFields];
  const [numbers, setNumbers] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map(field => [field.key, String(initial.policy[field.key] / field.unit)])));
  const confirm = useMonitoringDialog<void>();
  const [notice, setNotice] = useState(false);
  const mutation = useMonitoringAction();
  const conflict = (mutation.error as { status?: number } | undefined)?.status === 409;
  const numberValue = (field: OfflineNumberField) => Number(numbers[field.key].replace(",", "."));
  const valid = fields.every(field => {
    const value = numberValue(field);
    return value >= field.min && value <= field.max && Number.isInteger(value * field.unit);
  });
  const dirty = fields.some(field => numberValue(field) * field.unit !== initial.policy[field.key])
    || draft.autoCache !== initial.policy.autoCache || draft.wifiOnly !== initial.policy.wifiOnly
    || JSON.stringify(draft.schedule) !== JSON.stringify(initial.policy.schedule);
  const formatField = (field: OfflineNumberField) => {
    const label = t(field.id, field.en);
    return <Section key={field.key}>
      <Body strong>{label}</Body>
      {action ? <Input theme={theme} accessibilityLabel={label} inputMode="decimal"
        value={numbers[field.key]} onChangeText={value => setNumbers(previous => ({ ...previous, [field.key]: value }))} /> :
        <Body>{n(initial.policy[field.key] / field.unit)}</Body>}
    </Section>;
  };
  const frequency = draft.schedule.frequency;
  const days = t("Minggu Senin Selasa Rabu Kamis Jumat Sabtu", "Sunday Monday Tuesday Wednesday Thursday Friday Saturday").split(" ");
  const updateSchedule = (next: Partial<OfflineSettings["schedule"]>) =>
    setDraft(value => ({ ...value, schedule: { ...value.schedule, ...next } }));
  const scheduleTime = `${String(draft.schedule.hour).padStart(2, "0")}:00 WIB`;

  return <>
    <Body muted>{t(`Revisi ${initial.revision}`, `Revision ${initial.revision}`)}{initial.policy.updatedAt ? ` · ${date(initial.policy.updatedAt)}` : ""}</Body>
    <Section title={t("Jadwal pembaruan", "Refresh schedule")}>
      {action ? <>
        <Options label={t("Frekuensi", "Frequency")} value={frequency}
          items={[{ value: "daily", label: t("Harian", "Daily") }, { value: "weekly", label: t("Mingguan", "Weekly") }]}
          onSelect={value => updateSchedule({ frequency: value })} />
        {frequency === "weekly" && <Options label={t("Hari", "Day")} value={draft.schedule.weekday}
          items={days.map((label, value) => ({ label, value }))} onSelect={weekday => updateSchedule({ weekday })} />}
        <Options label={t("Jam (WIB)", "Hour (WIB)")} value={draft.schedule.hour}
          items={Array.from({ length: 24 }, (_, value) => ({ value, label: `${String(value).padStart(2, "0")}:00` }))}
          onSelect={hour => updateSchedule({ hour })} />
      </> : <ActionRow label={frequency === "daily" ? t("Harian", "Daily") : days[draft.schedule.weekday]} detail={scheduleTime} />}
      {schedulingFields.map(formatField)}
    </Section>
    <Section title={t("Kapasitas dan akses", "Storage and access")}>
      {storageFields.map(formatField)}
      {([["autoCache", t("Cache otomatis", "Automatic cache")], ["wifiOnly", t("Wi-Fi saja", "Wi-Fi only")]] as const).map(([key, label]) =>
        <View key={key} style={styles.header}>
          <Body strong>{label}</Body>
          <Switch theme={theme} accessibilityLabel={label} checked={draft[key]} disabled={!action}
            onCheckedChange={value => setDraft(previous => ({ ...previous, [key]: value }))} />
        </View>)}
    </Section>
    <ReadState error={mutation.error}
      message={conflict ? t("Kebijakan berubah. Muat versi terbaru.", "The policy changed. Reload the latest revision.") : t("Kebijakan belum terkonfirmasi. Muat ulang sebelum mencoba lagi.", "The policy change is unconfirmed. Reload before trying again.")}
      retry={() => { mutation.clearError(); reload(); }} />
    {notice && <View accessibilityLiveRegion="polite"><Body>{t("Kebijakan disimpan.", "Policy saved.")}</Body></View>}
    {!valid && <View accessibilityRole="alert"><Body error>{t("Periksa rentang nilai kebijakan.", "Check the policy value ranges.")}</Body></View>}
    {action && <View style={styles.actions}><Control primary label={t("Simpan kebijakan", "Save policy")}
      disabled={!valid || !dirty || conflict || Boolean(mutation.error)} busy={mutation.busy}
      onPress={() => confirm.open(undefined, "policy")} focusRef={confirm.trigger("policy")} /></View>}
    <Dialog title={t("Simpan perubahan kebijakan?", "Save policy changes?")} visible={confirm.selection?.visible ?? false} onClose={confirm.close}
      onAfterClose={confirm.clear} returnFocusRef={confirm.returnFocusRef} dismissDisabled={mutation.busy}>
      <Body>{t("Perubahan berlaku untuk penyimpanan offline pengguna.", "Changes apply to users' offline storage.")}</Body>
      <Control primary label={t("Konfirmasi", "Confirm")} busy={mutation.busy} onPress={async () => {
        if (!action || !valid) return;
        const policy = { ...draft };
        for (const field of fields) policy[field.key] = numberValue(field) * field.unit;
        setNotice(await mutation.run(() => action({ policy, expectedRevision: initial.revision }), reload));
        confirm.close();
      }} />
    </Dialog>
  </>;
}

function OfflineRefresh({ reader, action }: { reader: MonitoringReader; action: NonNullable<MonitoringActions["revalidateOffline"]> }) {
  const [scope, setScope] = useState<OfflineScope["scope"]>("all");
  const [course, setCourse] = useState("");
  const [resource, setResource] = useState("");
  const confirm = useMonitoringDialog<void>();
  const [queued, setQueued] = useState(false);
  const mutation = useMonitoringAction();
  const { t } = useMonitoringUi();
  return <Section title={t("Pemutakhiran manual", "Manual revalidation")}>
    <Options label={t("Cakupan", "Scope")} value={scope}
      items={[
        { value: "all", label: t("Semua data", "All data") },
        { value: "course", label: t("Mata kuliah", "Course") },
        { value: "resource", label: t("Sumber", "Resource") },
      ]}
      onSelect={value => { setScope(value); setResource(""); setQueued(false); }} />
    {scope !== "all" && <OfflineScopeFields key={scope} reader={reader} scope={scope} course={course} resource={resource}
      setCourse={value => { setCourse(value); setResource(""); }} setResource={setResource} />}
    <ReadState error={mutation.error} message={t("Permintaan belum terkonfirmasi.", "The request is unconfirmed.")} />
    {queued && <View accessibilityLiveRegion="polite"><Body>{t("Pemutakhiran dijadwalkan.", "Revalidation scheduled.")}</Body></View>}
    <View style={styles.actions}><Control label={t("Jadwalkan pemutakhiran", "Schedule revalidation")}
      busy={mutation.busy} disabled={scope === "course" ? !course : scope === "resource" ? !course || !resource : false}
      onPress={() => confirm.open(undefined, "refresh")} focusRef={confirm.trigger("refresh")} /></View>
    <Dialog title={t("Jadwalkan pemutakhiran?", "Schedule revalidation?")} visible={confirm.selection?.visible ?? false} onClose={confirm.close}
      onAfterClose={confirm.clear} returnFocusRef={confirm.returnFocusRef} dismissDisabled={mutation.busy}>
      <Body>{scope === "all" ? t("Semua data offline", "All offline data") : course}</Body>
      <Control primary label={t("Konfirmasi", "Confirm")} busy={mutation.busy} onPress={async () => {
        const [kind, resourceId] = resource.split("|");
        const input: OfflineScope = scope === "all" ? { scope }
          : scope === "course" ? { scope, courseId: course }
          : { scope, courseId: course, kind, resourceId };
        setQueued(await mutation.run(() => action(input)));
        confirm.close();
      }} />
    </Dialog>
  </Section>;
}

function OfflineScopeFields({ reader, scope, course, resource, setCourse, setResource }: {
  reader: MonitoringReader; scope: "course" | "resource"; course: string; resource: string;
  setCourse: (value: string) => void; setResource: (value: string) => void;
}) {
  const { t } = useMonitoringUi();
  const catalog = useMonitoringRead(reader, { view: "offlineCatalog", id: scope === "resource" ? course || undefined : undefined });
  return <>
    {catalog.loading || catalog.error ? <ReadState {...catalog} retry={catalog.reload} /> : catalog.data && <>
      <Options label={t("Mata kuliah", "Course")} value={course} placeholder={t("Pilih mata kuliah", "Choose a course")}
        items={catalog.data.courses.map(item => ({ value: item.id, label: item.title }))} onSelect={setCourse} />
      {scope === "resource" && course && <Options label={t("Sumber", "Resource")} value={resource}
        placeholder={t("Pilih sumber", "Choose a resource")}
        items={(catalog.data.resources ?? []).map(item => ({ value: `${item.kind}|${item.id}`, label: item.title }))} onSelect={setResource} />}
    </>}
  </>;
}
