import { selectorCatalog, selectorModelDates } from "./provider/selector-catalog";
import { readModelLatencies } from "./provider/model-latency";
import { compatibleSettings, textGatewaySettings } from "./provider/compatible-text";
import { discoveredModel, discoveredModelId, getTextProfile, isTextProfile, supportsTextProvider, upstreamModelName } from "./provider/model-registry";
import { and, eq } from "drizzle-orm";
import {
  buildFeatureModelSettingViews,
  defaultEditableModels,
  compatibleModelChain,
  modelFeature,
  modelSettingSchema,
  modelAllowedForFeature,
  type FeatureModelSettingView,
  type ModelFeature,
  type StoredModelSettingRow,
} from "./model-settings";
import type { ModelId } from "./provider/model-registry";

export {
  buildFeatureModelSettingViews,
  type FeatureModelSettingView,
  type StoredModelSettingRow,
};

export class ModelSettingConflictError extends Error {
  readonly code = "MODEL_SETTING_CONFLICT" as const;

  constructor(
    message = "Konfigurasi model baru saja diubah oleh admin lain. Muat ulang halaman lalu coba lagi.",
  ) {
    super(message);
    this.name = "ModelSettingConflictError";
  }
}

export type ModelSettingsReader = (
  feature: ModelFeature,
) => Promise<StoredModelSettingRow | null>;

let testReaderOverride: ModelSettingsReader | null = null;

export function setModelSettingsReaderForTests(reader: ModelSettingsReader | null): void {
  testReaderOverride = reader;
}

const PLACEHOLDER_DATABASE_URL =
  "postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder";

async function resolveDatabaseHandle() {
  if (!process.env.DATABASE_URL) {
    return null;
  }
  const [{ db }, { aiModelSettings }] = await Promise.all([
    import("@/db"),
    import("@/db/schema"),
  ]);
  if (
    process.env.ZYX_POSTGRES_BUILD_PLACEHOLDER === "1" &&
    process.env.DATABASE_URL === PLACEHOLDER_DATABASE_URL
  ) {
    const clientName = (
      db as unknown as { $client?: { constructor?: { name?: string } } }
    ).$client?.constructor?.name;
    if (clientName === "Pool" || clientName === "BoundPool") {
      return null;
    }
  }
  return { db, aiModelSettings };
}

async function readStoredModelSetting(
  feature: ModelFeature,
): Promise<StoredModelSettingRow | null> {
  if (testReaderOverride) {
    return testReaderOverride(feature);
  }
  const handle = await resolveDatabaseHandle();
  if (!handle) {
    return null;
  }
  const [row] = await handle.db
    .select()
    .from(handle.aiModelSettings)
    .where(eq(handle.aiModelSettings.feature, feature))
    .limit(1);
  return row ?? null;
}

/** Read on each new request so all instances see committed admin changes. */
export async function configuredModelChain(
  input: {
    feature?: string;
    useCase?: string;
    visual?: boolean;
    requireGenerateContent?: boolean;
  },
  defaults: readonly ModelId[],
): Promise<readonly ModelId[]> {
  const feature = modelFeature(input.feature, input.useCase);
  if (!feature) return defaults;

  const row = await readStoredModelSetting(feature);
  if (!row) return defaults;

  const parsed = modelSettingSchema.safeParse({
    feature: row.feature,
    models: row.models,
  });
  if (!parsed.success) {
    throw new Error("Konfigurasi model tidak valid. Periksa pengaturan model AI.");
  }

  // Several auxiliary tasks historically share the Zyra settings row.
  // Keep their native defaults when the row now specifies an answer provider.
  if (feature === "zyra" && parsed.data.models.some(isTextProfile) &&
      (!supportsTextProvider(input.feature) || input.useCase === "chapter-summary")) return defaults;
  const available = parsed.data.models.filter(profileAvailable);
  return compatibleModelChain(available.length ? available : defaults, {
    visual: Boolean(input.visual),
    fallbackModels: defaults,
    requireGenerateContent: Boolean(input.requireGenerateContent),
  });
}

function profileAvailable(id: string) {
  return !isTextProfile(id) || Boolean(compatibleSettings(process.env, id));
}

function canonicalSettingModel(id: ModelId): ModelId {
  if (!isTextProfile(id) || discoveredModel(id)) return id;
  const profile = getTextProfile(id)!, settings = textGatewaySettings(process.env, id);
  if (!settings || !["openai", "meta", "deepseek"].includes(profile.group)) return id;
  return discoveredModelId(profile.group === "meta" ? "muse" : profile.group as "openai" | "deepseek", settings.model);
}

