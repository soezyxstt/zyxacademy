import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle("Jadwal Kelas & Tutorial"),
  description:
    "Lihat dan pesan jadwal tutorial tutor atau kelola ketersediaan jadwal tutorial mingguan.",
};

export default function ScheduleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
