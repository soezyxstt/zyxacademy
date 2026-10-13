import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle("Form Studio"),
  description: "Kelola formulir, pertanyaan, dan respon form Zyx Academy.",
};

export default function AdminFormsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
