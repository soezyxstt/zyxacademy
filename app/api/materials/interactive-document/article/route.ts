import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { imporBundle, itemImporBundle, publikasiBundle } from "@/db/schema";
import { auth } from "@/lib/auth";
import { fetchSharedCanonicalArticle } from "@/lib/articles/structured-repository";
import { resolveCourseAccess, canAccessCourseContent } from "@/lib/student/course-access";
import { parseStagedProductBundle } from "@/lib/bundle/product-staging";
import { productEntityHash } from "@/lib/bundle/product-bundle-v2";
import { authorizeArticleDocument } from "@/lib/materials/interactive-document-authorization";
import { readInteractiveDocumentAsset } from "@/lib/materials/interactive-document-assets";
import { interactiveDocumentResponse, verifyInteractiveDocumentAsset } from "@/lib/materials/interactive-document-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const id = z.string().min(1).max(200);
const querySchema = z.object({ courseId: id, articleId: id, articleVersion: z.coerce.number().int().positive(), sectionId: id, blockId: id.optional(), field: z.enum(["visual_ref", "markdown", "content", "section_visual"]), partId: id.optional(), visualId: id, hash: z.string().regex(/^[a-f0-9]{64}$/), kind: z.enum(["document", "print"]) }).strict();
const unavailable = (status: number) => new Response(null, { status, headers: { "Cache-Control": "private, no-store" } });

async function deliver(request: Request, head: boolean) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return unavailable(401);
  const search = new URL(request.url).searchParams;
  if ([...search.keys()].some((key) => search.getAll(key).length !== 1)) return unavailable(400);
  const parsed = querySchema.safeParse(Object.fromEntries(search));
  if (!parsed.success) return unavailable(400);
  const input = parsed.data;
  try {
    const shared = await fetchSharedCanonicalArticle(input.courseId, input.articleId);
    if (!shared || shared.articleRecord.id !== input.articleId || shared.articleRecord.version !== input.articleVersion) return unavailable(404);
    const access = await resolveCourseAccess({ courseId: input.courseId, userId: session.user.id });
    if (!canAccessCourseContent(access, "article", [shared.articleRecord.babId, shared.chapterRecord?.legacyChapterId])) return unavailable(404);
    const suffix = `:v${input.articleVersion}`;
    if (input.articleVersion > 1 && !input.articleId.endsWith(suffix)) return unavailable(404);
    const productId = input.articleVersion === 1 ? input.articleId : input.articleId.slice(0, -suffix.length);
    const imports = await db.select({ importId: imporBundle.id, entityHash: itemImporBundle.entityHash }).from(itemImporBundle)
      .innerJoin(imporBundle, eq(itemImporBundle.imporBundleId, imporBundle.id))
      .innerJoin(publikasiBundle, eq(publikasiBundle.imporBundleId, imporBundle.id))
      .where(and(eq(itemImporBundle.entityType, "article"), eq(itemImporBundle.entityId, productId), eq(itemImporBundle.entityVersion, input.articleVersion), eq(itemImporBundle.status, "published"), eq(imporBundle.bundleType, "product"), eq(imporBundle.status, "published"), eq(publikasiBundle.status, "published"))).limit(2);
    if (imports.length !== 1) return unavailable(404);
    const bundle = await parseStagedProductBundle(imports[0].importId);
    const matches = bundle.products.filter((product) => product.productType === "article" && product.id === productId && product.version === input.articleVersion);
    const product = matches[0];
    if (matches.length !== 1 || !product || product.productType !== "article" || productEntityHash(product) !== imports[0].entityHash) return unavailable(404);
    const spec = authorizeArticleDocument({ ...input, version: input.articleVersion, canonical: { id: shared.articleRecord.id, version: shared.articleRecord.version, sections: shared.parsedSections, blocks: shared.parsedBlocks, visuals: shared.articleVisuals }, product });
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

export function GET(request: Request) { return deliver(request, false); }
export function HEAD(request: Request) { return deliver(request, true); }
