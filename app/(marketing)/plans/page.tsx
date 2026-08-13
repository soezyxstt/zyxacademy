import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { isDuitkuPaymentEnabled } from "@/lib/payments/duitku";
import PlansClient from "./plans-client";

export const metadata: Metadata = {
  title: pageTitle("Plans"),
  description:
    "Paket bimbingan Zyx Academy - kombinasi course, jadwal pertemuan, dan akses materi. Real-time pricing calculator.",
};

export default function PlansPage() {
  return <PlansClient paymentEnabled={isDuitkuPaymentEnabled()} />;
}
