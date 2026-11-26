import { useState } from "react";
import { View } from "react-native";
import { resolveSettingsTab, type SettingsTab } from "../../../../../packages/student-community/settings-tabs";
import { parseQuietHours, type QuietHours } from "../../../../../packages/student-community/quiet-hours";
import { isTutorialEmailSchedule } from "../../../../../packages/student-community/tutorial-email-schedule";
import { activityPreferenceKeys, emailPreferenceKeys, feedbackCategories } from "../../../../../packages/native-parity/student/community/contracts";
import type { ActivityPreferenceKey, FeedbackCategory, NotificationPreferences, TutorialEmailSchedule } from "../../../../../packages/native-parity/student/community/contracts";
import { ProfileEditorPanel } from "./profile";
import { Action, Actions, Choices, Copy, Field, Notice, Page, Remote, Toggle, communityPath, operationResult, post, readJson, styles, useCommunity, useOperation, useRemote } from "./ui";

const quietHoursEndpoint = "/api/notifications/quiet-hours";

function formatClock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
function parseClock(clock: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function QuietHoursForm({ initial }: { initial: QuietHours }) {
  const { tr, request } = useCommunity();
  const action = useOperation();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [start, setStart] = useState(formatClock(initial.startMinute));
  const [end, setEnd] = useState(formatClock(initial.endMinute));
  const [timeZone, setTimeZone] = useState(initial.timeZone);
  const [saved, setSaved] = useState(initial);
  const zones = new Set(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura", Intl.DateTimeFormat().resolvedOptions().timeZone, initial.timeZone]);
  const startMinute = parseClock(start);
  const endMinute = parseClock(end);
  const preference = parseQuietHours({ enabled, startMinute, endMinute, timeZone });
  const dirty = enabled !== saved.enabled || startMinute !== saved.startMinute || endMinute !== saved.endMinute || timeZone !== saved.timeZone;
  return <View style={styles.block}>
    <Toggle label={tr("Aktifkan jam tenang", "Enable quiet hours")} value={enabled} onChange={setEnabled} disabled={action.pending} />
    {enabled && <>
      <Field label={tr("Mulai (JJ:MM)", "From (HH:MM)")} value={start} onChangeText={setStart} maxLength={5} editable={!action.pending} />
      <Field label={tr("Sampai (JJ:MM)", "Until (HH:MM)")} value={end} onChangeText={setEnd} maxLength={5} editable={!action.pending} />
      <Copy kind="strong">{tr("Zona waktu", "Time zone")}</Copy>
      <Choices value={timeZone} options={[...zones].filter(Boolean).map(value => ({ value, label: value.replaceAll("_", " ") }))}
        onSelect={setTimeZone} disabled={action.pending} />
      {!preference && <Copy kind="error">{tr("Pilih jam mulai dan selesai yang berbeda.", "Choose different start and end times.")}</Copy>}
      {preference && preference.startMinute > preference.endMinute && <Copy kind="muted">{tr("Berakhir keesokan harinya.", "Ends the next morning.")}</Copy>}
    </>}
    <Notice notice={action.notice} />
    <Actions><Action label={tr("Simpan jam tenang", "Save quiet hours")} disabled={!preference || !dirty} busy={action.pending}
      onPress={() => void action.run(async () => {
        if (!preference) return;
        const result = parseQuietHours(await readJson<unknown>(request, quietHoursEndpoint, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(preference),
        }));
        if (!result) throw new Error("Invalid quiet hours response");
        setSaved(result);
      }, tr("Jam tenang tersimpan.", "Quiet hours saved."))} /></Actions>
  </View>;
}
function QuietHoursPanel() {
  const state = useRemote<unknown>(quietHoursEndpoint);
  const data = state.data === undefined ? undefined : parseQuietHours(state.data);
  const { tr } = useCommunity();
  return <>
    <Copy kind="heading">{tr("Jam tenang", "Quiet hours")}</Copy>
    <Copy kind="muted">{tr("Jam tenang berlaku di semua perangkat. Ringkasan notifikasi dikirim setelahnya.", "Quiet hours apply across devices. A notification summary is sent afterwards.")}</Copy>
    <Remote state={{ ...state, data: data ?? undefined, error: data === null ? new Error("Invalid quiet hours response") : state.error }}>
      {data => <QuietHoursForm initial={data} />}
    </Remote>
  </>;
}

function NotificationsForm({ data }: { data: NotificationPreferences }) {
  const { tr, request, navigate, devicePush } = useCommunity();
  const state = useOperation();
  const [email, setEmail] = useState(data.email);
  const [activity, setActivity] = useState(data.activity);
  const [mode, setMode] = useState<TutorialEmailSchedule["mode"]>(data.activity.tutorialEmailSchedule.mode);
  const [lead, setLead] = useState(String(data.activity.tutorialEmailSchedule.leadMinutes));
  const [interval, setInterval] = useState(String(data.activity.tutorialEmailSchedule.intervalMinutes));
  const schedule = { mode, leadMinutes: Number(lead), intervalMinutes: Number(interval) };
  const saved = tr("Preferensi tersimpan.", "Preferences saved.");
  const emailLabels = {
    emailEnabled: tr("Email opsional", "Optional email"), courseUpdates: tr("Pembaruan kursus", "Course updates"),
    eventsAndSchedules: tr("Acara dan jadwal", "Events and schedules"), learningReminders: tr("Pengingat belajar", "Learning reminders"),
    newsAndOffers: tr("Berita dan penawaran", "News and offers"),
  };
  const activityLabels = {
    discussionsEnabled: tr("Diskusi", "Discussions"), flashcardsEnabled: tr("Pengingat flashcard", "Flashcard reminders"),
    tutorAvailabilityEnabled: tr("Ketersediaan tutor", "Tutor availability"),
    tutorialSessionEmailEnabled: tr("Email pengingat tutorial", "Tutorial reminder emails"),
  };
  const toggleActivity = (key: ActivityPreferenceKey, enabled: boolean) => void state.run(async () => {
    operationResult(await post(request, "notification-activity", { key, enabled }));
    setActivity(value => ({ ...value, [key]: enabled }));
  }, saved);
  return <>
    {devicePush && <View style={styles.block}>
      <Copy kind="heading">{tr("Notifikasi perangkat", "Device notifications")}</Copy>
      <Copy>{devicePush.status?.status === "granted"
        ? devicePush.status.registered && devicePush.status.transportActive
          ? tr("Perangkat terhubung.", "Device connected.")
          : tr("Izin diberikan. Pendaftaran perangkat belum aktif.", "Permission granted. Device registration is pending.")
        : devicePush.status?.status === "denied" ? tr("Izin perangkat ditolak.", "Device permission denied.")
          : devicePush.status?.status === "unsupported" ? tr("Notifikasi tidak didukung perangkat ini.", "This device does not support push notifications.")
            : tr("Izin perangkat belum diberikan.", "Device permission has not been granted.")}</Copy>
      <Actions>
        {devicePush.status?.canAskAgain && devicePush.status.status !== "granted" && <Action
          label={tr("Izinkan notifikasi", "Allow notifications")} busy={state.pending}
          onPress={() => void state.run(async () => { await devicePush.requestPermission(); })} />}
        <Action label={tr("Perbarui status", "Refresh status")} disabled={state.pending}
          onPress={() => void state.run(async () => { await devicePush.refresh(); })} />
      </Actions>
    </View>}
    <Copy kind="heading">{tr("Aktivitas", "Activity")}</Copy>
    {activityPreferenceKeys.filter(key => key !== "tutorAvailabilityEnabled" || data.canUseTutorialAvailability).map(key => <Toggle
      key={key} label={activityLabels[key]} value={activity[key]} disabled={state.pending}
      onChange={enabled => toggleActivity(key, enabled)} />)}
    {activity.tutorialSessionEmailEnabled && <View style={styles.block}>
      <Copy kind="strong">{tr("Frekuensi pengingat tutorial", "Tutorial reminder frequency")}</Copy>
      <Choices value={mode} options={[{ value: "once", label: tr("Sekali", "Once") }, { value: "repeat", label: tr("Berulang", "Repeat") }]}
        onSelect={setMode} disabled={state.pending} />
      <Field label={tr("Menit sebelum sesi", "Minutes before the session")} value={lead} onChangeText={setLead} keyboardType="number-pad" maxLength={4} />
      {mode === "repeat" && <Field label={tr("Jeda pengingat (menit)", "Reminder interval (minutes)")} value={interval} onChangeText={setInterval}
        keyboardType="number-pad" maxLength={4} />}
      <Actions><Action label={tr("Simpan jadwal pengingat", "Save reminder timing")} disabled={state.pending || !isTutorialEmailSchedule(schedule)}
        onPress={() => void state.run(async () => operationResult(await post(request, "notification-timing", schedule)), saved)} /></Actions>
    </View>}
    <Copy kind="heading">{tr("Email opsional", "Optional email")}</Copy>
    {emailPreferenceKeys.map(key => <Toggle key={key} label={emailLabels[key]} value={email[key]}
      disabled={state.pending || (key !== "emailEnabled" && !email.emailEnabled)} onChange={value => setEmail({ ...email, [key]: value })} />)}
    <Actions><Action label={tr("Simpan preferensi email", "Save email preferences")} mode="default" busy={state.pending}
      onPress={() => void state.run(async () => operationResult(await post(request, "notification-email", email)), saved)} /></Actions>
    <Notice notice={state.notice} />
    <QuietHoursPanel />
    <Actions><Action label={tr("Notifikasi browser", "Browser notifications")} onPress={() => navigate("/settings/notifications/browser")} /></Actions>
  </>;
}

function NotificationsPanel() {
  const state = useRemote<NotificationPreferences>(communityPath("notifications"));
  return <Remote state={state}>{data => <NotificationsForm data={data} />}</Remote>;
}
export function NotificationsScreen() {
  const { tr } = useCommunity();
  return <Page title={tr("Preferensi notifikasi", "Notification preferences")}><NotificationsPanel /></Page>;
}

export function BrowserNotificationsScreen() {
  const { tr, openExternal } = useCommunity();
  return <Page title={tr("Notifikasi browser", "Browser notifications")}>
    <Copy>{tr("Buka browser yang ingin Anda jeda notifikasinya.", "Open the browser whose notifications you want to pause.")}</Copy>
    {openExternal
      ? <Actions><Action label={tr("Buka di browser", "Open in browser")} mode="default"
        onPress={() => openExternal("/settings/notifications/browser")} /></Actions>
      : <Copy kind="muted">{tr("Browser perangkat belum tersedia.", "The device browser is unavailable.")}</Copy>}
  </Page>;
}

function GeneralPanel() {
  const { tr, request, session, devicePreferences, onLocaleChanged } = useCommunity();
  const [selected, setSelected] = useState<"en" | "id">(session.locale === "en" ? "en" : "id");
  const state = useOperation();
  return <>
    <Copy kind="heading">{tr("Bahasa", "Language")}</Copy>
    <Choices value={selected} options={[{ value: "id", label: "Bahasa Indonesia" }, { value: "en", label: "English" }]}
      disabled={state.pending} onSelect={locale => void state.run(async () => {
        operationResult(await post(request, "locale", { locale }));
        setSelected(locale);
        onLocaleChanged?.(locale);
      }, tr("Bahasa tersimpan.", "Language saved."))} />
    {devicePreferences && <Toggle label={tr("Getaran", "Haptics")} value={devicePreferences.haptics} onChange={devicePreferences.setHaptics} />}
    <Notice notice={state.notice} />
  </>;
}

function AppearancePanel() {
  const { tr, devicePreferences } = useCommunity();
  return <>
    <Copy kind="heading">{tr("Tema", "Theme")}</Copy>
    {devicePreferences ? <Choices value={devicePreferences.theme} options={[
      { value: "system", label: tr("Sistem", "System") }, { value: "light", label: tr("Terang", "Light") }, { value: "dark", label: tr("Gelap", "Dark") },
    ]} onSelect={devicePreferences.setTheme} />
      : <Copy kind="muted">{tr("Tema mengikuti pengaturan perangkat.", "The theme follows your device settings.")}</Copy>}
  </>;
}

export function SettingsScreen() {
  const { route, navigate, tr } = useCommunity();
  const tab = resolveSettingsTab(route.query.tab);
  const tabs: { value: SettingsTab; label: string }[] = [
    { value: "general", label: tr("Umum", "General") }, { value: "appearance", label: tr("Tampilan", "Appearance") },
    { value: "notifications", label: tr("Notifikasi", "Notifications") }, { value: "profile", label: tr("Profil", "Profile") },
  ];
  return <Page title={tr("Pengaturan", "Settings")}>
    <Choices value={tab} options={tabs} onSelect={value => navigate(value === "general" ? "/settings" : `/settings?tab=${value}`)} />
    {tab === "general" && <GeneralPanel />}
    {tab === "appearance" && <AppearancePanel />}
    {tab === "notifications" && <NotificationsPanel />}
    {tab === "profile" && <ProfileEditorPanel />}
  </Page>;
}

export function FeedbackScreen() {
  const { request, tr } = useCommunity();
  const state = useOperation();
  const [category, setCategory] = useState<FeedbackCategory>("materi");
  const [rating, setRating] = useState("5");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const labels = {
    materi: tr("Materi", "Course materials"), kuis: tr("Kuis", "Quizzes"), tutor: tr("Tutor", "Tutors"),
    fitur: tr("Fitur", "Platform features"), lainnya: tr("Lainnya", "Other"),
  };
  return <Page title={tr("Masukan", "Feedback")}>
    {sent ? <Copy kind="strong">{tr("Masukan terkirim.", "Feedback sent.")}</Copy> : <>
      <Copy kind="strong">{tr("Kategori", "Category")}</Copy>
      <Choices value={category} options={feedbackCategories.map(value => ({ value, label: labels[value] }))} onSelect={setCategory} disabled={state.pending} />
      <Copy kind="strong">{tr("Penilaian", "Rating")}</Copy>
      <Choices value={rating} options={["1", "2", "3", "4", "5"].map(value => ({ value, label: value }))} onSelect={setRating} disabled={state.pending} />
      <Field label={tr("Masukan Anda", "Your feedback")} testID="student-feedback-message" value={message} onChangeText={setMessage} maxLength={5000} editable={!state.pending} multiline />
      <Notice notice={state.notice} />
      <Actions><Action label={tr("Kirim masukan", "Send feedback")} mode="default" busy={state.pending} disabled={message.trim().length < 5}
        onPress={() => void state.run(async () => {
          operationResult(await post(request, "feedback", { category, rating: Number(rating), message: message.trim() }));
          setSent(true);
        }, undefined, tr("Pengiriman belum terkonfirmasi. Masukan mungkin sudah diterima.", "Delivery is unconfirmed. Your feedback may have arrived."))} /></Actions>
    </>}
  </Page>;
}
