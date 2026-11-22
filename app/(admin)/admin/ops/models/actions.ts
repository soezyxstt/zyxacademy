"use server";

import { claimLatencyCycle } from "@/lib/ai/model-latency-cooldown";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { inngest } from "@/jobs/client";
import { assertAdmin } from "@/lib/auth/admin-guards";
import {
  ModelSettingConflictError,
  listModelSettingViews,
  resetModelSetting,
  saveModelSetting,
  type FeatureModelSettingView,
} from "@/lib/ai/model-settings-store";

export type ModelSettingMutationResult =
  | {
      readonly ok: true;
      readonly views: FeatureModelSettingView[];
      readonly latencyRefreshRequestedAt?: number;
    }
  | {
      readonly ok: false;
      readonly error: string;
      readonly code?: string;
      readonly views?: FeatureModelSettingView[];
    };

function toSafeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ModelSettingConflictError) {
    return error.message;
  }
  if (error instanceof Error) {
    if (error.message === "Unauthorized") {
      return "Sesi berakhir. Silakan masuk kembali.";
    }
    if (error.message.startsWith("Forbidden")) {
      return "Akses ditolak. Hanya admin yang dapat mengubah konfigurasi model.";
    }
    if (
      error.message.includes("prioritas model") ||
      error.message.includes("model berbeda") ||
      error.message.includes("streaming tool") ||
      error.message.includes("tidak valid") ||
      error.message.includes("belum tersedia")
    ) {
      return error.message;
    }
  }
  return fallback;
}

export async function listAiModelSettingsAction(): Promise<ModelSettingMutationResult> {
  try {
    await assertAdmin();
    const views = await listModelSettingViews();
    return { ok: true, views };
  } catch (error) {
    return {
      ok: false,
      error: toSafeErrorMessage(error, "Gagal memuat konfigurasi model AI."),
    };
  }
}

export async function refreshAiModelLatenciesAction(): Promise<ModelSettingMutationResult> {
  try {
    await assertAdmin();
    if (!process.env.ZYRA_CONTROL_PLANE_URL || !process.env.ZYRA_CONTROL_PLANE_TOKEN ||
        !process.env.CF_KV_NAMESPACE_ID || !process.env.CF_ACCOUNT_ID || !process.env.CF_API_TOKEN) {
      throw new Error("Pengukuran latensi belum tersedia. Periksa koneksi control plane dan cache.");
    }
    const views = await listModelSettingViews();
    const requestedAt = Date.now(), requestId = randomUUID();
    const accepted = await claimLatencyCycle(requestId, () =>
      inngest.send({ name: "ai-model-catalog-cron", id: requestId, data: { requestId } }));
    if (!accepted) return { ok: false, code: "LATENCY_COOLDOWN", error: "Pengujian latensi dibatasi sekali setiap 3 jam." };
    return { ok: true, views, latencyRefreshRequestedAt: requestedAt };
  } catch (error) {
    return { ok: false, error: toSafeErrorMessage(error, "Gagal menjadwalkan pengukuran latensi. Coba lagi.") };
  }
}

export async function updateAiModelSettingAction(input: {
  feature: string;
  models: readonly string[];
  expectedUpdatedAt?: string | null;
}): Promise<ModelSettingMutationResult> {
  try {
    const { user } = await assertAdmin();
    await saveModelSetting({
      feature: input.feature,
      models: input.models,
      updatedBy: user.id,
      expectedUpdatedAt: input.expectedUpdatedAt,
    });
    revalidatePath("/admin/ops/models");
    const views = await listModelSettingViews();
    return { ok: true, views };
  } catch (error) {
    if (error instanceof ModelSettingConflictError) {
      const views = await listModelSettingViews().catch(() => undefined);
      return {
        ok: false,
        code: error.code,
        error: error.message,
        views,
      };
    }
    return {
      ok: false,
      error: toSafeErrorMessage(error, "Gagal menyimpan konfigurasi model AI."),
    };
  }
}

export async function resetAiModelSettingAction(input: {
  feature: string;
  expectedUpdatedAt?: string | null;
}): Promise<ModelSettingMutationResult> {
  try {
    await assertAdmin();
    await resetModelSetting({
      feature: input.feature,
      expectedUpdatedAt: input.expectedUpdatedAt,
    });
    revalidatePath("/admin/ops/models");
    const views = await listModelSettingViews();
    return { ok: true, views };
  } catch (error) {
    if (error instanceof ModelSettingConflictError) {
      const views = await listModelSettingViews().catch(() => undefined);
      return {
        ok: false,
        code: error.code,
        error: error.message,
        views,
      };
    }
    return {
      ok: false,
      error: toSafeErrorMessage(error, "Gagal mengembalikan konfigurasi model bawaan."),
    };
  }
}
