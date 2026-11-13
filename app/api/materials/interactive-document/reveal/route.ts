import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { imporBundle, itemImporBundle, publikasiBundle } from "@/db/schema";
import { auth } from "@/lib/auth";
import { canAccessCourseContent, resolveCourseAccess } from "@/lib/student/course-access";
import { fetchSharedCanonicalArticle } from "@/lib/articles/structured-repository";
import { getProductBundleImport, parseStagedProductBundle } from "@/lib/bundle/product-staging";
import { productEntityHash } from "@/lib/bundle/product-bundle-v2";
import { resolvePublishedFormativeCheck } from "@/lib/materials/formative-check-server";
import { resolveDraftProductFormativeCheck } from "@/lib/materials/formative-check-draft-server";
import { formativeAnswerForReveal } from "@/lib/materials/formative-check-answer";
import { formativeCheckPayloadSchema } from "@/lib/materials/pedagogy-contract";
import { interactiveDocumentsInMarkdown } from "@/lib/materials/interactive-document-authorization";
import { verifyInteractiveDocumentGrant } from "@/lib/materials/interactive-document-grant";
import { readInteractiveDocumentAsset } from "@/lib/materials/interactive-document-assets";
import { interactiveDocumentResponse, verifyAdmittedInteractiveDocumentAsset } from "@/lib/materials/interactive-document-verified";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const querySchema = z.object({ grant: z.string().min(1).max(4096), visualId: z.string().min(1).max(100), hash: z.string().regex(/^[a-f0-9]{64}$/), kind: z.enum(["document", "print"]) }).strict();
const unavailable = (status: number) => new Response(null, { status, headers: { "Cache-Control": "private, no-store" } });

async function deliver(request: Request, head: boolean) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return unavailable(401);
  const search = new URL(request.url).searchParams;
  if ([...search.keys()].some((key) => search.getAll(key).length !== 1)) return unavailable(400);
  const parsed = querySchema.safeParse(Object.fromEntries(search));
  if (!parsed.success) return unavailable(400);
  const grant = verifyInteractiveDocumentGrant(parsed.data.grant, session.user.id, process.env.BETTER_AUTH_SECRET ?? "");
  if (!grant) return unavailable(404);
  const locator = { articleId: grant.articleId, articleVersion: grant.articleVersion, sectionId: grant.sectionId, blockId: grant.blockId };
  try {
    const resolved = grant.draftId ? await resolveDraftProductFormativeCheck(grant.draftId, locator) : await resolvePublishedFormativeCheck(locator);
    if (!resolved.ok) return unavailable(404);
    if (grant.draftId) {
      if (session.user.role !== "admin") return unavailable(404);
    } else {
      const access = await resolveCourseAccess({ courseId: resolved.context.article.courseId, userId: session.user.id });
      const shared = await fetchSharedCanonicalArticle(resolved.context.article.courseId, grant.articleId);
      if (!shared || !canAccessCourseContent(access, "article", [shared.articleRecord.babId])) return unavailable(404);
    }
    let importId = grant.draftId;
    let productId = grant.articleId;
    let sectionKey = grant.sectionId;
    let blockKey = grant.blockId;
    let entityHash: string | undefined;
    if (importId) {
      const row = await getProductBundleImport(importId);
      if (!row || row.status !== "draft" || row.checksum !== grant.draftChecksum) return unavailable(404);
    } else {
      const shared = await fetchSharedCanonicalArticle(resolved.context.article.courseId, grant.articleId);
      if (!shared || shared.articleRecord.id !== grant.articleId || shared.articleRecord.version !== grant.articleVersion) return unavailable(404);
      const section = shared.parsedSections.find((item) => item.id === grant.sectionId);
      const block = shared.parsedBlocks.find((item) => item.id === grant.blockId && item.bagianArtikelId === section?.id);
      if (!section?.sectionKey || !block?.blockKey) return unavailable(404);
      sectionKey = section.sectionKey;
      blockKey = block.blockKey;
      const suffix = `:v${grant.articleVersion}`;
      if (grant.articleVersion > 1 && !grant.articleId.endsWith(suffix)) return unavailable(404);
      productId = grant.articleVersion === 1 ? grant.articleId : grant.articleId.slice(0, -suffix.length);
      const rows = await db.select({ importId: imporBundle.id, entityHash: itemImporBundle.entityHash }).from(itemImporBundle)
        .innerJoin(imporBundle, eq(itemImporBundle.imporBundleId, imporBundle.id)).innerJoin(publikasiBundle, eq(publikasiBundle.imporBundleId, imporBundle.id))
        .where(and(eq(itemImporBundle.entityType, "article"), eq(itemImporBundle.entityId, productId), eq(itemImporBundle.entityVersion, grant.articleVersion), eq(itemImporBundle.status, "published"), eq(imporBundle.bundleType, "product"), eq(imporBundle.status, "published"), eq(publikasiBundle.status, "published"))).limit(2);
      if (rows.length !== 1) return unavailable(404);
      importId = rows[0].importId;
      entityHash = rows[0].entityHash;
    }
    const bundle = await parseStagedProductBundle(importId);
    if (grant.draftId && bundle.checksum !== grant.draftChecksum) return unavailable(404);
    const matches = bundle.products.filter((item) => item.productType === "article" && item.id === productId && item.version === grant.articleVersion);
    const product = matches[0];
    if (matches.length !== 1 || !product || product.productType !== "article" || (entityHash && productEntityHash(product) !== entityHash)) return unavailable(404);
    const source = product.sections.find((item) => item.id === sectionKey)?.blocks.find((item) => item.id === blockKey);
    const archived = formativeCheckPayloadSchema.safeParse(source?.formativeCheckPayload);
    if (!archived.success) return unavailable(404);
    const value = (check: typeof archived.data) => grant.field === "answer" ? formativeAnswerForReveal(check) : check.explanation;
    const text = value(resolved.context.formativeCheck);
    if (text !== value(archived.data)) return unavailable(404);
    const matching = interactiveDocumentsInMarkdown(text).filter((spec) => spec.id === parsed.data.visualId && (parsed.data.kind === "document" ? spec.documentSha256 : spec.printSha256) === parsed.data.hash);
    if (matching.length !== 1) return unavailable(404);
    const spec = matching[0];
    const document = bundle.files.get(`visuals/${spec.documentSha256}.html`);
    const print = bundle.files.get(`visuals/${spec.printSha256}.png`);
    if (!document || !print) return unavailable(404);
    verifyAdmittedInteractiveDocumentAsset(spec, "document", document);
    verifyAdmittedInteractiveDocumentAsset(spec, "print", print);
    const response = interactiveDocumentResponse(await readInteractiveDocumentAsset(spec, parsed.data.kind), parsed.data.kind);
    return head ? new Response(null, { status: response.status, headers: response.headers }) : response;
  } catch {
    return unavailable(503);
  }
}

export function GET(request: Request) { return deliver(request, false); }
export function HEAD(request: Request) { return deliver(request, true); }
