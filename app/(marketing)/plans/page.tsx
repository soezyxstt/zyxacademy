import type { Metadata } from "next";
import { createMetadata } from "@/lib/site";
import PlansClient from "./plans-client";

export const metadata: Metadata = createMetadata({
  title: "Pilihan Paket",
  description:
    "Paket tutorial Zyx Academy, kombinasi kursus, jadwal pertemuan, dan akses materi akademik.",
  path: "/plans",
});


export default function PlansPage() {
  return <PlansClient />;
}
