import type { Page } from "playwright-core";
import { randomBytes } from "node:crypto";
import { formativeDocumentFields } from "@/lib/bundle/product-v4-verification";
import { formativeAnswerForReveal } from "@/lib/materials/formative-check-answer";
import { parseInteractiveDocumentsInMarkdown } from "@/lib/materials/interactive-document-markdown";
import { verificationPreviewSchema } from "@/lib/materials/verification-preview";
import { interactiveDocumentResponse, verifyInteractiveDocumentAsset } from "@/lib/materials/interactive-document-server";
import { mintInteractiveDocumentGrant, verifyInteractiveDocumentGrant } from "@/lib/materials/interactive-document-grant";

type Field = ReturnType<typeof formativeDocumentFields>[number];

export function assertNoHiddenFormativeDocuments(article: Field["article"], preview: unknown) {
  const hidden = article.sections.flatMap(section => section.blocks.flatMap(block => block.formativeCheckPayload ? [block.formativeCheckPayload.answer, block.formativeCheckPayload.explanation].flatMap(parseInteractiveDocumentsInMarkdown) : []));
  const text = JSON.stringify(preview);
  if (hidden.some(spec => text.includes(spec.documentSha256) || text.includes(spec.printSha256) || text.includes(`"visualId":${JSON.stringify(spec.id)}`) || text.includes(`"id":${JSON.stringify(spec.id)}`))) throw new Error("VERIFICATION_FORMATIVE_PUBLIC_FIELD_REDACTED");
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
  await verifyInteractiveDocumentAsset(field.spec, "document", documentBytes);
  await verifyInteractiveDocumentAsset(field.spec, "print", print);
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
  const controls = first.body.locator('input[type="range"], select, input[type="checkbox"], button');
  let changed = false;
  for (const control of await controls.all()) {
    if (!await control.isVisible() || !await control.isEnabled()) continue;
    const before = await first.body.evaluate(() => JSON.stringify({ html: document.body.innerHTML, controls: [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select,textarea")].map(control => [control.value, "checked" in control ? control.checked : null]) }));
    const tag = await control.evaluate(element => element.tagName);
    const type = await control.getAttribute("type");
    await control.focus();
    await control.press(tag === "SELECT" ? "ArrowDown" : type === "range" ? "ArrowRight" : "Space");
    changed = await first.body.evaluate(async initial => {
      const snapshot = () => JSON.stringify({ html: document.body.innerHTML, controls: [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select,textarea")].map(control => [control.value, "checked" in control ? control.checked : null]) });
      for (let attempt = 0; attempt < 30; attempt++) {
        if (snapshot() !== initial) return true;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return false;
    }, before);
    if (changed) break;
  }
  if (!changed) throw new Error("VERIFICATION_VISUAL_STATE_UNSUPPORTED:keyboard-change");
  await host.getByRole("button", { name: "Tutup visual", exact: true }).click();
  if (await host.locator("iframe").count()) throw new Error("VERIFICATION_DOCUMENT_UNMOUNT_FAILED");
  if (!await host.getByText(field.spec.staticFallback.summary, { exact: true }).count()) throw new Error("VERIFICATION_DOCUMENT_FALLBACK_MISSING");
  const reset = await open();
  if (reset.state !== first.state || responseCount < 2) throw new Error("VERIFICATION_RESET_FAILED");
  return { field: field.field.startsWith("prompt:") ? "prompt" : field.field.startsWith("option:") ? "option" : field.field, reveal: hidden ? "simulated scoped response" : "not required", states: ["default", "keyboard-change", "reset"], scientificModel: "NOT_TESTED" };
}
