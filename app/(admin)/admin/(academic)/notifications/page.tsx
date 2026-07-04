/**
 * app/admin/notifications/page.tsx
 *
 * Admin Push Notification Management Page ; /admin/notifications
 *
 * Features:
 * 1. Compose & Send ; broadcast to All / Course / User with live preview
 * 2. Notification History ; paginated log of all sent notifications
 *
 * Design follows Zyx design system: font-heading/font-sans, semantic color tokens,
 * no rounded-full on non-circular elements, no arbitrary hex colors.
 */

import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { getNotificationHistoryAction, getCoursesForTargetingAction } from "./actions";
import { NotificationBroadcastForm } from "./_components/broadcast-form";
import { NotificationHistoryTable } from "./_components/history-table";
import { Bell, History } from "lucide-react";

export const metadata: Metadata = {
 title: pageTitle("Notifikasi Push"),
 description: "Kirim dan kelola push notification untuk pengguna Zyx Academy.",
};

export default async function AdminNotificationsPage() {
 const [history, courseList] = await Promise.all([
 getNotificationHistoryAction(1, 50),
 getCoursesForTargetingAction(),
 ]);

 return (
 <div className="space-y-6">
  <div className="mb-6 text-left">
    <h1 className="font-heading text-h4 font-bold text-foreground">Push Notification</h1>
    <p className="mt-1 text-body-sm text-muted-foreground">
      Kelola dan kirim pesan otomatis ke perangkat siswa.
    </p>
  </div>
 <div className="grid gap-8 lg:grid-cols-5">
 {/* Left: Compose form (3/5 width) */}
 <div className="lg:col-span-3">
 <div className="mb-3 flex items-center gap-2">
 <Bell className="size-4 text-brand-primary" aria-hidden />
 <h2 className="font-heading text-h6 font-semibold text-foreground">
 Kirim Notifikasi
 </h2>
 </div>
 <NotificationBroadcastForm courses={courseList} />
 </div>

 {/* Right: Stats strip (2/5 width) */}
 <div className="lg:col-span-2">
 <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
 <h3 className="font-heading text-body-sm font-semibold text-foreground mb-4">
 Panduan Penggunaan
 </h3>
 <ul className="space-y-3 text-body-sm text-muted-foreground">
 <li className="flex gap-2.5">
 <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-brand-primary/10 text-brand-primary font-bold text-body-xs">1</span>
 <span>Pilih target: <strong className="text-foreground">Semua Pengguna</strong>, kelas tertentu, atau satu user ID.</span>
 </li>
 <li className="flex gap-2.5">
 <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-brand-primary/10 text-brand-primary font-bold text-body-xs">2</span>
 <span>Isi judul (maks 100 karakter) dan isi pesan (maks 500 karakter).</span>
 </li>
 <li className="flex gap-2.5">
 <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-brand-primary/10 text-brand-primary font-bold text-body-xs">3</span>
 <span>Opsional: tambahkan link yang akan dibuka saat notifikasi diklik.</span>
 </li>
 <li className="flex gap-2.5">
 <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-brand-primary/10 text-brand-primary font-bold text-body-xs">4</span>
 <span>Klik <strong className="text-foreground">Kirim Notifikasi</strong>. Notifikasi hanya terkirim ke pengguna yang sudah memberikan izin browser.</span>
 </li>
 </ul>

 <div className="mt-5 rounded-lg border border-status-warning/25 bg-status-warning/5 px-4 py-3">
 <p className="text-body-xs text-status-warning font-medium">
 ⚠️ Token FCM hanya berlaku selama browser telah mengizinkan notifikasi. Token yang sudah tidak valid akan dihapus otomatis.
 </p>
 </div>
 </div>
 </div>
 </div>

 {/* Notification history table */}
 <div className="mt-10">
 <div className="mb-3 flex items-center gap-2">
 <History className="size-4 text-muted-foreground" aria-hidden />
 <h2 className="font-heading text-h6 font-semibold text-foreground">
 Riwayat Notifikasi
 </h2>
 </div>
 <NotificationHistoryTable history={history} />
 </div>
 </div>
 );
}
