import { validateIdeaBundleZip, serializeDeterministically } from "@/lib/bundle/idea-bundle-v2";
import { validateProductBundle } from "@/lib/bundle/product-validator";
import { isBundleIdentitySentinelOrPlaceholder } from "@/lib/bundle/attribution";
import { artifactSchema, entityKey, fail, sameEntity, sha256, stableJson, TRANSFER_LIMITS, TRANSFER_PROTOCOL, validateInventory,
  type TransferArtifact, type TransferEntity, type TransferInventory } from "./contracts";

export function describeBundle(id: string, kind: "idea" | "product", bytes: Uint8Array): TransferArtifact {
  if (bytes.byteLength > TRANSFER_LIMITS.artifactBytes) fail("TRANSFER_LIMIT_EXCEEDED");
  if (kind === "idea") {
    const parsed = validateIdeaBundleZip(bytes);
    if (!parsed.success) fail("TRANSFER_BUNDLE_INVALID");
    const { manifest, entities } = parsed.data;
    if (manifest.schemaVersion !== "idea-bundle.v3") fail("TRANSFER_SCHEMA_UNSUPPORTED");
    return artifactSchema.parse({ id, kind, bundleId: manifest.bundleId, checksum: manifest.bundleChecksum, byteHash: sha256(bytes), byteLength: bytes.length,
      courseId: manifest.courseId, schemaVersion: manifest.schemaVersion,
      entities: [
        ...entities.ideas.map(e => ({ type: "idea", id: e.id, version: e.version, hash: e.semanticHash })),
        ...entities.sourceMaterials.map(e => ({ type: "source_material", id: e.id, version: e.version, hash: e.checksum })),
        ...entities.sourceChunks.map(e => ({ type: "source_chunk", id: e.id, version: e.sourceVersion, hash: e.checksum })),
        ...entities.learningSections.map(e => ({ type: "learning_section", id: e.id, version: 1, hash: sha256(serializeDeterministically(e)) })),
      ], requirements: [],
      creators: [...new Set([manifest.creatorId, manifest.curatorId, ...entities.ideas.flatMap(e => [e.creatorId, e.curatorId]), ...entities.sourceMaterials.map(e => e.creatorId)].filter((v): v is string => Boolean(v) && !isBundleIdentitySentinelOrPlaceholder(v!)))].sort(),
      chapters: [...new Set([...entities.ideas, ...entities.sourceMaterials, ...entities.learningSections].flatMap(e => e.chapterId ? [e.chapterId] : []))].sort(),
    });
  }
  const parsed = validateProductBundle(bytes);
  if (!parsed.success) fail("TRANSFER_BUNDLE_INVALID");
  const { manifest, products, dependencies } = parsed.data;
  if (!["product-bundle.v3", "product-bundle.v4"].includes(manifest.schemaVersion) || products.some(p => !["article", "diktat", "flashcard_set", "flashcard"].includes(p.productType))) fail("TRANSFER_SCHEMA_UNSUPPORTED");
  if (products.some(p => "visuals" in p && p.visuals?.some(v => v.kind === "source_figure"))) fail("ASSET_BINDING_UNSUPPORTED");
  if (/!\[[^\]]*\]\(/.test(JSON.stringify(products))) fail("ASSET_BINDING_UNSUPPORTED");
  const requirements: TransferEntity[] = dependencies.map(d => ({ type: d.upstreamEntityType, id: d.upstreamEntityId, version: d.upstreamVersion, hash: d.upstreamHash }));
  for (const product of products) {
    for (const link of product.ideaLinks) requirements.push({ type: "idea", id: link.id, version: link.version, hash: link.semanticHash });
    for (const source of product.sourceRefs) requirements.push({ type: "source_material", id: source.sourceId, version: source.version, hash: source.checksum });
    if (product.courseId !== manifest.courseId) fail("TRANSFER_SCOPE_MISMATCH");
  }
  const entities: TransferEntity[] = products.map(p => ({ type: "product", id: p.id, version: p.version, hash: p.generationHash }));
  const references = products.flatMap(p => [
    ...p.sourceRefs.flatMap(s => s.excerptIds.map(id => ({ type: "source_chunk" as const, id }))),
    ...(p.productType === "article" ? p.sections.flatMap(s => s.learningSectionId ? [{ type: "learning_section" as const, id: s.learningSectionId }] : []) : []),
  ]);
  return artifactSchema.parse({ id, kind, bundleId: manifest.bundleId, checksum: manifest.bundleChecksum, byteHash: sha256(bytes), byteLength: bytes.length,
    courseId: manifest.courseId, schemaVersion: manifest.schemaVersion, entities, references: [...new Map(references.map(r => [entityKey(r), r])).values()],
    requirements: [...new Map(requirements.filter(r => !entities.some(e => sameEntity(e, r))).map(r => [`${entityKey(r)}:${r.version}:${r.hash}`, r])).values()],
    creators: [...new Set([manifest.creatorId, manifest.curatorId, ...products.flatMap(p => [p.creatorId, p.curatorId])].filter((v): v is string => Boolean(v) && !isBundleIdentitySentinelOrPlaceholder(v!)))].sort(),
    chapters: [...new Set(products.flatMap(p => p.chapterId ? [p.chapterId] : []))].sort(),
  });
}

