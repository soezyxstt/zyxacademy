import type { Metadata } from "next";
import { OfflineStudentShell } from "@/components/offline/offline-student-shell";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Bacaan offline | Zyx Academy",
  description: "Akses materi teks dan artikel Zyx Academy yang tersimpan di perangkat.",
};

export default function OfflinePage() {
  return <OfflineStudentShell showLive={env.FEATURE_LIVE === "1"} />;
}
