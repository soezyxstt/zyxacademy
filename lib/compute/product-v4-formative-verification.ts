import type { Locator, Page } from "playwright-core";
import { randomBytes } from "node:crypto";
import { formativeDocumentFields } from "@/lib/bundle/product-v4-verification";
import { formativeAnswerForReveal } from "@/lib/materials/formative-check-answer";
import { parseInteractiveDocumentsInMarkdown } from "@/lib/materials/interactive-document-markdown";
import { verificationPreviewSchema } from "@/lib/materials/verification-preview";
import { interactiveDocumentSchema } from "@/lib/materials/interactive-document";
import { interactiveDocumentResponse, verifyAdmittedInteractiveDocumentAsset } from "@/lib/materials/interactive-document-verified";
import { mintInteractiveDocumentGrant, verifyInteractiveDocumentGrant } from "@/lib/materials/interactive-document-grant";
export async function documentInteractionSnapshot(body: Locator): Promise<string> {
  return body.evaluate(() => {
    const canvases = [...document.querySelectorAll("canvas")];
    if (canvases.length > 16) throw new Error("VERIFICATION_DOCUMENT_CANVAS_LIMIT");
    const pixels = canvases.map(canvas => {
      if (!canvas.width || !canvas.height) return null;
      // shortcut: 32px sampling can miss small changes, upgrade if finer bounded evidence is required.
      const sample = document.createElement("canvas");
      sample.width = sample.height = 32;
      const context = sample.getContext("2d");
      if (!context) throw new Error("VERIFICATION_DOCUMENT_CANVAS_UNAVAILABLE");
      context.drawImage(canvas, 0, 0, 32, 32);
      const data = context.getImageData(0, 0, 32, 32).data;
      let a = 2166136261, b = 5381;
      for (const byte of data) { a = Math.imul(a ^ byte, 16777619); b = Math.imul(b, 33) ^ byte; }
      return [canvas.width, canvas.height, a, b];
    });
    return JSON.stringify({
      text: document.body.textContent,
      controls: [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea")].map(control => [control.value, "checked" in control ? control.checked : null]),
      states: [...document.querySelectorAll("[aria-pressed],[aria-checked],[aria-expanded],[aria-selected],[aria-valuenow]")].map(element => ["aria-pressed", "aria-checked", "aria-expanded", "aria-selected", "aria-valuenow"].map(name => element.getAttribute(name))),
      graphics: [...document.querySelectorAll("svg")].map(svg => svg.innerHTML),
      pixels,
    });
  });
}

export async function waitForDocumentInteraction(body: Locator, initial: string, changed: boolean): Promise<boolean> {
  if (!changed && await documentInteractionSnapshot(body) !== initial) return false;
  let previous = "";
  // Observe the full window for stability so delayed restoration cannot certify a reset.
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 50));
    const current = await documentInteractionSnapshot(body);
    if (!changed && current !== initial) return false;
    if (changed && current !== initial && current === previous) return true;
    previous = current;
  }
  return !changed;
}

type Field = ReturnType<typeof formativeDocumentFields>[number];

export function assertNoHiddenFormativeDocuments(article: Field["article"], preview: unknown) {
  const hidden = article.sections.flatMap(section => section.blocks.flatMap(block => block.formativeCheckPayload ? [block.formativeCheckPayload.answer, block.formativeCheckPayload.explanation].flatMap(parseInteractiveDocumentsInMarkdown) : []));
  const text = JSON.stringify(preview);
  const registry = preview && typeof preview === "object" && "visuals" in preview && Array.isArray(preview.visuals) ? preview.visuals : [];
  const visibleIds = new Set(registry.flatMap(value => {
    const parsed = interactiveDocumentSchema.safeParse(value);
    return parsed.success && !hidden.some(spec => [spec.documentSha256, spec.printSha256].some(hash => hash === parsed.data.documentSha256 || hash === parsed.data.printSha256)) ? [parsed.data.id] : [];
  }));
  if (hidden.some(spec => text.includes(spec.documentSha256) || text.includes(spec.printSha256) || (!visibleIds.has(spec.id) && (text.includes(`"visualId":${JSON.stringify(spec.id)}`) || text.includes(`"id":${JSON.stringify(spec.id)}`))))) throw new Error("VERIFICATION_FORMATIVE_PUBLIC_FIELD_REDACTED");
}

