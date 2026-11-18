import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { AiAnalyticsClient } from "@/app/(admin)/admin/ops/analytics/analytics-client";
import { AdminLeaderboardClient } from "@/components/admin/leaderboard/admin-leaderboard-client";
import { createQueryClient } from "@/lib/query/client";
import admin from "@/messages/id/admin.json";
import adminEval from "@/messages/id/adminEval.json";
import adminOps from "@/messages/id/adminOps.json";
import ui from "@/messages/id/ui.json";

declare global {
  interface Window {
    adminQueryFixture: { mode: "analytics" | "leaderboard" };
    setAdminFixtureAccount: (userId: string | null) => void;
  }
}

function App() {
  return <main className="mx-auto max-w-6xl p-4 text-foreground">
    {window.adminQueryFixture.mode === "analytics" ? <AiAnalyticsClient /> : (
      <AdminLeaderboardClient lockedCourse={{ id: "fixture-course", slug: "kinematika", title: "Kinematika" }} />
    )}
  </main>;
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={createQueryClient()}>
    <NextIntlClientProvider locale="id" timeZone="UTC" messages={{ admin, adminEval, adminOps, ui }}>
      <App />
    </NextIntlClientProvider>
  </QueryClientProvider>,
);
