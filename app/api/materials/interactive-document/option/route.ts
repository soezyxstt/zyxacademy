import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { imporBundle, itemImporBundle, publikasiBundle } from "@/db/schema";
import { auth } from "@/lib/auth";
import { fetchSharedCanonicalArticle } from "@/lib/articles/structured-repository";
import { resolveCourseAccess, canAccessCourseContent } from "@/lib/student/course-access";
import { getProductBundleImport, parseStagedProductBundle } from "@/lib/bundle/product-staging";
import { productEntityHash } from "@/lib/bundle/product-bundle-v2";
import { resolvePublishedFormativeCheck } from "@/lib/materials/formative-check-server";
import { resolveDraftProductFormativeCheck } from "@/lib/materials/formative-check-draft-server";
import { formativeCheckPayloadSchema } from "@/lib/materials/pedagogy-contract";
import { interactiveDocumentsInMarkdown } from "@/lib/materials/interactive-document-authorization";
import { readInteractiveDocumentAsset } from "@/lib/materials/interactive-document-assets";
import { interactiveDocumentResponse, verifyInteractiveDocumentAsset } from "@/lib/materials/interactive-document-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const id = z.string().min(1).max(200);
const querySchema = z.object({ courseId: id, articleId: id, articleVersion: z.coerce.number().int().positive(), sectionId: id, blockId: id, optionId: id, visualId: id, hash: z.string().regex(/^[a-f0-9]{64}$/), kind: z.enum(["document", "print"]), draftId: id.optional(), checksum: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict().refine((value) => Boolean(value.draftId) === Boolean(value.checksum));
const unavailable = (status: number) => new Response(null, { status, headers: { "Cache-Control": "private, no-store" } });

async function deliver(request: Request, head: boolean) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return unavailable(401);
  const search = new URL(request.url).searchParams;
  if ([...search.keys()].some((key) => search.getAll(key).length !== 1)) return unavailable(400);
  const parsed = querySchema.safeParse(Object.fromEntries(search));
  if (!parsed.success) return unavailable(400);
  const input = parsed.data;
  const locator = { articleId: input.articleId, articleVersion: input.articleVersion, sectionId: input.sectionId, blockId: input.blockId };
  try {
    const resolved = input.draftId ? await resolveDraftProductFormativeCheck(input.draftId, locator) : await resolvePublishedFormativeCheck(locator);
    if (!resolved.ok) return unavailable(404);
    let importId = input.draftId;
    let productId = input.articleId;
    let sectionKey = input.sectionId;
    let blockKey = input.blockId;
    let entityHash: string | undefined;
    if (importId) {
      if (session.user.role !== "admin" || resolved.context.article.courseId !== input.courseId) return unavailable(404);
      const row = await getProductBundleImport(importId);
      if (!row || row.status !== "draft" || row.checksum !== input.checksum) return unavailable(404);
    } else {
      const shared = await fetchSharedCanonicalArticle(input.courseId, input.articleId);
      if (!shared || shared.articleRecord.id !== input.articleId || shared.articleRecord.version !== input.articleVersion) return unavailable(404);
      const access = await resolveCourseAccess({ courseId: input.courseId, userId: session.user.id });
      if (!canAccessCourseContent(access, "article", [shared.articleRecord.babId, shared.chapterRecord?.legacyChapterId])) return unavailable(404);
      const section = shared.parsedSections.find((item) => item.id === input.sectionId);
      const block = shared.parsedBlocks.find((item) => item.id === input.blockId && item.bagianArtikelId === section?.id);
      if (!section?.sectionKey || !block?.blockKey) return unavailable(404);
      sectionKey = section.sectionKey;
      blockKey = block.blockKey;
      const suffix = `:v${input.articleVersion}`;
      if (input.articleVersion > 1 && !input.articleId.endsWith(suffix)) return unavailable(404);
      productId = input.articleVersion === 1 ? input.articleId : input.articleId.slice(0, -suffix.length);
      const rows = await db.select({ importId: imporBundle.id, entityHash: itemImporBundle.entityHash }).from(itemImporBundle)
        .innerJoin(imporBundle, eq(itemImporBundle.imporBundleId, imporBundle.id)).innerJoin(publikasiBundle, eq(publikasiBundle.imporBundleId, imporBundle.id))
        .where(and(eq(itemImporBundle.entityType, "article"), eq(itemImporBundle.entityId, productId), eq(itemImporBundle.entityVersion, input.articleVersion), eq(itemImporBundle.status, "published"), eq(imporBundle.bundleType, "product"), eq(imporBundle.status, "published"), eq(publikasiBundle.status, "published"))).limit(2);
      if (rows.length !== 1) return unavailable(404);
      importId = rows[0].importId;
      entityHash = rows[0].entityHash;
    }
    const bundle = await parseStagedProductBundle(importId);
    if (input.draftId && bundle.checksum !== input.checksum) return unavailable(404);
    const products = bundle.products.filter((item) => item.productType === "article" && item.id === productId && item.version === input.articleVersion);
    const product = products[0];
    if (products.length !== 1 || !product || product.productType !== "article" || (entityHash && productEntityHash(product) !== entityHash)) return unavailable(404);
    const source = product.sections.find((item) => item.id === sectionKey)?.blocks.find((item) => item.id === blockKey);
    const archived = formativeCheckPayloadSchema.safeParse(source?.formativeCheckPayload);
    if (!archived.success || archived.data.checkKind !== "multiple_choice" || resolved.context.formativeCheck.checkKind !== "multiple_choice") return unavailable(404);
    const option = resolved.context.formativeCheck.options?.find((item) => item.id === input.optionId);
    const sourceOption = archived.data.options?.find((item) => item.id === input.optionId);
    if (!option || !sourceOption || option.text !== sourceOption.text) return unavailable(404);
    const matches = interactiveDocumentsInMarkdown(option.text).filter((spec) => spec.id === input.visualId && (input.kind === "document" ? spec.documentSha256 : spec.printSha256) === input.hash);
    if (matches.length !== 1) return unavailable(404);
    const spec = matches[0];
    if (product.sections.flatMap((item) => item.blocks).some((item) => [...interactiveDocumentsInMarkdown(item.formativeCheckPayload?.answer), ...interactiveDocumentsInMarkdown(item.formativeCheckPayload?.explanation)].some((hidden) => hidden.documentSha256 === spec.documentSha256 || hidden.printSha256 === spec.printSha256))) return unavailable(404);
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
