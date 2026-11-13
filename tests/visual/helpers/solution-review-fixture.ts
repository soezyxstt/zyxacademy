import type { Page } from "@playwright/test";

export const criterionLabels = ["Ketepatan soal dan jawaban", "Penalaran dan pemeriksaan", "Provenance soal", "Provenance solusi", "Kelayakan rilis ke mahasiswa"];

export async function decideItem(page: Page, decision: "Disetujui" | "Perlu revisi") {
  for (const label of criterionLabels) {
    await page.getByLabel(label, { exact: true }).click();
    await page.getByRole("option", { name: decision }).click();
  }
}

export async function installReviewMock(page: Page, failLoad = false) {
  await page.addInitScript((initialFailLoad) => {
    const original = window.fetch.bind(window);
    const state = { revision: "revision-1", hashes: ["hash-triangle", "hash-python"], failLoad: initialFailLoad, failSave: false, submitted: null as unknown, saved: null as unknown };
    (window as any).__solutionReviewMock = state;
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes("/solution-review")) return original(input, init);
      const bytes = new TextEncoder().encode(JSON.stringify(state.saved));
      const reviewVersion = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
      if (init?.method === "POST") {
        state.submitted = JSON.parse(String(init.body));
        if ((state.submitted as any).expectedRevision !== state.revision) return new Response(JSON.stringify({ error: "PRODUCT_BUNDLE_STALE_CONTEXT" }), { status: 409, headers: { "content-type": "application/json" } });
        if ((state.submitted as any).expectedReviewVersion !== reviewVersion) return new Response(JSON.stringify({ error: "PRODUCT_V5_REVIEW_STALE" }), { status: 409, headers: { "content-type": "application/json" } });
        if (!state.failSave) {
          const request = state.submitted as any;
          state.saved = { decision: request.decision, items: request.items.map((item: any) => ({ itemId: item.itemId, itemHash: item.itemHash, correctness: item.correctness, reasoning: item.reasoning, problemProvenance: item.problemProvenance, solutionProvenance: item.solutionProvenance, release: item.release, notes: item.notes?.trim() || undefined })) };
        }
        return new Response("{}", { status: state.failSave ? 409 : 200, headers: { "content-type": "application/json" } });
      }
      if ((state as any).delayContext) {
        await new Promise<void>(resolve => { (state as any).releaseContext = resolve; });
        (state as any).releaseContext = null;
        (state as any).delayContext = false;
      }
      if (state.failLoad) return new Response("invalid json", { status: 200 });
      return new Response(JSON.stringify({ result: { reviewerId: "fixture-reviewer", savedReview: state.saved, reviewVersion, revision: state.revision, productId: "collection-demo", itemHashes: [
        { itemId: "triangle-area", itemHash: state.hashes[0] }, { itemId: "python-loop", itemHash: state.hashes[1] },
      ] } }), { status: 200, headers: { "content-type": "application/json" } });
    };
  }, failLoad);
}