export function formativeVerificationPreview(field: Field, scope: string) {
  const payload = field.block.formativeCheckPayload!;
  const check = { checkKind: payload.checkKind, options: payload.options?.map(({ id, text }) => ({ id, text })), evaluationMode: payload.evaluation?.mode ?? null, unit: payload.evaluation?.mode === "numeric" ? payload.evaluation.unit : undefined };
  const parts = field.field.startsWith("prompt:") ? [{ id: field.field.slice(7), kind: "markdown" as const, markdown: field.value }] : [{ id: "verification-prompt", kind: "markdown" as const, markdown: "Pertanyaan" }];
  const options = check.options?.map((option, index) => ({ ...option, text: field.field === `option:${index}` ? option.text : "Pilihan" }));
  const preview = verificationPreviewSchema.parse({ type: "zyx-verification-preview.v1", title: "", sections: [], visuals: [], documentScope: scope, formative: { sectionId: field.section.id, blockId: field.block.id, parts, check: { ...check, ...(options ? { options } : {}), feedbackPolicy: undefined } } });
  assertNoHiddenFormativeDocuments(field.article, preview);
  return preview;
}

export function formativeVerificationResponses(field: Field, grant: string) {
  const locator = { articleId: "verification", articleVersion: 1, sectionId: field.section.id, blockId: field.block.id };
  const evaluationRequired = Boolean(field.block.formativeCheckPayload!.evaluation);
  let evaluated = false, revealed = false;
  return {
    get revealed() { return revealed; },
    handle(action: string, method: string, body: unknown) {
      if (method !== "POST" || !body || typeof body !== "object" || Array.isArray(body)) return null;
      const value = body as Record<string, unknown>;
      if (!Object.entries(locator).every(([key, expected]) => value[key] === expected)) return null;
      if (action === "evaluate" && Object.keys(value).length === 5 && value.response && typeof value.response === "object") {
        evaluated = true;
        return { ok: true, result: { verdict: "incorrect", feedback: "Coba lagi", canRetry: false, revealAllowed: true } };
      }
      if (action !== "reveal" || Object.keys(value).length !== 4 || (evaluationRequired && !evaluated)) return null;
      revealed = true;
      return { answer: formativeAnswerForReveal(field.block.formativeCheckPayload!), explanation: field.block.formativeCheckPayload!.explanation, visualAccess: { [field.field]: grant } };
    },
  };
}

