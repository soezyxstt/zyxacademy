import { useNavigation } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, View } from "react-native";
import en from "../../../../../messages/en/student.json";
import id from "../../../../../messages/id/student.json";
import { useNativeSession } from "../../../auth/session-provider";
import { useNativeAccountContext } from "../../../auth/use-account-context";
import { ToggleGroup, ToggleGroupItem } from "../../../components/ToggleGroup";
import { isStudyReminderAccount } from "../../../device/reminder-eligibility";
import { expoReminders, type ReminderSession, type StudyReminderConfig } from "../../../device/reminders";
import { Action, Actions, Choices, Copy, Field, Notice, Toggle, styles, useCommunity } from "./ui";

const clock = (config: StudyReminderConfig) => [config.hour, config.minute].map(n => String(n).padStart(2, "0")).join(":");

export function LocalReminderSettings() {
  const { context } = useNativeAccountContext();
  const { transport, revalidating } = useNativeSession();
  if (!expoReminders.isSupported || revalidating || !isStudyReminderAccount(context) || !transport?.isCurrent() ||
    context.accountId !== transport.scope.accountId || context.sessionId !== transport.scope.sessionId) return null;
  return <ReminderForm key={JSON.stringify([context.accountId, context.sessionId])} transport={transport} locale={context.locale} />;
}

function ReminderForm({ transport, locale }: { transport: ReminderSession; locale: "id" | "en" }) {
  const { tr, theme } = useCommunity();
  const navigation = useNavigation();
  const copy = (locale === "en" ? en : id).notificationPreferences;
  const [initial, setInitial] = useState<StudyReminderConfig | null>(null);
  const [config, setConfig] = useState<StudyReminderConfig | null>(null);
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [retrySchedule, setRetrySchedule] = useState(false);
  const [openSettings, setOpenSettings] = useState(false);
  const [notice, setNotice] = useState<{ message: string; failed: boolean } | null>(null);
  useEffect(() => {
    let mounted = true;
    void expoReminders.loadSettings(transport).then(value => {
      if (mounted && transport.isCurrent() && value) {
        setInitial(value);
        setConfig(value);
        setTime(clock(value));
      }
    });
    return () => { mounted = false; };
  }, [transport]);

  if (!initial || !config) return <ActivityIndicator accessibilityLabel={tr("Memuat pengingat", "Loading reminders")} />;
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const timeChanged = config.enabled && time !== clock(initial);
  const dirty = config.enabled !== initial.enabled || config.frequency !== initial.frequency ||
    config.tutorLeadMinutes !== initial.tutorLeadMinutes || config.weekdays.join(",") !== initial.weekdays.join(",") ||
    timeChanged || retrySchedule;
  const save = async () => {
    const current = () => navigation.isFocused() && transport.isCurrent();
    if (lock.current || !current() || (config.enabled && !validTime)) return;
    lock.current = true;
    setBusy(true);
    setNotice(null);
    setOpenSettings(false);
    const leadChanged = config.tutorLeadMinutes !== initial.tutorLeadMinutes;
    const [hour, minute] = time.split(":").map(Number);
    const next = config.enabled ? { ...config, hour, minute } : config;
    try {
      if (next.enabled || leadChanged) {
        const permission = await expoReminders.requestPermission(transport, locale);
        if (!current()) return;
        if (permission.status !== "granted") {
          setOpenSettings(permission.status === "denied" && !permission.canAskAgain);
          setNotice({ failed: true, message: copy.localRemindersPermissionNeeded });
          return;
        }
      }
      const result = await expoReminders.updateSettings(transport, next, locale);
      if (!current()) return;
      if (result.status !== "synced") throw new Error();
      if (leadChanged || retrySchedule) {
        const tutor = await expoReminders.refreshTutorSessions(transport, locale);
        if (!current()) return;
        setRetrySchedule(tutor.status !== "synced");
        if (tutor.status !== "synced") throw new Error();
      }
      setInitial(next);
      setConfig(next);
      setTime(clock(next));
      setNotice({ failed: false, message: copy.localRemindersSaved });
    } catch {
      if (current()) setNotice({ failed: true, message: tr("Jadwal belum tersinkron. Coba lagi.", "The schedule could not sync. Try again.") });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return <View style={styles.block}>
    <Copy kind="heading">{copy.localRemindersTitle}</Copy>
    <Toggle testID="student-local-reminder-enabled" label={copy.localRemindersEnable} value={config.enabled} disabled={busy}
      onChange={enabled => setConfig({ ...config, enabled })} />
    {config.enabled && <>
      <Copy kind="strong">{copy.localRemindersFrequency}</Copy>
      <Choices value={config.frequency} disabled={busy} options={[
        { value: "daily" as const, label: copy.localRemindersDaily }, { value: "weekly" as const, label: copy.localRemindersWeekly },
      ]} onSelect={frequency => setConfig({ ...config, frequency })} />
      <Field label={copy.localRemindersTime} placeholder="19:00" value={time} onChangeText={setTime} editable={!busy}
        maxLength={5} autoCorrect={false} />
      {!validTime && <Copy kind="error">{tr("Gunakan format JJ:MM.", "Use HH:MM.")}</Copy>}
      {config.frequency === "weekly" && <>
        <Copy kind="strong">{copy.localRemindersDays}</Copy>
        <ToggleGroup type="multiple" theme={theme} disabled={busy} accessibilityLabel={copy.localRemindersDays}
          style={{ flexWrap: "wrap" }} value={config.weekdays.map(String)} onValueChange={values => {
            if (values.length) setConfig({ ...config, weekdays: values.map(Number).sort((a, b) => a - b) });
          }}>
          {Object.entries(copy.weekdayShort).map(([day, label]) => <ToggleGroupItem key={day} value={day}>{label}</ToggleGroupItem>)}
        </ToggleGroup>
      </>}
    </>}
    <Copy kind="strong">{copy.tutorReminderLeadLabel}</Copy>
    <Choices value={String(config.tutorLeadMinutes)} disabled={busy} options={[15, 30, 60].map(n => ({
      value: String(n), label: copy.tutorReminderLeadOption.replace("{minutes}", String(n)),
    }))} onSelect={value => setConfig({ ...config, tutorLeadMinutes: Number(value) })} />
    <Actions><Action mode="default" label={tr("Simpan pengingat", "Save reminders")} onPress={() => void save()}
      busy={busy} disabled={!dirty || (config.enabled && !validTime)} /></Actions>
    <Notice notice={notice} />
    {openSettings && <Action label={tr("Buka pengaturan perangkat", "Open device settings")}
      onPress={() => void Linking.openSettings().catch(() => setNotice({
        failed: true, message: tr("Buka Pengaturan perangkat dan pilih Notifikasi.", "Open device settings and select Notifications."),
      }))} />}
  </View>;
}
