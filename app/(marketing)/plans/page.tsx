import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import PlansClient from "./plans-client";

export const metadata: Metadata = {
  title: pageTitle("Plans"),
  description:
    "Paket tutorial Zyx Academy, kombinasi course, jadwal pertemuan, dan akses materi. Real-time pricing calculator.",
};

export default function PlansPage() {
  return <PlansClient />;
}
