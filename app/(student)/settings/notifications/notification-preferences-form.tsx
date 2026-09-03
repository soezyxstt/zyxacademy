"use client";

import { useActionState, useEffect, useState } from "react";
import { Bell, BookOpen, CalendarDays, Mail, Newspaper, ShieldCheck, BookmarkCheck } from "lucide-react";
import { updateNotificationPreferencesAction, type NotificationPreferencesActionState } from "./actions";
import type { EmailNotificationPreferences } from "@/lib/email-preferences/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/toast";

const INITIAL_ACTION_STATE: NotificationPreferencesActionState = {
  success: false,
  message: "",
  submittedAt: 0,
};

const CATEGORY_ROWS = [
  {
    key: "courseUpdates" as const,
    label: "Pembaruan materi & kelas",
    description: "Pengumuman akademik, materi baru terbit, kuis yang siap dikerjakan, dan status kelas.",
    icon: BookOpen,
  },
  {
    key: "eventsAndSchedules" as const,
    label: "Jadwal & sesi pertemuan",
    description: "Sesi kuis langsung, bimbingan tutorial kelompok, perubahan jadwal, dan tautan pertemuan.",
    icon: CalendarDays,
  },
  {
    key: "learningReminders" as const,
    label: "Pengingat belajar berkala",
    description: "Refleksi mingguan, pengingat kartu flashcard jatuh tempo, dan ringkasan progres belajar.",
    icon: BookmarkCheck,
  },
  {
    key: "newsAndOffers" as const,
    label: "Informasi program & edukasi",
    description: "Kabar fitur baru platform, artikel edukasi, dan informasi kegiatan akademik Zyx Academy.",
    icon: Newspaper,
  },
];

export function NotificationPreferencesForm({
  accountEmail,
  initialPreferences,
}: {
  accountEmail: string;
  initialPreferences: EmailNotificationPreferences;
}) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [state, formAction, pending] = useActionState(updateNotificationPreferencesAction, INITIAL_ACTION_STATE);

  useEffect(() => {
    if (!state.submittedAt) return;
    if (state.success) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return (
    <form action={formAction} className="w-full space-y-6">
      {Object.entries(preferences).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={String(value)} />
      ))}

      <Card className="w-full shadow-xs">
        <CardHeader className="border-b border-border">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Mail className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-h5">Notifikasi Surel</CardTitle>
              <CardDescription className="mt-1 text-body-xs">
                Surel opsional dikirim ke akun Google Anda: <span className="font-semibold text-foreground">{accountEmail}</span>
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <label className="flex cursor-pointer items-start gap-4 border-b border-border px-6 py-5 hover:bg-muted/20 transition-colors">
            <Checkbox
              checked={preferences.emailEnabled}
              onCheckedChange={(checked) => setPreferences((current) => ({ ...current, emailEnabled: checked === true }))}
              className="mt-1 size-5 rounded-md"
              aria-label="Aktifkan notifikasi surel opsional"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-body-base font-semibold text-foreground">
                <Bell className="size-4 text-primary" aria-hidden />
                Aktifkan notifikasi surel opsional
              </span>
              <span className="mt-1 block text-body-xs text-muted-foreground">
                Matikan seluruh surel opsional tanpa menghapus pilihan preferensi kategori Anda di bawah ini.
              </span>
            </span>
          </label>

          <div className="divide-y divide-border">
            {CATEGORY_ROWS.map(({ key, label, description, icon: Icon }) => (
              <label
                key={key}
                className="flex cursor-pointer items-start gap-4 px-6 py-4.5 has-[:disabled]:cursor-not-allowed hover:bg-muted/20 transition-colors"
              >
                <Checkbox
                  checked={preferences[key]}
                  disabled={!preferences.emailEnabled}
                  onCheckedChange={(checked) => setPreferences((current) => ({ ...current, [key]: checked === true }))}
                  className="mt-1 size-5 rounded-md"
                  aria-label={label}
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-body-sm font-semibold text-foreground">
                    <Icon className="size-4 text-muted-foreground" aria-hidden />
                    {label}
                  </span>
                  <span className="mt-0.5 block text-body-xs text-muted-foreground">{description}</span>
                </span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-primary" aria-hidden />
        <div>
          <p className="text-body-sm font-semibold text-foreground">Surel penting tetap aktif</p>
          <p className="mt-1 text-body-xs text-muted-foreground">
            Pemberitahuan keamanan akun, konfirmasi aktivasi token kelas, dan informasi sistem utama bersifat esensial dan akan selalu dikirimkan.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" size="default" className="rounded-lg px-6 font-semibold" disabled={pending}>
          {pending ? "Menyimpan..." : "Simpan Preferensi"}
        </Button>
      </div>
    </form>
  );
}
