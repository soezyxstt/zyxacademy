import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { InteractiveDocumentVisual } from "@/components/course/interactive-document-visual";
import { ProductLearningVisual } from "@/components/course/product-learning-visual";
import { InteractiveDocumentArticle, InteractiveDocumentArticleLocation, useInteractiveDocumentUrl } from "@/components/course/interactive-document-context";
import { ArticleParts } from "@/components/course/article-parts";
import { interactiveDocumentSchema } from "@/lib/materials/interactive-document";
import { interactiveDocumentResponse, verifyInteractiveDocumentAsset } from "@/lib/materials/interactive-document-server";
import { visualSpecSchema } from "@/lib/materials/visual-contract";
import { parseEmbeddedVisual } from "@/lib/materials/embedded-visuals";

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const html = new TextEncoder().encode("<!doctype html><canvas></canvas><script>document.querySelector('canvas')</script>");
const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: "#fff" } }).png().toBuffer();
const metadata = {
  id: "demo", kind: "interactive_document", version: 1, label: "Grafik", description: "Grafik bergerak.",
  documentSha256: digest(html), documentBytes: html.length, printSha256: digest(png), printBytes: png.length,
  height: 400, staticFallback: { type: "text", summary: "Grafik", content: "Nilai awal." }, printCaption: "Keadaan awal.",
} as const;

describe("interactive document foundation", () => {
  test("keeps registered metadata strict and rejects inline source", () => {
    expect(interactiveDocumentSchema.safeParse(metadata).success).toBe(true);
    expect(interactiveDocumentSchema.safeParse({ ...metadata, html: "<script>" }).success).toBe(false);
    expect(interactiveDocumentSchema.safeParse({ ...metadata, label: "<script>" }).success).toBe(false);
    expect(interactiveDocumentSchema.safeParse({ ...metadata, height: 1201 }).success).toBe(false);
    expect(visualSpecSchema.safeParse(metadata).success).toBe(true);
    expect(parseEmbeddedVisual(JSON.stringify(metadata))).toEqual(metadata);
    expect(parseEmbeddedVisual(JSON.stringify({ ...metadata, html: "<script>" }))).toBeNull();
  });

  test("checks exact bytes, UTF-8 and decoded PNG", async () => {
    const spec = interactiveDocumentSchema.parse(metadata);
    await verifyInteractiveDocumentAsset(spec, "document", html);
    await verifyInteractiveDocumentAsset(spec, "print", png);
    await expect(verifyInteractiveDocumentAsset(spec, "document", new Uint8Array(html.length))).rejects.toThrow();
    const invalid = Uint8Array.from([255, 254]);
    await expect(verifyInteractiveDocumentAsset({ ...spec, documentBytes: invalid.length, documentSha256: digest(invalid) }, "document", invalid)).rejects.toThrow();
    await expect(verifyInteractiveDocumentAsset({ ...spec, printBytes: html.length, printSha256: digest(html) }, "print", html)).rejects.toThrow();
    const truncated = png.subarray(0, png.length - 4);
    await expect(verifyInteractiveDocumentAsset({ ...spec, printBytes: truncated.length, printSha256: digest(truncated) }, "print", truncated)).rejects.toThrow();
  });

  test("response isolates direct navigation and initial host does not load content", () => {
    const response = interactiveDocumentResponse(html, "document");
    const csp = response.headers.get("content-security-policy") ?? "";
    for (const directive of ["sandbox allow-scripts", "default-src 'none'", "connect-src 'none'", "form-action 'none'", "frame-ancestors 'self'"]) expect(csp).toContain(directive);
    expect(csp).not.toContain("allow-same-origin");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("permissions-policy")).toContain("camera=()");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const markup = renderToStaticMarkup(<InteractiveDocumentVisual spec={interactiveDocumentSchema.parse(metadata)} assetUrl="/api/fixture/demo" />);
    expect(markup).not.toContain("<iframe");
    expect(markup).not.toContain("<script");
    expect(markup).toContain("Buka visual");
    const fallback = renderToStaticMarkup(<InteractiveDocumentVisual spec={interactiveDocumentSchema.parse(metadata)} />);
    expect(fallback).toContain("Nilai awal.");
    expect(fallback).not.toContain("Buka visual");
  });

  test("appends host readiness after verified source and leaves print bytes unchanged", async () => {
    await verifyInteractiveDocumentAsset(interactiveDocumentSchema.parse(metadata), "document", html);
    const served = new Uint8Array(await interactiveDocumentResponse(html, "document").arrayBuffer());
    expect(served.subarray(0, html.length)).toEqual(html);
    const bootstrap = new TextDecoder().decode(served.subarray(html.length));
    expect(bootstrap.startsWith("<script>")).toBe(true);
    let ready: (() => void) | undefined;
    const messages: unknown[] = [];
    runInNewContext(bootstrap.slice(8, -9), {
      document: { addEventListener: (event: string, callback: () => void, options: { once: boolean }) => { expect(event).toBe("DOMContentLoaded"); expect(options.once).toBe(true); ready = callback; } },
      parent: { postMessage: (message: unknown, target: string) => messages.push({ message, target }) },
    });
    expect(messages).toHaveLength(0);
    ready?.();
    expect(JSON.stringify(messages)).toBe('[{"message":{"type":"zyx:ready"},"target":"*"}]');
    expect(new Uint8Array(await interactiveDocumentResponse(png, "print").arrayBuffer())).toEqual(new Uint8Array(png));
  });

  test("the visual dispatcher only enables a scoped article field", () => {
    const spec = interactiveDocumentSchema.parse(metadata);
    const unscoped = renderToStaticMarkup(<ProductLearningVisual spec={spec} />);
    expect(unscoped).toContain("Nilai awal.");
    expect(unscoped).not.toContain("Buka visual");
    const scoped = renderToStaticMarkup(<InteractiveDocumentArticle value={{ courseId: "course", articleId: "article", articleVersion: 1 }}><InteractiveDocumentArticleLocation sectionId="section" blockId="block" field="visual_ref" partId="part"><ProductLearningVisual spec={spec} /></InteractiveDocumentArticleLocation></InteractiveDocumentArticle>);
    expect(scoped).toContain("Buka visual");
    expect(scoped).not.toContain("<iframe");
    const actualPart = renderToStaticMarkup(<InteractiveDocumentArticle value={{ courseId: "course", articleId: "article", articleVersion: 1 }}><InteractiveDocumentArticleLocation sectionId="section" blockId="block" field="content"><ArticleParts parts={[{ id: "part", kind: "visual_ref", visualId: spec.id }]} visuals={[spec]} /></InteractiveDocumentArticleLocation></InteractiveDocumentArticle>);
    expect(actualPart).toContain("Buka visual");
    function UrlProbe() { return <span data-url={useInteractiveDocumentUrl(spec)} />; }
    const urlMarkup = renderToStaticMarkup(<InteractiveDocumentArticle value={{ courseId: "course", articleId: "article", articleVersion: 1 }}><InteractiveDocumentArticleLocation sectionId="section" blockId="block" field="visual_ref" partId="part"><UrlProbe /></InteractiveDocumentArticleLocation></InteractiveDocumentArticle>);
    expect(urlMarkup).toContain("/api/materials/interactive-document/article?");
    expect(urlMarkup).toContain("field=visual_ref");
    expect(urlMarkup).toContain("partId=part");
  });
});
