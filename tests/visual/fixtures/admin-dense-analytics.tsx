import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "katex/dist/katex.min.css";
import admin from "@/messages/id/admin.json";
import adminEval from "@/messages/id/adminEval.json";
import adminOps from "@/messages/id/adminOps.json";
import core from "@/messages/id/core.json";
import learning from "@/messages/id/learning.json";
import ui from "@/messages/id/ui.json";
import { ApplicationPage } from "@/components/application-page";
import { QuizInsightDetailClient } from "@/app/(admin)/admin/(eval)/quiz-insights/quiz-insight-detail-client";
import { AiAnalyticsClient } from "@/app/(admin)/admin/ops/analytics/analytics-client";
import { FeatureUsageOverview } from "@/app/(admin)/admin/ops/feature-usage/feature-usage-overview";
import { MOCK_FEATURE_USAGE } from "@/app/visual-fixtures/admin-ops-rework/feature-usage-data";
import { WebAnalyticsOverview } from "@/components/admin/web-analytics-overview";
import { MobileChromeProvider } from "@/components/navigation/mobile-chrome-context";
import { MobileTopNavbar } from "@/components/navigation/mobile-top-navbar";
import type { AnalyticsDashboardData } from "@/lib/analytics-dashboard";

const metrics: AnalyticsDashboardData = {
  summary: { views: 10943, sessions: 6513, activeUsers: 2935 },
  dailyData: [
    { date: "2026-11-19", views: 2100, sessions: 994 },
    { date: "2026-11-20", views: 2310, sessions: 1055 },
    { date: "2026-11-21", views: 2284, sessions: 1388 },
    { date: "2026-11-22", views: 1205, sessions: 902 },
    { date: "2026-11-23", views: 3044, sessions: 2174 },
  ],
  topPages: [
    { path: "/courses", title: "Daftar mata kuliah", views: 4264 },
    {
      path: "/courses/matematika-untuk-sains-dan-rekayasa/materi/limit-fungsi-rasional-dan-kekontinuan",
      title: "Matematika untuk Sains dan Rekayasa: limit fungsi rasional dan kekontinuan",
      views: 2379,
    },
    { path: "/dashboard", title: "Dasbor murid", views: 1450 },
    { path: "/calendar", title: "Agenda", views: 0 },
  ],
};

const emptyMetrics = { summary: { views: 0, sessions: 0, activeUsers: 0 }, dailyData: [], topPages: [] };
const params = new URLSearchParams(location.search);
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function AnalyticsFixture() {
  switch (params.get("view")) {
    case "course":
      return <QuizInsightDetailClient quizId="visual-quiz" lockedCourse={{ id: "fixture-math", slug: "fixture-math", title: "Matematika I" }} />;
    case "usage":
      return <FeatureUsageOverview metrics={MOCK_FEATURE_USAGE} />;
    case "zyra":
      return <AiAnalyticsClient />;
    default:
      return <WebAnalyticsOverview metrics={params.get("state") === "empty" ? emptyMetrics : metrics} />;
  }
}

createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="id" timeZone="Asia/Jakarta" messages={{ admin, adminEval, adminOps, core, learning, ui }}>
    <QueryClientProvider client={client}>
      <MobileChromeProvider hasTopNav={params.get("view") === "course"}>
        {params.get("view") === "course" && <MobileTopNavbar title="Analitik kuis" />}
        <main><ApplicationPage><AnalyticsFixture /></ApplicationPage></main>
      </MobileChromeProvider>
    </QueryClientProvider>
  </NextIntlClientProvider>,
);
