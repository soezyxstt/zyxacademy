import { findUnmarkedScientificProse } from "@/lib/math/unmarked-scientific";
import { z } from "zod";
import type { ProductV4VerificationPorts } from "@/lib/bundle/product-v4-verification-service";
import type { ProductV4ObservedCheck } from "@/lib/bundle/product-v4-verification";
import { loadProductV4StaticFigureAssets } from "./product-v4-runtime-binding";
import { articlePartsSchema, validateArticlePartReferences } from "@/lib/materials/article-parts";
import { visualSpecSchema } from "@/lib/materials/visual-contract";
import { deriveEpsilonDelta } from "@/lib/materials/epsilon-delta";
import { validateAuthoredDiktat } from "@/lib/materials/diktat-v4";
import { compileArticleProduct } from "@/lib/materials/compiler";
import { runVerificationBrowserOperation } from "./product-v4-browser-session";
import { isHostedComputeRuntime } from "./runtime";

export { buildProductV4RuntimeBinding } from "./product-v4-runtime-binding";

const artifact = z.object({
  id: z.string().min(1).max(500), mediaType: z.enum(["image/png", "application/pdf", "application/json"]),
  base64: z.string().max(70_000_000), pageNumber: z.number().int().positive().optional(),
}).strict();
const responseSchema = z.object({
  checkId: z.string().regex(/^[a-f0-9]{64}$/), status: z.enum(["PASS", "FAIL", "NOT_TESTED"]),
  expected: z.string().min(1).max(500), observed: z.string().min(1).max(500),
  pageCount: z.number().int().positive().max(4).optional(), artifacts: z.array(artifact).max(300),
  captureTotal: z.number().int().positive().max(300).optional(),
}).strict();

/** The endpoint and credentials are server configuration, never MCP parameters. */
export const executeProductV4VerificationCheck: ProductV4VerificationPorts["execute"] = async (input): Promise<ProductV4ObservedCheck> => {
  if (input.requirement.layer === "structure" || input.requirement.layer === "model") {
    const findings: string[] = [];
    const observations: unknown[] = [];
    if (input.requirement.layer === "structure") {
      for (const product of input.bundle.products) {
        if (input.bundle.manifest.schemaVersion === "product-bundle.v4" || product.schemaVersion === "article.v4" || product.schemaVersion === "diktat.v4") findings.push(...findUnmarkedScientificProse(product).map((finding) => `UNMARKED_SCIENTIFIC_NOTATION:${product.id}:${finding.path}:${finding.notation}`));
        if (product.productType === "article") {
          const parts = product.sections.flatMap(section => section.blocks.flatMap(block => articlePartsSchema.parse(block.parts)));
          findings.push(...validateArticlePartReferences(parts, (product.visuals ?? []).map(visual => visual.id)));
          compileArticleProduct(product);
        }
        if (product.productType === "diktat") {
          const article = input.bundle.products.find(source => source.productType === "article" && source.id === product.sourceArticleId);
          if (!article || article.productType !== "article") findings.push("DIKTAT_SOURCE_MISSING");
          else findings.push(...validateAuthoredDiktat(article, product));
        }
      }
      observations.push({ contract: "validated staged artifact", referenceErrors: findings });
    } else {
      const visual = input.bundle.products.flatMap(product => product.productType === "article" ? (product.visuals ?? []).map(spec => ({ target: `${product.id}/${spec.id}`, spec })) : []).find(candidate => candidate.target === input.requirement.target)?.spec;
      if (!visual) throw new Error("PRODUCT_V4_VERIFICATION_VISUAL_MISSING");
      visualSpecSchema.parse(visual);
      findings.push(...findUnmarkedScientificProse(visual).map((finding) => `UNMARKED_SCIENTIFIC_NOTATION:${finding.path}:${finding.notation}`));
      if (visual.kind === "epsilon_delta_graph") {
        for (const epsilon of [visual.defaultEpsilon * 0.1, visual.defaultEpsilon, visual.defaultEpsilon * 2.2]) {
          const bound = deriveEpsilonDelta(visual, epsilon);
          observations.push({ epsilon, bound, method: "conservative polynomial analytic bound with floating-point guards" });
        }
      } else if (visual.kind === "source_figure") {
        const assets = await loadProductV4StaticFigureAssets(input.bundle);
        if (!assets[visual.assetId]) findings.push("SOURCE_FIGURE_NOT_VERIFIED");
        observations.push({ assetId: visual.assetId, sourceChecksum: visual.sourceChecksum });
      } else observations.push({ kind: visual.kind, contract: "bounded typed geometry, expressions and units", semanticReview: "required separately" });
    }
    return { checkId: input.requirement.id, status: findings.length ? "FAIL" : "PASS", expected: input.requirement.state,
      observed: findings.length ? "Reference or model constraints failed" : "Application structural and supported model constraints passed; semantic review remains separate",
      artifacts: [{ id: `${input.requirement.id}.json`, mediaType: "application/json", bytes: new TextEncoder().encode(JSON.stringify({ findings, observations })) }] };
  }
  if (isHostedComputeRuntime()) {
    const { executeBrowserProductV4Check, closeProductV4BrowserRunner } = await import("./product-v4-browser-runner");
    return runVerificationBrowserOperation(async (signal) => {
      const staticFigureAssets = await loadProductV4StaticFigureAssets(input.bundle);
      signal.throwIfAborted();
      return executeBrowserProductV4Check({ ...input, signal, baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? "", staticFigureAssets });
    }, closeProductV4BrowserRunner);
  }
  const endpoint = process.env.AUTHORING_VERIFICATION_RENDERER_URL;
  const secret = process.env.AUTHORING_VERIFICATION_RENDERER_SECRET;
  if (!endpoint || !secret) return {
    checkId: input.requirement.id, status: "NOT_TESTED", expected: "Trusted verification executor configured",
    observed: "Renderer configuration is unavailable", artifacts: [],
  };
  const url = new URL(endpoint);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))) throw new Error("PRODUCT_V4_RENDERER_URL_INVALID");
  const figures = await loadProductV4StaticFigureAssets(input.bundle);
  const staticFigureAssets = Object.fromEntries(Object.entries(figures).map(([id, value]) => [id, { ...value, bytes: undefined, base64: Buffer.from(value.bytes).toString("base64") }]));
  const response = await fetch(`${endpoint.replace(/\/$/, "")}/verify`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(120_000),
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, staticFigureAssets }),
  });
  if (!response.ok) throw new Error(`PRODUCT_V4_RENDERER_REJECTED:${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 100 * 1024 * 1024) throw new Error("PRODUCT_V4_RENDERER_OUTPUT_TOO_LARGE");
  const result = responseSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  if (result.checkId !== input.requirement.id) throw new Error("PRODUCT_V4_RENDERER_CHECK_MISMATCH");
  return { ...result, artifacts: result.artifacts.map(({ base64, ...metadata }) => {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw new Error("PRODUCT_V4_RENDERER_ARTIFACT_INVALID");
    const bytes = Buffer.from(base64, "base64");
    if (!bytes.byteLength || bytes.toString("base64") !== base64) throw new Error("PRODUCT_V4_RENDERER_ARTIFACT_INVALID");
    return { ...metadata, bytes: new Uint8Array(bytes) };
  }) };
};
