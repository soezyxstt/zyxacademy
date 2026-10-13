import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle("Google Meet"),
  description: "Kelola sesi Google Meet dan tautan pertemuan Zyx Academy.",
};

export default function AdminMeetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
