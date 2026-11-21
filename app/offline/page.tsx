import type { Metadata } from "next";
import { OfflineReadingLibrary } from "@/components/offline/offline-reading-library";

export const metadata: Metadata = {
  title: "Bacaan offline | Zyx Academy",
  description: "Akses materi teks dan artikel Zyx Academy yang tersimpan di perangkat.",
};

export default function OfflinePage() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <OfflineReadingLibrary />
    </main>
  );
}