export async function listModelSettingViews(): Promise<FeatureModelSettingView[]> {
  const handle = await resolveDatabaseHandle();
  const rows = handle ? await handle.db.select().from(handle.aiModelSettings) : [];
  const catalog = await selectorCatalog();
  const modelDates = selectorModelDates(), modelLatencies = await readModelLatencies();
  return buildFeatureModelSettingViews(rows).map(view => ({
    ...view,
    modelDates, modelLatencies,
    models: view.models.map(canonicalSettingModel) as [ModelId, ModelId, ModelId],
    modelLabels: Object.fromEntries([...new Set([...catalog, ...view.models.map(canonicalSettingModel)])].flatMap(id => {
      const settings = isTextProfile(id) && textGatewaySettings(process.env, id);
      return settings ? [[id, settings.model]] : [];
    })),
    selectableModels: [...catalog].filter(id => modelAllowedForFeature(view.feature, id)),
  }));
}

export async function saveModelSetting(input: {
  feature: string;
  models: readonly string[];
  updatedBy: string;
  expectedUpdatedAt?: string | null;
}): Promise<StoredModelSettingRow> {
  const parsed = modelSettingSchema.safeParse({
    feature: input.feature,
    models: input.models,
  });
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message;
    throw new Error(firstIssue || "Konfigurasi model tidak valid.");
  }

  const handle = await resolveDatabaseHandle();
  if (!handle) {
    throw new Error("Penyimpanan konfigurasi model belum tersedia.");
  }

  const { db, aiModelSettings } = handle;
  const now = new Date();
  const nextModels = [...parsed.data.models];
  const identities = nextModels.map(id => {
    const canonical = canonicalSettingModel(id);
    return `${getTextProfile(canonical)?.group ?? "gemini"}:${upstreamModelName(canonical)}`;
  });
  if (new Set(identities).size !== 3) throw new Error("Pilih tiga model berbeda.");
  const available = await selectorCatalog();

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(aiModelSettings)
      .where(eq(aiModelSettings.feature, parsed.data.feature))
      .limit(1);

    if (input.expectedUpdatedAt !== undefined) {
      const currentIso = existing ? existing.updatedAt.toISOString() : null;
      if (currentIso !== input.expectedUpdatedAt) {
        throw new ModelSettingConflictError();
      }
    }

    const previous = (existing?.models ?? defaultEditableModels(parsed.data.feature)).map(id => canonicalSettingModel(id as ModelId));
    if (nextModels.some((id, index) => previous[index] !== id && !available.has(id))) {
      throw new Error("Model belum tersedia. Muat ulang daftar model.");
    }

    if (!existing) {
      const inserted = await tx
        .insert(aiModelSettings)
        .values({
          feature: parsed.data.feature,
          models: nextModels,
          updatedBy: input.updatedBy,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: aiModelSettings.feature })
        .returning();

      if (!inserted[0]) {
        throw new ModelSettingConflictError();
      }
      return inserted[0];
    }

    const updated = await tx
      .update(aiModelSettings)
      .set({
        models: nextModels,
        updatedBy: input.updatedBy,
        updatedAt: now,
      })
      .where(
        and(
          eq(aiModelSettings.feature, parsed.data.feature),
          eq(aiModelSettings.updatedAt, existing.updatedAt),
        ),
      )
      .returning();

    if (!updated[0]) {
      throw new ModelSettingConflictError();
    }
    return updated[0];
  });
}

export async function resetModelSetting(input: {
  feature: string;
  expectedUpdatedAt?: string | null;
}): Promise<void> {
  const feature = modelFeature(input.feature);
  if (!feature || feature !== input.feature) {
    throw new Error("Fitur model AI tidak valid.");
  }

  const handle = await resolveDatabaseHandle();
  if (!handle) {
    throw new Error("Penyimpanan konfigurasi model belum tersedia.");
  }

  const { db, aiModelSettings } = handle;
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(aiModelSettings)
      .where(eq(aiModelSettings.feature, feature))
      .limit(1);

    if (input.expectedUpdatedAt !== undefined) {
      const currentIso = existing ? existing.updatedAt.toISOString() : null;
      if (currentIso !== input.expectedUpdatedAt) {
        throw new ModelSettingConflictError();
      }
    }

    if (!existing) {
      return;
    }

    const deleted = await tx
      .delete(aiModelSettings)
      .where(
        and(
          eq(aiModelSettings.feature, feature),
          eq(aiModelSettings.updatedAt, existing.updatedAt),
        ),
      )
      .returning({ feature: aiModelSettings.feature });

    if (!deleted[0]) {
      throw new ModelSettingConflictError();
    }
  });
}
