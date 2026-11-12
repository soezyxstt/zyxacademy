import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getProductBundleImport, parseStagedProductBundle } from "@/lib/bundle/product-staging";
import { authorizeDraftArticleDocument } from "@/lib/materials/interactive-document-authorization";
import { readInteractiveDocumentAsset } from "@/lib/materials/interactive-document-assets";
import { interactiveDocumentResponse, verifyInteractiveDocumentAsset } from "@/lib/materials/interactive-document-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const id = z.string().min(1).max(200);
const querySchema = z.object({ courseId: id, articleId: id, articleVersion: z.coerce.number().int().positive(), sectionId: id, blockId: id, field: z.enum(["visual_ref", "markdown", "content"]), partId: id.optional(), visualId: id, hash: z.string().regex(/^[a-f0-9]{64}$/), checksum: z.string().regex(/^[a-f0-9]{64}$/), kind: z.enum(["document", "print"]) }).strict();
const unavailable = (status: number) => new Response(null, { status, headers: { "Cache-Control": "private, no-store" } });

async function deliver(request: Request, context: { params: Promise<{ id: string }> }, head: boolean) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") return unavailable(401);
  const search = new URL(request.url).searchParams;
  if ([...search.keys()].some((key) => search.getAll(key).length !== 1)) return unavailable(400);
  const parsed = querySchema.safeParse(Object.fromEntries(search));
  if (!parsed.success) return unavailable(400);
  const input = parsed.data;
  try {
    const { id: importId } = await context.params;
    const row = await getProductBundleImport(importId);
    if (!row || row.status !== "draft" || row.checksum !== input.checksum) return unavailable(404);
    const bundle = await parseStagedProductBundle(importId);
    if (bundle.checksum !== input.checksum) return unavailable(404);
    const products = bundle.products.filter((product) => product.productType === "article" && product.id === input.articleId && product.version === input.articleVersion && product.courseId === input.courseId);
    const product = products[0];
    if (products.length !== 1 || !product || product.productType !== "article") return unavailable(404);
    const spec = authorizeDraftArticleDocument({ ...input, version: input.articleVersion, product });
    if (!spec) return unavailable(404);
    const document = bundle.files.get(`visuals/${spec.documentSha256}.html`);
    const print = bundle.files.get(`visuals/${spec.printSha256}.png`);
    if (!document || !print) return unavailable(404);
    await verifyInteractiveDocumentAsset(spec, "document", document);
    await verifyInteractiveDocumentAsset(spec, "print", print);
    const response = interactiveDocumentResponse(await readInteractiveDocumentAsset(spec, input.kind), input.kind);
    return head ? new Response(null, { status: response.status, headers: response.headers }) : response;
  } catch {
    return unavailable(503);
  }
}

export function GET(request: Request, context: { params: Promise<{ id: string }> }) { return deliver(request, context, false); }
export function HEAD(request: Request, context: { params: Promise<{ id: string }> }) { return deliver(request, context, true); }
