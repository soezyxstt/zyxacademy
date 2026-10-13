import type { Metadata } from "next";
import type { ReactNode } from "react";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle("Akademik"),
  description: "Kelola kursus, jadwal, dan operasional akademik Zyx Academy.",
};

export default function AcademicLayout({ children }: { children: ReactNode }) {
  return children;
}

