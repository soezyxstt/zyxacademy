import type { Metadata } from "next";
import type { ReactNode } from "react";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle("Evaluasi & Soal"),
  description: "Kelola bank soal, kuis, dan evaluasi Zyx Academy.",
};

export default function EvalLayout({ children }: { children: ReactNode }) {
  return children;
}

