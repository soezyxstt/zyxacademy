import * as catalog from "@/lib/ai/provider/selector-catalog";
import { afterAll, spyOn, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { db } from "@/db";
import { aiModelSettings, pengguna, user } from "@/db/schema";
import {
  ModelSettingConflictError,
  configuredModelChain,
  listModelSettingViews,
  resetModelSetting,
  saveModelSetting,
} from "@/lib/ai/model-settings-store";
import { defaultGenerationModels } from "@/lib/ai/provider/selected-models";
import { MODEL_IDS, ROUTE_POLICY } from "@/lib/ai/provider/model-registry";

describe("AI Model Settings Database Persistence and Optimistic Concurrency", () => {
  const adminActorId = "test-model-settings-admin";

  const available = spyOn(catalog, "selectorCatalog");
  afterAll(() => available.mockRestore());

  beforeAll(async () => {
    available.mockResolvedValue(new Set([MODEL_IDS.flash38, MODEL_IDS.default, MODEL_IDS.stableFlash, MODEL_IDS.emergencyText]));
    await db
      .insert(user)
      .values({
        id: adminActorId,
        name: "Model Settings Admin",
        email: "model-settings-admin@zyx.local",
        role: "admin",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    await db
      .insert(pengguna)
      .values({ id: adminActorId, status: "active" })
      .onConflictDoNothing();
  });

  beforeEach(async () => {
    await db.delete(aiModelSettings);
  });

  it("persists custom 3-model priorities with updatedBy audit, resolves live chains, and resets to runtime defaults", async () => {
    const initialChain = await configuredModelChain(
      { feature: "zyra" },
      ROUTE_POLICY.default,
    );
    expect(initialChain).toEqual(defaultGenerationModels);

    const saved = await saveModelSetting({
      feature: "zyra",
      models: [
        MODEL_IDS.flash38,
        MODEL_IDS.default,
        MODEL_IDS.stableFlash,
      ],
      updatedBy: adminActorId,
      expectedUpdatedAt: null,
    });

    expect(saved.feature).toBe("zyra");
    expect(saved.updatedBy).toBe(adminActorId);
    expect(saved.models).toEqual([
      MODEL_IDS.flash38,
      MODEL_IDS.default,
      MODEL_IDS.stableFlash,
    ]);

    const resolvedChain = await configuredModelChain(
      { feature: "zyra" },
      ROUTE_POLICY.default,
    );
    expect(resolvedChain).toEqual([
      MODEL_IDS.flash38,
      MODEL_IDS.default,
      MODEL_IDS.stableFlash,
    ]);

    const viewsAfterSave = await listModelSettingViews();
    const zyraView = viewsAfterSave.find((v) => v.feature === "zyra");
    expect(zyraView?.isCustom).toBe(true);
    expect(zyraView?.updatedBy).toBe(adminActorId);
    expect(zyraView?.updatedAt).toBe(saved.updatedAt.toISOString());

    await resetModelSetting({
      feature: "zyra",
      expectedUpdatedAt: zyraView?.updatedAt ?? null,
    });

    const viewsAfterReset = await listModelSettingViews();
    const resetZyraView = viewsAfterReset.find((v) => v.feature === "zyra");
    expect(resetZyraView?.isCustom).toBe(false);
    expect(resetZyraView?.updatedAt).toBeNull();

    const chainAfterReset = await configuredModelChain(
      { feature: "zyra" },
      ROUTE_POLICY.default,
    );
    expect(chainAfterReset).toEqual(defaultGenerationModels);
  });

  it("retains the ten most recent successful request durations per model", async () => {
    const { recordRequestLatency, readRequestLatencies } = await import("@/lib/ai/provider/request-latency");
    for (let n = 0; n < 12; n++) await recordRequestLatency("fixture-model", n);
    expect((await readRequestLatencies())["fixture-model"].samples).toEqual([2,3,4,5,6,7,8,9,10,11]);
  });

  it("activates the three-hour cooldown from completion and isolates concurrent cycles", async () => {
    const { claimLatencyCycle, completeLatencyCycle } = await import("@/lib/ai/model-latency-cooldown");
    expect(await claimLatencyCycle("initial")).toBe(true);
    expect(await claimLatencyCycle("other")).toBe(false);
    expect(await claimLatencyCycle("initial", undefined, true)).toBe(true);
    await completeLatencyCycle("initial");
    expect(await claimLatencyCycle("initial", undefined, true)).toBe(false);
    expect(await claimLatencyCycle("other")).toBe(false);
  });

  it("inherits global changes while preserving overrides until reset", async () => {
    const first = [MODEL_IDS.flash38, MODEL_IDS.default, MODEL_IDS.stableFlash];
    const next = [MODEL_IDS.stableFlash, MODEL_IDS.flash38, MODEL_IDS.default];
    await saveModelSetting({ feature: "global-default", models: first, updatedBy: adminActorId });
    expect(await configuredModelChain({ feature: "zyra" }, [])).toEqual(first);
    await saveModelSetting({ feature: "zyra", models: first, updatedBy: adminActorId });
    await saveModelSetting({ feature: "global-default", models: next, updatedBy: adminActorId });
    expect(await configuredModelChain({ feature: "zyra" }, [])).toEqual(first);
    expect(await configuredModelChain({ feature: "admin-quiz-insights" }, [])).toEqual(next);
    await resetModelSetting({ feature: "zyra" });
    expect(await configuredModelChain({ feature: "zyra" }, [])).toEqual(next);
    expect((await listModelSettingViews()).find(view => view.feature === "zyra")).toMatchObject({ models: next, isCustom: false });
  });

  it("rejects stale concurrent updates and resets with ModelSettingConflictError instead of silently overwriting", async () => {
    const first = await saveModelSetting({
      feature: "admin-ops-ai",
      models: [
        MODEL_IDS.stableFlash,
        MODEL_IDS.default,
        MODEL_IDS.flash38,
      ],
      updatedBy: adminActorId,
      expectedUpdatedAt: null,
    });

    // Concurrent create attempt expecting row not to exist yet (expectedUpdatedAt: null)
    await expect(
      saveModelSetting({
        feature: "admin-ops-ai",
        models: [
          MODEL_IDS.default,
          MODEL_IDS.stableFlash,
          MODEL_IDS.emergencyText,
        ],
        updatedBy: adminActorId,
        expectedUpdatedAt: null,
      }),
    ).rejects.toBeInstanceOf(ModelSettingConflictError);

    // Legitimate update with matching expectedUpdatedAt succeeds
    const second = await saveModelSetting({
      feature: "admin-ops-ai",
      models: [
        MODEL_IDS.stableFlash,
        MODEL_IDS.default,
        MODEL_IDS.emergencyText,
      ],
      updatedBy: adminActorId,
      expectedUpdatedAt: first.updatedAt.toISOString(),
    });
    expect(second.models).toEqual([
      MODEL_IDS.stableFlash,
      MODEL_IDS.default,
      MODEL_IDS.emergencyText,
    ]);

    // Stale update using first.updatedAt fails with conflict and leaves second intact
    await expect(
      saveModelSetting({
        feature: "admin-ops-ai",
        models: [
          MODEL_IDS.emergencyText,
          MODEL_IDS.stableFlash,
          MODEL_IDS.default,
        ],
        updatedBy: adminActorId,
        expectedUpdatedAt: first.updatedAt.toISOString(),
      }),
    ).rejects.toBeInstanceOf(ModelSettingConflictError);

    // Stale reset using first.updatedAt also fails with conflict
    await expect(
      resetModelSetting({
        feature: "admin-ops-ai",
        expectedUpdatedAt: first.updatedAt.toISOString(),
      }),
    ).rejects.toBeInstanceOf(ModelSettingConflictError);

    const activeChain = await configuredModelChain(
      { feature: "admin-ops-ai", requireGenerateContent: true },
      [MODEL_IDS.stableFlash],
    );
    expect(activeChain).toEqual([
      MODEL_IDS.stableFlash,
      MODEL_IDS.default,
      MODEL_IDS.emergencyText,
    ]);
  });
});
