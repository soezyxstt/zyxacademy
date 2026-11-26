"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { OpsClient } from "@/app/(admin)/admin/ops/ops-client";
import { AiAnalyticsClient } from "@/app/(admin)/admin/ops/analytics/analytics-client";
import { ModelsClient } from "@/app/(admin)/admin/ops/models/models-client";
import type { FeatureModelSettingView } from "@/lib/ai/model-settings";
import { KeysClient } from "@/app/(admin)/admin/ops/keys/keys-client";
import { OfflineCacheSettings } from "@/components/admin/offline-cache-settings";
import { ZyraOpsPanel } from "@/components/admin/zyra-ops-panel";
import { ZyraProposalPanel } from "@/components/zyra/zyra-proposal-panel";
import { ActivityFilters } from "@/app/(admin)/admin/ops/tutor-activity/_components/activity-filters";
import { ActivityTable } from "@/app/(admin)/admin/ops/tutor-activity/_components/activity-table";
import type { TutorActivityFilterInput } from "@/app/(admin)/admin/ops/tutor-activity/dal";
import ShortLinksPage from "@/app/(admin)/admin/ops/short-links/page";
import { monitoringFixtureData } from "@/packages/native-parity/operations/monitoring-fixtures";
function TutorActivityReference({ empty }: { empty: boolean }) {
  const [filters, setFilters] = useState<TutorActivityFilterInput>({ limit: 25 });
  const { stats, options, page } = monitoringFixtureData.tutor;
  const rows = empty ? [] : page.items.filter(item =>
    (!filters.actorId || item.actorId === filters.actorId)
    && (!filters.courseId || item.courseTitle === options.courses.find(course => course.id === filters.courseId)?.title)
    && (!filters.entityType || item.entityType === filters.entityType)
    && (!filters.action || item.action === filters.action)
    && (!filters.outcome || filters.outcome === "all" || item.outcome === filters.outcome)
    && (!filters.correlationId || item.correlationId === filters.correlationId)
    && (!filters.startDate || item.createdAt.slice(0, 10) >= filters.startDate)
    && (!filters.endDate || item.createdAt.slice(0, 10) <= filters.endDate),
  ).map(item => {
    const course = options.courses.find(course => course.title === item.courseTitle);
    return { ...item, createdAt: new Date(item.createdAt), actorImage: null, courseId: course?.id ?? null, courseCode: course?.code ?? null };
  });
  return <>
    <AdminPageHeader title="Aktivitas tutor" />
    <AdminStatStrip>
      <AdminStatStripItem label="Total Aktivitas" value={stats.total} />
      <AdminStatStripItem label="Sukses" value={stats.success} />
      <AdminStatStripItem label="Ditolak" value={stats.rejected} />
      <AdminStatStripItem label="Gagal" value={stats.failed} />
    </AdminStatStrip>
    <ActivityFilters filters={filters} options={options} onFilterChange={setFilters} onReset={() => setFilters({ limit: 25 })} />
    <ActivityTable items={rows} hasNextPage={false} hasPrevPage={false} onNextPage={() => {}} onPrevPage={() => {}} limit={25} />
  </>;
}

function ModelsReference() {
  const views = monitoringFixtureData.models.map(model => ({
    ...model, runtimeDefaultModels: model.editableDefaultModels,
    requiresStreamingTools: model.feature === "zyra", supportsImages: true, updatedBy: null,
  })) as FeatureModelSettingView[];
  const read = async () => ({ ok: true, views }) as const;
  return <>
    <AdminPageHeader title="Model AI" />
    <ModelsClient initialViews={views} onReadOverride={read} onRefreshOverride={read}
      onSaveOverride={read} onResetOverride={read} />
  </>;
}

export function MonitoringReference({ screen, mode }: { screen: string; mode: string }) {
  switch (screen) {
    case "ops":
      return <><AdminPageHeader title="Operasional" /><OpsClient /><ZyraOpsPanel /><ZyraProposalPanel role="admin" /></>;
    case "ai":
      return <><AdminPageHeader title="Analitik" /><AiAnalyticsClient /></>;
    case "models":
      return <ModelsReference />;
    case "keys":
      return <><AdminPageHeader title="Kunci API" /><KeysClient /></>;
    case "offline":
      return <><AdminPageHeader title="Data offline" /><OfflineCacheSettings initialData={mode === "error" ? undefined : monitoringFixtureData.offline} /></>;
    case "links":
      return <ShortLinksPage />;
    case "tutor":
      return <TutorActivityReference empty={mode === "empty"} />;
    default:
      return null;
  }
}
