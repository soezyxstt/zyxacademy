import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { assertAdmin } from "@/lib/uploadthing-admin";
import { AdminLeaderboardClient } from "@/components/admin/leaderboard/admin-leaderboard-client";

export const metadata: Metadata = {
  title: pageTitle("Papan Peringkat"),
  description: "Peringkat kuis dan simulasi seluruh siswa per mata kuliah di Zyx Academy.",
};

export default async function AdminLeaderboardPage() {
  await assertAdmin();

  return <AdminLeaderboardClient />;
}
