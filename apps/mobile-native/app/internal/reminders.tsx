import { useState } from "react";
import { useRouter } from "expo-router";
import { Linking, StyleSheet, Text, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { useNativeSession } from "../../auth/session-provider";
import { useNativeAccountContext } from "../../auth/use-account-context";
import { Button } from "../../components/Button";
import { isStudyReminderAccount } from "../../device/reminder-eligibility";
import { DEFAULT_STUDY_REMINDER_CONFIG, expoReminders, type ReminderOutcome } from "../../device/reminders";
import { nativeTypography } from "../../typography";

function describe(result: ReminderOutcome, enabled: boolean, time: string) {
  switch (result.status) {
    case "synced": return enabled ? `Jadwal harian disimpan untuk pukul ${time} sebelum penyesuaian jam hening.` : "Pengingat belajar dimatikan.";
    case "permission-required": return "Izinkan notifikasi sebelum menjadwalkan pengingat.";
    case "unavailable": return "Pengingat lokal tidak tersedia di perangkat ini.";
    case "stale": return "Sesi berubah. Masuk kembali untuk menjadwalkan pengingat.";
    case "retry": return "Jadwal belum tersinkron. Coba lagi.";
  }
}

export default function InternalRemindersRoute() {
  const router = useRouter();
  const { transport, revalidating } = useNativeSession();
  const { context, failed, retry } = useNativeAccountContext();
  const eligible = isStudyReminderAccount(context);
  const colors = nativeColors[useColorScheme() === "dark" ? "dark" : "light"];
  const [feedback, setFeedback] = useState<{ session: typeof transport; message: string; settings?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const currentFeedback = feedback?.session === transport ? feedback : null;

  const perform = async (action: "permission" | "schedule" | "cancel") => {
    if (!eligible || !context || !transport?.isCurrent() || revalidating || busy) return;
    const { locale } = context;
    setBusy(true);
    try {
      if (action === "permission") {
        const permission = await expoReminders.requestPermission(transport, locale);
        if (transport.isCurrent()) setFeedback({
          session: transport,
          message: permission.status === "granted" ? "Notifikasi diizinkan." : permission.status === "unsupported"
            ? "Izin notifikasi tidak tersedia." : "Izin notifikasi belum diberikan.",
          settings: permission.status === "denied" && !permission.canAskAgain,
        });
        return;
      }
      const config = await expoReminders.loadSettings(transport) ?? DEFAULT_STUDY_REMINDER_CONFIG;
      const next = new Date(Date.now() + 120_000);
      const enabled = action === "schedule";
      const update = enabled
        ? { ...config, enabled, frequency: "daily" as const, hour: next.getHours(), minute: next.getMinutes() }
        : { ...config, enabled };
      const result = await expoReminders.updateSettings(transport, update, locale);
      const time = `${String(update.hour).padStart(2, "0")}:${String(update.minute).padStart(2, "0")}`;
      if (transport.isCurrent()) setFeedback({ session: transport, message: describe(result, enabled, time) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>Pengingat belajar</Text>
      {transport && eligible && (
        <>
          <View style={styles.actions}>
            <Button disabled={busy || revalidating} onPress={() => void perform("permission")}>Izinkan notifikasi</Button>
            <Button variant="outline" disabled={busy || revalidating} onPress={() => void perform("schedule")}>Jadwalkan uji</Button>
            <Button variant="outline" disabled={busy || revalidating} onPress={() => void perform("cancel")}>Matikan pengingat</Button>
          </View>
          {currentFeedback && <Text accessibilityLiveRegion="polite" style={[styles.body, { color: colors.foreground }]}>{currentFeedback.message}</Text>}
          {currentFeedback?.settings && <Button variant="outline" onPress={() => void Linking.openSettings()}>Buka pengaturan</Button>}
        </>
      )}
      {transport && !eligible && (
        failed ? <Button onPress={retry}>Periksa kembali akses akun</Button>
          : <Text style={[styles.body, { color: colors.foreground }]}>{context
            ? "Pengingat belajar tersedia untuk akun siswa." : "Memeriksa akses akun."}</Text>
      )}
      {!transport && (
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
});
