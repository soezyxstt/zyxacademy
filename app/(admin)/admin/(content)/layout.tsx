import type { Metadata } from "next";
import type { ReactNode } from "react";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle("Konten & Diktat"),
  description: "Kelola konten, diktat, dan asesmen Zyx Academy.",
};

export default function ContentLayout({ children }: { children: ReactNode }) {
  return children;
}