export async function executeFormativeDocumentCheck(page: Page, baseUrl: string, field: Field, assets: { document: Uint8Array; print: Uint8Array } | undefined, scope: string) {
  if (!assets) throw new Error("VERIFICATION_DOCUMENT_ASSET_UNAVAILABLE");
  const documentBytes = Buffer.from(assets.document), print = Buffer.from(assets.print);
  verifyAdmittedInteractiveDocumentAsset(field.spec, "document", documentBytes);
  verifyAdmittedInteractiveDocumentAsset(field.spec, "print", print);
  const preview = formativeVerificationPreview(field, scope);
  const hidden = field.field === "answer" || field.field === "explanation";
  const secret = randomBytes(32).toString("hex");
  const grant = hidden ? mintInteractiveDocumentGrant({ userId: "verification", articleId: "verification", articleVersion: 1, sectionId: field.section.id, blockId: field.block.id, field: field.field as "answer" | "explanation", draftId: scope, draftChecksum: scope + scope }, secret) : "";
  const endpoint = `/api/admin/bundles/product/${scope}/formative-check`;
  const responses = formativeVerificationResponses(field, grant);
  let responseCount = 0;
  await page.route(url => url.origin === baseUrl && url.pathname.startsWith(endpoint + "/"), async route => {
    const request = route.request();
    let body: Record<string, unknown>;
    try { body = request.postDataJSON(); } catch { return route.abort(); }
    const action = request.url() === `${baseUrl}${endpoint}/evaluate` ? "evaluate" : request.url() === `${baseUrl}${endpoint}/reveal` ? "reveal" : "";
    const result = responses.handle(action, request.method(), body);
    if (!result) return route.abort();
    return route.fulfill({ json: result, headers: { "Cache-Control": "private, no-store" } });
  });
  const query = hidden
    ? new URLSearchParams({ grant, visualId: field.spec.id, hash: field.spec.documentSha256, kind: "document" })
    : field.field.startsWith("option:")
      ? new URLSearchParams({ courseId: "verification", articleId: "verification", articleVersion: "1", sectionId: field.section.id, blockId: field.block.id, optionId: field.block.formativeCheckPayload!.options![Number(field.field.slice(7))].id, visualId: field.spec.id, hash: field.spec.documentSha256, kind: "document", draftId: scope, checksum: scope })
      : new URLSearchParams({ courseId: "verification", articleId: "verification", articleVersion: "1", sectionId: field.section.id, blockId: field.block.id, field: "markdown", partId: field.field.slice(7), visualId: field.spec.id, hash: field.spec.documentSha256, kind: "document", checksum: scope });
  const path = hidden ? "/api/materials/interactive-document/reveal" : field.field.startsWith("option:") ? "/api/materials/interactive-document/option" : `/api/admin/bundles/product/${scope}/interactive-document`;
  const resourceUrl = `${baseUrl}${path}?${query}`;
  const response = interactiveDocumentResponse(documentBytes, "document");
  const responseBody = Buffer.from(await response.arrayBuffer());
  await page.route(url => url.origin === baseUrl && url.pathname === path, async route => {
    if (route.request().url() !== resourceUrl || route.request().method() !== "GET" || (hidden && !responses.revealed)) return route.abort();
    if (hidden) {
      const authorized = verifyInteractiveDocumentGrant(grant, "verification", secret);
      const matches = parseInteractiveDocumentsInMarkdown(field.value).filter(spec => spec.id === field.spec.id && spec.documentSha256 === field.spec.documentSha256);
      if (!authorized || authorized.field !== field.field || authorized.sectionId !== field.section.id || authorized.blockId !== field.block.id || authorized.draftId !== scope || authorized.draftChecksum !== scope + scope || matches.length !== 1) return route.abort();
    }
    responseCount++;
    await route.fulfill({ status: 200, headers: Object.fromEntries(response.headers), body: responseBody });
  });
  await page.evaluate(payload => window.postMessage(payload, window.location.origin), preview);
  await page.waitForSelector("[data-verification-loaded]");
  if (hidden) {
    if (await page.locator("main figure").count() || responseCount) throw new Error("VERIFICATION_FORMATIVE_HIDDEN_EXPOSED");
    if (preview.formative!.check.evaluationMode) {
      const kind = preview.formative!.check.checkKind;
      if (kind === "multiple_choice") await page.getByRole("radio").first().click();
      else if (kind === "numeric_answer") await page.getByPlaceholder("Masukkan angka").fill("1");
      else if (kind === "short_answer") await page.getByPlaceholder("Tulis jawabanmu").fill("test");
      else await page.getByPlaceholder("Jelaskan alasan atau langkah berpikirmu").fill("test");
      await page.getByRole("button", { name: "Periksa jawaban" }).click();
    }
    await page.getByRole("button", { name: "Buka jawaban dan pembahasan" }).click();
    if (!responses.revealed) throw new Error("VERIFICATION_FORMATIVE_REVEAL_MISSING");
  }
  let container = page.locator("main");
  if (field.field.startsWith("option:")) container = page.locator("[data-formative-option]").nth(Number(field.field.slice(7)));
  else if (field.field === "answer" || field.field === "explanation") container = page.getByText(field.field === "answer" ? "Jawaban" : "Penjelasan dan pembahasan", { exact: true }).locator("..");
  else {
    const matches = await page.locator("main [data-part-id]").all();
    const part = (await Promise.all(matches.map(async item => (await item.getAttribute("data-part-id")) === field.field.slice(7) ? item : null))).find(Boolean);
    if (!part) throw new Error("VERIFICATION_FORMATIVE_FIELD_MISSING");
    container = part;
  }
  const host = container.locator("figure[data-interactive-document]").nth(field.index);
  if (await host.getAttribute("id") !== field.spec.id) throw new Error("VERIFICATION_FORMATIVE_FIELD_MISMATCH");
  const open = async () => {
    await host.getByRole("button", { name: "Buka visual", exact: true }).click();
    const iframe = host.locator("iframe");
    await iframe.waitFor();
    if (await iframe.getAttribute("sandbox") !== "allow-scripts") throw new Error("VERIFICATION_DOCUMENT_SANDBOX_INVALID");
    await host.locator("iframe:not([inert])").waitFor({ state: "attached", timeout: 16000 });
    const body = iframe.contentFrame().locator("body");
    await body.waitFor();
    const state = await body.evaluate(async () => { await document.fonts.ready; return { text: document.body.textContent, graphics: [...document.querySelectorAll("svg")].map(svg => svg.innerHTML), controls: [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select,textarea")].map(control => [control.value, "checked" in control ? control.checked : null]), bad: document.documentElement.scrollWidth > document.documentElement.clientWidth || (!document.body.textContent?.trim() && !document.querySelector("svg,canvas,img")) || [...document.images].some(image => !image.complete || !image.naturalWidth) || [...document.fonts].some(font => font.status === "error") }; });
    if (state.bad) throw new Error("VERIFICATION_DOCUMENT_RENDER_INVALID");
    return { body, state: JSON.stringify(state) };
  };
  const first = await open();
  const initial = await documentInteractionSnapshot(first.body);
  if (!await waitForDocumentInteraction(first.body, initial, false)) throw new Error("VERIFICATION_DOCUMENT_RENDER_UNSTABLE");
  const controls = first.body.locator('input[type="range"], select, input[type="checkbox"], button');
  let changed = false;
  for (const control of await controls.all()) {
    if (!await control.isVisible() || !await control.isEnabled()) continue;
    const tag = await control.evaluate(element => element.tagName);
    const type = await control.getAttribute("type");
    await control.focus();
    const before = await documentInteractionSnapshot(first.body);
    if (!await waitForDocumentInteraction(first.body, before, false)) throw new Error("VERIFICATION_DOCUMENT_RENDER_UNSTABLE");
    await control.press(tag === "SELECT" ? "ArrowDown" : type === "range" ? "ArrowRight" : "Space");
    changed = await waitForDocumentInteraction(first.body, before, true);
    if (changed) break;
  }
  if (!changed) throw new Error("VERIFICATION_VISUAL_STATE_UNSUPPORTED:keyboard-change");
  await host.getByRole("button", { name: "Tutup visual", exact: true }).click();
  if (await host.locator("iframe").count()) throw new Error("VERIFICATION_DOCUMENT_UNMOUNT_FAILED");
  if (!await host.getByText(field.spec.staticFallback.summary, { exact: true }).count()) throw new Error("VERIFICATION_DOCUMENT_FALLBACK_MISSING");
  const reset = await open();
  if (reset.state !== first.state || !await waitForDocumentInteraction(reset.body, initial, false) || responseCount < 2) throw new Error("VERIFICATION_RESET_FAILED");
  return { field: field.field.startsWith("prompt:") ? "prompt" : field.field.startsWith("option:") ? "option" : field.field, reveal: hidden ? "simulated scoped response" : "not required", states: ["default", "keyboard-change", "reset"], scientificModel: "NOT_TESTED" };
}
