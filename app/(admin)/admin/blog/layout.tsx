import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle("Kelola Blog"),
  description: "Kelola artikel blog Zyx Academy.",
};

export default function AdminBlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