/** Raw uploader sentinels can only be copied without conversion when the destination actor identity matches. */
export function bindSourceAttribution(artifact: TransferArtifact, bytes: Uint8Array, uploaderId: string): TransferArtifact {
  const parsed = artifact.kind === "idea" ? validateIdeaBundleZip(bytes) : validateProductBundle(bytes);
  if (!parsed.success) fail("TRANSFER_BUNDLE_INVALID");
  const data = parsed.data;
  const entities = "entities" in data ? [...data.entities.ideas, ...data.entities.sourceMaterials] : data.products;
  const creators = [data.manifest.creatorId, ...entities.map(e => e.creatorId)];
  if (creators.some(id => id === "$APPROVING_REVIEWER")) fail("IDENTITY_ATTRIBUTION_MAPPING_REQUIRED");
  const curators = [data.manifest.curatorId, ...entities.flatMap(e => "curatorId" in e ? [e.curatorId] : [])].filter((id): id is string => typeof id === "string" && id !== "$APPROVING_REVIEWER");
  return [...creators, ...curators].some(isBundleIdentitySentinelOrPlaceholder) ? { ...artifact, attributionActorId: uploaderId } : artifact;
}
export function artifactMatchesBytes(artifact: TransferArtifact, bytes: Uint8Array): boolean {
  const described = describeBundle(artifact.id, artifact.kind, bytes);
  return stableJson({ ...described, attributionActorId: artifact.attributionActorId }) === stableJson(artifact);
}

/** Producer lookup is bounded and exact. Never silently advance to a newer dependency revision. */
export async function resolveClosure(root: TransferArtifact, findProducer: (entity: TransferEntity) => Promise<TransferArtifact>, findReference?: (ref: TransferArtifact["references"][number]) => Promise<TransferArtifact>): Promise<TransferInventory> {
  const artifacts = new Map<string, TransferArtifact>();
  const visiting = new Set<string>();
  async function visit(artifact: TransferArtifact): Promise<void> {
    if (visiting.has(artifact.id)) fail("DEPENDENCY_CYCLE");
    if (artifacts.has(artifact.id)) return;
    if (artifacts.size + visiting.size >= TRANSFER_LIMITS.artifacts) fail("TRANSFER_LIMIT_EXCEEDED");
    if (artifact.courseId !== root.courseId) fail("TRANSFER_SCOPE_MISMATCH");
    visiting.add(artifact.id);
    for (const requirement of artifact.requirements) {
      if (artifact.entities.some(e => sameEntity(e, requirement))) continue;
      const known = [...artifacts.values()].find(a => a.entities.some(e => sameEntity(e, requirement)));
      if (!known) {
        const producer = await findProducer(requirement);
        if (!producer.entities.some(e => sameEntity(e, requirement))) fail("DEPENDENCY_REVISION_UNAVAILABLE");
        await visit(producer);
      }
    }
    for (const ref of artifact.references) {
      if (artifact.entities.some(e => entityKey(e) === entityKey(ref)) || [...artifacts.values()].some(a => a.entities.some(e => entityKey(e) === entityKey(ref)))) continue;
      if (!findReference) fail("DEPENDENCY_REVISION_UNAVAILABLE");
      const producer = await findReference(ref);
      if (!producer.entities.some(e => entityKey(e) === entityKey(ref))) fail("DEPENDENCY_REVISION_UNAVAILABLE");
      await visit(producer);
    }
    visiting.delete(artifact.id);
    artifacts.set(artifact.id, artifact);
  }
  await visit(root);
  // Stable topological insertion order is part of the signed closure.
  const ordered = [...artifacts.values()];
  return validateInventory({ protocol: TRANSFER_PROTOCOL, rootId: root.id, artifacts: ordered, closureHash: sha256(stableJson(ordered)) });
}
