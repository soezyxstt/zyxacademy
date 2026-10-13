import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle("Kelola Materi"),
  description: "Kelola materi, kurikulum, dan review konten Zyx Academy.",
};

export default function AdminMaterialsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
