import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { bab, bagianPembelajaran, ide, mataKuliah, potonganSumber, sumberMateri } from "@/db/schema";
import { sha256Text } from "@/lib/bundle/validator";
import { normalizeSha256Checksum } from "./mcp-source-files";
import type { ProductDraftContext } from "./product-draft-builder";
import type { ProductDraftCreationPorts } from "./product-draft-service";

/** Load only requested references, bound to the verified course and chapter. */
export const loadProductDraftContext: ProductDraftCreationPorts["loadContext"] = async ({ run, principal, draftKey, draft }) => {
  const ideaIds = new Set<string>();
  const sourceIds = new Set<string>();
  const excerptIds = new Set<string>();
  const sectionIds = new Set<string>();
  const selectSources = (refs: { sourceId: string; excerptIds: string[] }[] | undefined) => {
    for (const ref of refs ?? []) { sourceIds.add(ref.sourceId); for (const id of ref.excerptIds) excerptIds.add(id); }
  };
  for (const product of draft.products) {
    product.ideaIds.forEach(id => ideaIds.add(id));
    selectSources(product.sourceRefs);
    if (product.productType === "article") for (const section of product.sections) {
      section.ideaIds.forEach(id => ideaIds.add(id));
      if (section.learningSectionId) sectionIds.add(section.learningSectionId);
      selectSources(section.sourceRefs);
      for (const block of section.blocks) { block.ideaIds?.forEach(id => ideaIds.add(id)); selectSources(block.sourceRefs); }
    }
    else if (product.productType === "diktat") for (const unit of product.units) unit.ideaIds.forEach(id => ideaIds.add(id));
  }
  if (ideaIds.size > 256 || sourceIds.size > 256 || excerptIds.size > 2048 || sectionIds.size > 256) throw new Error("PRODUCT_DRAFT_REFERENCE_LIMIT");
  const needsCollectionScope = draft.products.some(product => product.productType === "solution_collection");
  const [ideas, sources, excerpts, sections, scope] = await Promise.all([
    db.select({ id: ide.id, version: ide.version, semanticHash: ide.semanticHash }).from(ide)
      .where(and(inArray(ide.id, [...ideaIds]), eq(ide.mataKuliahId, run.courseId), eq(ide.status, "published"))),
    db.select({ sourceId: sumberMateri.id, version: sumberMateri.version, checksum: sumberMateri.checksum }).from(sumberMateri)
      .where(and(inArray(sumberMateri.id, [...sourceIds]), eq(sumberMateri.mataKuliahId, run.courseId),
        or(eq(sumberMateri.babId, run.chapterId), isNull(sumberMateri.babId)), eq(sumberMateri.status, "active"))),
    db.select({ id: potonganSumber.id, sourceId: potonganSumber.sumberMateriId, sourceVersion: potonganSumber.sourceVersion }).from(potonganSumber)
      .where(and(inArray(potonganSumber.id, [...excerptIds]), inArray(potonganSumber.sumberMateriId, [...sourceIds]))),
    sectionIds.size ? db.select({ id: bagianPembelajaran.id }).from(bagianPembelajaran)
      .where(and(inArray(bagianPembelajaran.id, [...sectionIds]), eq(bagianPembelajaran.mataKuliahId, run.courseId),
        eq(bagianPembelajaran.babId, run.chapterId), eq(bagianPembelajaran.status, "published"))) : Promise.resolve([]),
    needsCollectionScope ? db.select({ courseTitle: mataKuliah.title, chapterTitle: bab.title }).from(mataKuliah)
      .innerJoin(bab, eq(bab.mataKuliahId, mataKuliah.id))
      .where(and(eq(mataKuliah.id, run.courseId), eq(bab.id, run.chapterId), eq(mataKuliah.status, "active"), eq(bab.status, "active"))).limit(1) : Promise.resolve([]),
  ]);
  if (needsCollectionScope && !scope[0]) throw new Error("PRODUCT_DRAFT_COLLECTION_SCOPE_REQUIRED");
  return {
    bundleId: `mcp-product-${sha256Text(`${run.runId}:${principal.actorId}:${draftKey}`).slice(0, 32)}`,
    courseId: run.courseId, chapterId: run.chapterId, creatorId: principal.actorId,
    ...(scope[0] ?? {}),
    createdAt: new Date(run.issuedAt).toISOString(), ideas,
    sources: sources.map(source => {
      const checksum = normalizeSha256Checksum(source.checksum);
      if (!checksum) throw new Error("AUTHORING_RUNTIME_SOURCE_CHECKSUM_INVALID");
      return { ...source, checksum,
        excerptIds: excerpts.filter(excerpt => excerpt.sourceId === source.sourceId && excerpt.sourceVersion === source.version).map(excerpt => excerpt.id) };
    }),
    learningSectionIds: sections.map(section => section.id),
  } satisfies ProductDraftContext;
};
