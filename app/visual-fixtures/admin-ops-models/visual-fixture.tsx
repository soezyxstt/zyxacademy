"use client";

import { useEffect, useRef, useState } from "react";
import { Cpu } from "lucide-react";
import { ModelsClient } from "@/app/(admin)/admin/ops/models/models-client";
import type { ModelSettingMutationResult } from "@/app/(admin)/admin/ops/models/actions";
import { AdminPageHeader } from "@/components/admin/page-header";
import { TranslatedText } from "@/components/i18n/translated-text";
import {
  buildFeatureModelSettingViews,
  type StoredModelSettingRow,
} from "@/lib/ai/model-settings";
import { MODEL_IDS } from "@/lib/ai/provider/model-registry";
import { useTranslations } from "@/lib/i18n/client";

const FIXED_TIMESTAMP = new Date("2026-11-05T08:30:00.000Z");

const INITIAL_STORED_ROWS: StoredModelSettingRow[] = [
  {
    feature: "zyra",
    models: [
      MODEL_IDS.premiumPedagogy,
      MODEL_IDS.default,
      MODEL_IDS.stableFlash,
    ],
    updatedBy: "admin-fixture-1",
    updatedAt: FIXED_TIMESTAMP,
  },
  {
    feature: "admin-ops-ai",
    models: [
      MODEL_IDS.stableFlash,
      MODEL_IDS.default,
      MODEL_IDS.emergencyText,
    ],
    updatedBy: "admin-fixture-1",
    updatedAt: FIXED_TIMESTAMP,
  },
];

export function AdminOpsModelsVisualFixture({ state }: { state: string }) {
  const t = useTranslations("adminOps");
  const tAdmin = useTranslations("admin");
  const [ready, setReady] = useState(false);
  const rowsRef = useRef<StoredModelSettingRow[]>(
    state === "all-default" ? [] : [...INITIAL_STORED_ROWS],
  );

  useEffect(() => {
    setReady(true);
  }, []);

  const initialViews = buildFeatureModelSettingViews(
    state === "all-default" ? [] : INITIAL_STORED_ROWS,
  );

  const handleSaveOverride = async (input: {
    feature: string;
    models: readonly string[];
    expectedUpdatedAt?: string | null;
  }): Promise<ModelSettingMutationResult> => {
    if (state === "saving") return new Promise<ModelSettingMutationResult>(() => {});
    if (state === "conflict") {
      return {
        ok: false,
        code: "MODEL_SETTING_CONFLICT",
        error:
          "Konfigurasi model baru saja diubah oleh admin lain. Muat ulang halaman lalu coba lagi.",
        views: buildFeatureModelSettingViews(rowsRef.current),
      };
    }

    const nextRow: StoredModelSettingRow = {
      feature: input.feature,
      models: [...input.models],
      updatedBy: "admin-fixture-1",
      updatedAt: new Date("2026-11-05T09:15:00.000Z"),
    };
    rowsRef.current = [
      ...rowsRef.current.filter((item) => item.feature !== input.feature),
      nextRow,
    ];
    return {
      ok: true,
      views: buildFeatureModelSettingViews(rowsRef.current),
    };
  };

  const handleResetOverride = async (input: {
    feature: string;
    expectedUpdatedAt?: string | null;
  }): Promise<ModelSettingMutationResult> => {
    rowsRef.current = rowsRef.current.filter((item) => item.feature !== input.feature);
    return {
      ok: true,
      views: buildFeatureModelSettingViews(rowsRef.current),
    };
  };

  const handleRefreshOverride = async (): Promise<ModelSettingMutationResult> => {
    return {
      ok: true,
      views: buildFeatureModelSettingViews(rowsRef.current),
    };
  };

  return (
    <div
      data-fixture-ready={ready ? "true" : "false"}
      className="relative flex min-h-screen flex-col overflow-x-clip bg-background text-foreground font-sans lg:flex-row"
    >
      <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 lg:hidden">
        <span className="font-heading text-body-base font-semibold text-foreground">
          {tAdmin("routeTitles.aiModels")}
        </span>
      </header>

      <aside className="hidden w-64 shrink-0 flex-col justify-between border-r border-border bg-card p-4 lg:flex">
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary text-body-xs font-bold text-primary-foreground">
              Z
            </div>
            <span className="font-heading text-body-sm font-bold">Zyx Admin</span>
          </div>
          <nav className="space-y-1 text-body-sm" aria-label="Fixture admin navigation">
            <div className="rounded-md px-3 py-2 text-muted-foreground">
              {tAdmin("navigation.opsMonitor")}
            </div>
            <div className="rounded-md bg-muted px-3 py-2 font-medium text-foreground">
              {tAdmin("navigation.aiModels")}
            </div>
            <div className="rounded-md px-3 py-2 text-muted-foreground">
              {tAdmin("navigation.zyraAnalytics")}
            </div>
            <div className="rounded-md px-3 py-2 text-muted-foreground">
              {tAdmin("navigation.featureFlags")}
            </div>
            <div className="rounded-md px-3 py-2 text-muted-foreground">
              {tAdmin("navigation.apiKeys")}
            </div>
          </nav>
        </div>
      </aside>

      <main
        id="main-content"
        tabIndex={-1}
        className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      >
        <div className="w-full space-y-6">
          <AdminPageHeader
            icon={Cpu}
            title={<TranslatedText namespace="adminOps" messageKey="models.title" />}
            description={t("models.description")}
          />
          <ModelsClient
            initialViews={initialViews}
            onSaveOverride={handleSaveOverride}
            onResetOverride={handleResetOverride}
            onRefreshOverride={handleRefreshOverride}
            initialSearch={state === "empty-search" ? "tidak-ada-fitur-cocok" : ""}
            initialStatusFilter={state === "custom-only" ? "custom" : "all"}
            initialBannerError={
              state === "conflict-banner"
                ? "Konfigurasi model baru saja diubah oleh admin lain. Muat ulang halaman lalu coba lagi."
                : null
            }
          />
        </div>
      </main>
    </div>
  );
}
