import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { articlePartsSchema, collectArticleVisualIds, materializeArticleParts } from "@/lib/materials/article-parts";
import { materializeAuthoredDiktat, prepareAuthoredDiktatVisuals } from "@/lib/materials/diktat-v4";
import { computeIdeaBundleChecksum, serializeDeterministically, validateIdeaBundle, type ValidatedIdeaBundle } from "@/lib/bundle/idea-bundle-v2";
import { computeProductBundleChecksum, parseProductBundle, productEntitySchema, type ProductBundleValidation, type ProductEntity, type ProductDependency } from "@/lib/bundle/product-validator";

export type RevisionKind = "idea" | "product";
export type RevisionPatchOperation = {
  op: "set" | "add" | "remove" | "move";
  target: { entityType: string; entityId: string; sectionId?: string; blockId?: string; itemId?: string };
  field?: string;
  value?: unknown;
  beforeId?: string | null;
};
export type ValidRevisionProductBundle = Extract<ProductBundleValidation, { success: true }>["data"];
export type RevisionEntityChange = { entityType: string; entityId: string; previousVersion?: number; version?: number; previousHash?: string; hash?: string };
export type RevisionUnitChange = { entityId: string; unitType: "section" | "block" | "item"; unitId: string; change: "added" | "removed" | "changed" | "moved" };
export type RevisionArtifactImpact = {
  changed: boolean;
  changedEntities: RevisionEntityChange[];
  addedEntities: RevisionEntityChange[];
  removedEntities: RevisionEntityChange[];
  unchangedEntityIds: string[];
  changedUnits: RevisionUnitChange[];
  structureChanged: boolean;
  provenanceChanged: boolean;
  reviewInvalidations: Array<{ entityId: string; unitIds: string[]; reason: string }>;
  evidenceInvalidations: Array<{ entityId: string; reason: string }>;
  dependentEntityIds: string[];
  blockers: Array<{ code: string; entityId: string; action: string }>;
};
export type RevisionArtifactInput = {
  kind: RevisionKind;
  original: ValidatedIdeaBundle | ValidRevisionProductBundle;
  bundleId: string;
  operations: readonly RevisionPatchOperation[];
  incrementVersions?: boolean;
  /** Server-supplied content versions for restoration or rebasing, keyed by stable entity ID. */
  versionOverrides?: Readonly<Record<string, number>>;
};
export type RevisionArtifactResult = { bytes: Uint8Array; bundle: ValidatedIdeaBundle | ValidRevisionProductBundle; impact: RevisionArtifactImpact };

type Node = Record<string, unknown>;
const forbidden = new Set(["__proto__", "constructor", "prototype"]);
const managedFields = new Set(["id", "version", "status", "schemaVersion", "productType", "courseId", "chapterId", "stableKey", "creatorId", "curatorId", "createdAt", "updatedAt", "generationHash", "semanticHash", "sourceHash", "sourceArticleHash", "sourceArticleVersion", "downstreamHash", "downstreamVersion"]);
const supportedProducts = new Set(["article", "diktat", "flashcard_set", "flashcard", "solution_collection"]);
const ideaAliases: Record<string, string> = { idea: "ideas", ideas: "ideas", provenance: "provenance", relation: "relations", relations: "relations", learning_section: "learningSections", learning_sections: "learningSections" };
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const digest = (value: unknown) => createHash("sha256").update(serializeDeterministically(value)).digest("hex");
const same = (left: unknown, right: unknown) => serializeDeterministically(left) === serializeDeterministically(right);
const node = (value: unknown): Node => { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("REVISION_OBJECT_REQUIRED"); return value as Node; };
const list = (value: unknown): Node[] => { if (!Array.isArray(value)) throw new Error("REVISION_LIST_REQUIRED"); return value.map(node); };

function assertManagedIdentity(before: Record<string, Node[]>, after: Record<string, Node[]>): void {
  for (const [type, values] of Object.entries(after)) {
    const original = new Map((before[type] ?? []).map(value => [value.id, value]));
    for (const value of values) {
      const previous = original.get(value.id);
      if (!previous) continue;
      for (const key of managedFields) if (!same(previous[key], value[key])) throw new Error(`REVISION_MANAGED_FIELD:${key}`);
    }
  }
}

function assertSafeJson(value: unknown, depth = 0, seen = new Set<object>()): void {
  if (depth > 32) throw new Error("REVISION_VALUE_TOO_DEEP");
  if (value === null || ["string", "boolean"].includes(typeof value) || (typeof value === "number" && Number.isFinite(value))) return;
  if (typeof value !== "object" || !value || seen.has(value)) throw new Error("REVISION_JSON_VALUE_REQUIRED");
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error("REVISION_JSON_VALUE_REQUIRED");
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) throw new Error("REVISION_UNSAFE_FIELD");
    assertSafeJson(child, depth + 1, seen);
  }
  seen.delete(value);
}

function fieldPath(field: string): Array<{ key: string; id?: string }> {
  const path = field.split(".");
  if (field.length > 256 || path.length > 8) throw new Error("REVISION_MANAGED_FIELD");
  return path.map(part => {
    const match = /^([A-Za-z][A-Za-z0-9_]*)(?:\[([A-Za-z0-9_:-]+)\])?$/.exec(part);
    if (!match || forbidden.has(match[1]) || managedFields.has(match[1]) || (match[2] && (forbidden.has(match[2]) || /^\d+$/.test(match[2])))) throw new Error("REVISION_MANAGED_FIELD");
    return { key: match[1], ...(match[2] ? { id: match[2] } : {}) };
  });
}

function find(items: Node[], id: string): Node {
  const matches = items.filter(item => item.id === id);
  if (matches.length !== 1) throw new Error("REVISION_TARGET_NOT_FOUND");
  return matches[0];
}

function order(items: Node[]): void {
  items.forEach((item, index) => { if (own(item, "orderIndex")) item.orderIndex = index; });
}

function editList(items: Node[], id: string, operation: RevisionPatchOperation): void {
  if (operation.op === "add") {
    const added = clone(node(operation.value));
    if (added.id !== id || items.some(item => item.id === id)) throw new Error("REVISION_ID_CONFLICT");
    const before = operation.beforeId == null ? items.length : items.findIndex(item => item.id === operation.beforeId);
    if (before < 0) throw new Error("REVISION_BEFORE_TARGET_NOT_FOUND");
    items.splice(before, 0, added);
  } else {
    const target = find(items, id);
    if (operation.op === "set") throw new Error("REVISION_FIELD_REQUIRED");
    if (operation.op === "remove") items.splice(items.indexOf(target), 1);
    else {
      if (operation.beforeId === id) return;
      if (operation.beforeId != null && !items.some(item => item.id === operation.beforeId)) throw new Error("REVISION_BEFORE_TARGET_NOT_FOUND");
      items.splice(items.indexOf(target), 1);
      const index = operation.beforeId == null ? items.length : items.findIndex(item => item.id === operation.beforeId);
      items.splice(index, 0, target);
    }
  }
  order(items);
}

function editField(target: Node, operation: RevisionPatchOperation): void {
  if (!operation.field) throw new Error("REVISION_FIELD_REQUIRED");
  const path = fieldPath(operation.field);
  let parent = target;
  for (const { key, id } of path.slice(0, -1)) {
    if (!own(parent, key)) throw new Error("REVISION_FIELD_PARENT_NOT_FOUND");
    parent = id ? find(list(parent[key]), id) : node(parent[key]);
  }
  const { key, id } = path[path.length - 1];
  if (id) {
    const children = list(parent[key]);
    if (operation.op === "set") {
      const original = find(children, id), replacement = clone(node(operation.value));
      if (replacement.id !== id) throw new Error("REVISION_ID_CONFLICT");
      children[children.indexOf(original)] = replacement;
    } else editList(children, id, operation);
    parent[key] = children;
    return;
  }
  if (operation.op === "set") parent[key] = clone(operation.value);
  else if (operation.op === "remove") {
    if (!own(parent, key)) throw new Error("REVISION_FIELD_NOT_FOUND");
    delete parent[key];
  } else throw new Error("REVISION_FIELD_OPERATION_INVALID");
}

function mutate(collections: Record<string, Node[]>, kind: RevisionKind, operation: RevisionPatchOperation): void {
  const { target } = operation;
  if (!target || Object.keys(target).some(key => !["entityType", "entityId", "sectionId", "blockId", "itemId"].includes(key))) throw new Error("REVISION_TARGET_INVALID");
  for (const id of [target.entityType, target.entityId, target.sectionId, target.blockId, target.itemId].filter(value => value !== undefined)) {
    if (typeof id !== "string" || !id.trim() || id.length > 256 || forbidden.has(id)) throw new Error("REVISION_TARGET_INVALID");
  }
  const collection = kind === "idea" ? ideaAliases[target.entityType] : target.entityType === "dependency" ? "dependencies" : "products";
  if (!collection || !own(collections, collection)) throw new Error("REVISION_ENTITY_TYPE_UNSUPPORTED");
  const items = collections[collection];
  const nested = Boolean(target.sectionId || target.blockId || target.itemId);
  if (kind === "idea" && nested) throw new Error("REVISION_TARGET_INVALID");
  if (kind === "product" && collection === "products") {
    const product = operation.op === "add" && !nested && !operation.field ? node(operation.value) : find(items, target.entityId);
    if (!supportedProducts.has(String(product.productType)) || !["product", String(product.productType)].includes(target.entityType)) throw new Error("REVISION_ENTITY_TYPE_UNSUPPORTED");
  }
  if (!nested) {
    if (operation.field) editField(find(items, target.entityId), operation);
    else editList(items, target.entityId, operation);
    return;
  }
  const entity = find(items, target.entityId);
  if (target.itemId) {
    if (target.sectionId || target.blockId || entity.productType !== "solution_collection") throw new Error("REVISION_TARGET_INVALID");
    const children = list(node(entity.collection).items);
    if (operation.field) editField(find(children, target.itemId), operation); else editList(children, target.itemId, operation);
    node(entity.collection).items = children;
    return;
  }
  if (entity.productType !== "article" || !target.sectionId) throw new Error("REVISION_TARGET_INVALID");
  const sections = list(entity.sections);
  if (target.blockId) {
    const section = find(sections, target.sectionId);
    const blocks = list(section.blocks);
    if (operation.field) editField(find(blocks, target.blockId), operation); else editList(blocks, target.blockId, operation);
    section.blocks = blocks;
  } else if (operation.field) editField(find(sections, target.sectionId), operation);
  else editList(sections, target.sectionId, operation);
  entity.sections = sections;
}

function authored(value: Node): Node {
  const result = { ...value };
  for (const key of ["version", "generationHash", "semanticHash", "sourceHash", "sourceArticleHash", "sourceArticleVersion"]) delete result[key];
  return result;
}

function ideaMeaning(value: Node): Node {
  return { code: value.code, canonicalStatement: value.canonicalStatement, conciseExplanation: value.conciseExplanation, latex: value.latex, knowledgeKind: value.knowledgeKind, instructionalRole: value.instructionalRole, difficultyMetadata: value.difficultyMetadata };
}

function contentVersion(original: Node | undefined, current: Node, input: RevisionArtifactInput, changed: boolean): number {
  const previous = original ? Number(original.version) : 0;
  const override = input.versionOverrides?.[String(current.id)];
  if (override !== undefined) {
    if (!Number.isSafeInteger(override) || override < 1 || override < previous) throw new Error("REVISION_VERSION_OVERRIDE_INVALID");
    return override;
  }
  return original ? previous + (changed && input.incrementVersions !== false ? 1 : 0) : 1;
}

function units(value: Node): Map<string, { kind: RevisionUnitChange["unitType"]; value: Node; position: number }> {
  const result = new Map<string, { kind: RevisionUnitChange["unitType"]; value: Node; position: number }>();
  if (value.productType === "article") list(value.sections).forEach((section, sectionIndex) => {
    result.set(String(section.id), { kind: "section", value: section, position: sectionIndex });
    list(section.blocks).forEach((block, blockIndex) => result.set(String(block.id), { kind: "block", value: block, position: blockIndex }));
  });
  if (value.productType === "solution_collection") list(node(value.collection).items).forEach((item, index) => result.set(String(item.id), { kind: "item", value: item, position: index }));
  return result;
}

function impactFor(before: Record<string, Node[]>, after: Record<string, Node[]>, dependencies: readonly ProductDependency[] = []): RevisionArtifactImpact {
  const impact: RevisionArtifactImpact = { changed: false, changedEntities: [], addedEntities: [], removedEntities: [], unchangedEntityIds: [], changedUnits: [], structureChanged: false, provenanceChanged: !same(before.provenance, after.provenance), reviewInvalidations: [], evidenceInvalidations: [], dependentEntityIds: [], blockers: [] };
  for (const type of Object.keys(before)) {
    if (type === "dependencies") continue;
    const oldById = new Map(before[type].map(item => [String(item.id), item]));
    const newById = new Map(after[type].map(item => [String(item.id), item]));
    if (!same(before[type].map(item => item.id), after[type].map(item => item.id))) impact.structureChanged = true;
    for (const id of new Set([...oldById.keys(), ...newById.keys()])) {
      const previous = oldById.get(id), current = newById.get(id);
      const changed = !same(previous, current);
      if (!changed) { impact.unchangedEntityIds.push(id); continue; }
      const entry: RevisionEntityChange = { entityType: String(current?.productType ?? previous?.productType ?? type), entityId: id,
        ...(typeof previous?.version === "number" ? { previousVersion: previous.version } : {}), ...(typeof current?.version === "number" ? { version: current.version } : {}),
        ...(previous ? { previousHash: digest(previous) } : {}), ...(current ? { hash: digest(current) } : {}) };
      (previous && current ? impact.changedEntities : current ? impact.addedEntities : impact.removedEntities).push(entry);
      const oldUnits = previous ? units(previous) : new Map(), newUnits = current ? units(current) : new Map();
      const changedUnitIds: string[] = [];
      for (const unitId of new Set<string>([...oldUnits.keys(), ...newUnits.keys()])) {
        const left = oldUnits.get(unitId), right = newUnits.get(unitId);
        const change = !left ? "added" : !right ? "removed" : !same(left.value, right.value) ? "changed" : left.position !== right.position ? "moved" : null;
        if (change) {
          impact.changedUnits.push({ entityId: id, unitId, unitType: (right ?? left)!.kind, change });
          changedUnitIds.push(unitId);
          if (["added", "removed", "moved"].includes(change)) impact.structureChanged = true;
        }
      }
      impact.reviewInvalidations.push({ entityId: id, unitIds: changedUnitIds, reason: "CONTENT_OR_CONTEXT_CHANGED" });
      if (["article", "diktat"].includes(String(current?.productType ?? previous?.productType))) impact.evidenceInvalidations.push({ entityId: id, reason: previous && current && same(authored(previous), authored(current)) ? "PRINT_CONTEXT_CHANGED" : "PRINT_SOURCE_CHANGED" });
    }
  }
  const topology = (values: Node[] | undefined) => values?.map(value => ({ id: value.id, upstreamEntityType: value.upstreamEntityType, upstreamEntityId: value.upstreamEntityId, downstreamEntityType: value.downstreamEntityType, downstreamEntityId: value.downstreamEntityId }));
  if (!same(topology(before.dependencies), topology(after.dependencies))) impact.structureChanged = true;
  const dependenciesChanged = !same(before.dependencies, after.dependencies);
  impact.changed = impact.changedEntities.length + impact.addedEntities.length + impact.removedEntities.length > 0 || impact.structureChanged || dependenciesChanged;
  if (dependenciesChanged) {
    const previous = new Map((before.dependencies ?? []).map(value => [value.id, value]));
    const current = new Map((after.dependencies ?? []).map(value => [value.id, value]));
    const affected = new Set<string>();
    for (const id of new Set([...previous.keys(), ...current.keys()])) {
      if (same(previous.get(id), current.get(id))) continue;
      for (const value of [previous.get(id), current.get(id)]) if (value) affected.add(String(value.downstreamEntityId));
    }
    for (const entityId of affected) {
      impact.dependentEntityIds.push(entityId);
      impact.reviewInvalidations.push({ entityId, unitIds: [], reason: "DEPENDENCY_CONTEXT_CHANGED" });
    }
  }
  const changedIds = new Set([...impact.changedEntities, ...impact.addedEntities, ...impact.removedEntities].map(item => item.entityId));
  for (const dependency of dependencies) {
    if (changedIds.has(dependency.upstreamEntityId) || dependency.freshness !== "UP_TO_DATE") impact.dependentEntityIds.push(dependency.downstreamEntityId);
    if (dependency.freshness !== "UP_TO_DATE") impact.blockers.push({ code: "PRODUCT_DEPENDENCY_NEEDS_REVIEW", entityId: dependency.downstreamEntityId, action: "Update the derived content and explicitly review its dependency freshness before release." });
  }
  impact.dependentEntityIds = [...new Set(impact.dependentEntityIds)];
  return impact;
}

function productArtifact(input: RevisionArtifactInput, original: ValidRevisionProductBundle): RevisionArtifactResult {
  if (!["product-bundle.v3", "product-bundle.v4", "product-bundle.v5"].includes(original.manifest.schemaVersion) || original.products.some(product => !supportedProducts.has(product.productType))) throw new Error("REVISION_PROFILE_UNSUPPORTED");
  if (new Set(original.products.map(product => product.id)).size !== original.products.length) throw new Error("REVISION_AMBIGUOUS_ENTITY_ID");
  const before: Record<string, Node[]> = { products: clone(original.products) as Node[], dependencies: clone(original.dependencies) as Node[] };
  const current = clone(before);
  for (const operation of input.operations) mutate(current, "product", operation);
  assertManagedIdentity(before, current);
  const dependencyContextChanged = new Set<string>();
  const beforeDependencies = new Map(before.dependencies.map(value => [value.id, value]));
  const afterDependencies = new Map(current.dependencies.map(value => [value.id, value]));
  for (const id of new Set([...beforeDependencies.keys(), ...afterDependencies.keys()])) {
    const previous = beforeDependencies.get(id), next = afterDependencies.get(id);
    if (same(previous, next)) continue;
    for (const value of [previous, next]) if (value) dependencyContextChanged.add(String(value.downstreamEntityId));
  }
  const oldById = new Map(original.products.map(product => [product.id, product]));
  let products = current.products.map(value => {
    if (!supportedProducts.has(String(value.productType)) || value.courseId !== original.manifest.courseId || !original.products.some(old => old.chapterId === value.chapterId)) throw new Error("REVISION_SCOPE_CHANGED");
    const previous = oldById.get(String(value.id));
    if (!previous) { value.creatorId = original.manifest.creatorId; value.curatorId = original.manifest.curatorId; value.status = "draft"; }
    if (value.productType === "article") {
      for (const section of list(value.sections)) for (const block of list(section.blocks)) if (value.schemaVersion === "article.v4") {
        const oldSection = previous?.productType === "article" ? previous.sections.find(item => item.id === section.id) : undefined;
        const oldBlock = oldSection?.blocks.find(item => item.id === block.id);
        if (oldBlock && same(block.parts, oldBlock.parts)) {
          if (!same(block.contentMarkdown, oldBlock.contentMarkdown)) throw new Error("REVISION_AUTHORED_PARTS_REQUIRED");
          continue;
        }
        const parts = articlePartsSchema.parse(block.parts);
        block.contentMarkdown = materializeArticleParts(parts);
        block.visualIds = collectArticleVisualIds(parts);
      }
    }
    if (value.productType === "solution_collection") {
      const collection = node(value.collection);
      if (previous?.productType === "solution_collection" && value.title !== previous.title && collection.title === previous.collection.title) collection.title = value.title;
      else if (previous?.productType === "solution_collection" && value.title !== previous.title && collection.title !== previous.collection.title && value.title !== collection.title) throw new Error("REVISION_ENVELOPE_TITLE_CONFLICT");
      value.title = collection.title;
    }
    if (value.productType === "diktat" && value.units) {
      if (previous?.productType === "diktat" && same(value.units, previous.units) && value.contentMarkdown !== previous.contentMarkdown) throw new Error("REVISION_AUTHORED_UNITS_REQUIRED");
      value.contentMarkdown = materializeAuthoredDiktat(value.units as Parameters<typeof materializeAuthoredDiktat>[0]);
    }
    const changed = !previous || !same(authored(previous as unknown as Node), authored(value)) || dependencyContextChanged.has(String(value.id));
    value.version = contentVersion(previous as unknown as Node | undefined, value, input, changed);
    if (!previous || !same(value.sourceRefs, previous.sourceRefs)) value.sourceHash = digest(value.sourceRefs);
    if (changed || value.version !== previous?.version) { const { generationHash: _hash, ...content } = value; value.generationHash = digest(content); }
    return productEntitySchema.parse(value);
  });
  const changedArticles = new Set(products.filter(product => product.productType === "article" && !same(product, oldById.get(product.id))).map(product => product.id));
  const staleDerived = new Set<string>();
  const updatedDerived = new Set<string>();
  products = products.map(product => {
    if (product.productType !== "diktat") return product;
    const article = products.find(candidate => candidate.id === product.sourceArticleId && candidate.productType === "article");
    if (!article || article.productType !== "article") return product;
    const previous = oldById.get(product.id);
    const bodyUnchanged = previous?.productType === "diktat" && same(previous.contentMarkdown, product.contentMarkdown) && same(previous.units, product.units);
    if (!bodyUnchanged) updatedDerived.add(product.id);
    if (changedArticles.has(article.id) && bodyUnchanged) staleDerived.add(product.id);
    const derived = { ...product, sourceArticleVersion: article.version, sourceArticleHash: article.generationHash };
    if (derived.units) {
      derived.units = prepareAuthoredDiktatVisuals(derived.units, article.visuals ?? []);
      derived.contentMarkdown = materializeAuthoredDiktat(derived.units);
    }
    if (previous && !same(derived, previous) && derived.version === previous.version) derived.version = contentVersion(previous as unknown as Node, derived as unknown as Node, input, true);
    if (!same(derived, previous)) { const { generationHash: _hash, ...content } = derived; derived.generationHash = digest(content); }
    return productEntitySchema.parse(derived);
  });
  // A new bundle-bound PDF cannot overwrite an existing canonical Diktat's
  // immutable file identity. Give unchanged authored Diktats an evidence revision
  // when another entity or dependency changes the verification context.
  if (!same(before.products, products) || !same(before.dependencies, current.dependencies)) {
    products = products.map(product => {
      const previous = oldById.get(product.id);
      if (product.productType !== "diktat" || previous?.productType !== "diktat" || product.version !== previous.version) return product;
      const revised = { ...product, version: contentVersion(previous as unknown as Node, product as unknown as Node, input, true) };
      if (revised.version === product.version) return product;
      const { generationHash: _hash, ...content } = revised;
      return productEntitySchema.parse({ ...revised, generationHash: digest(content) });
    });
  }
  const byId = new Map(products.map(product => [product.id, product]));
  const dependencies: ProductDependency[] = current.dependencies.flatMap(value => {
    const downstream = byId.get(String(value.downstreamEntityId));
    if (!downstream) return [];
    const upstream = value.upstreamEntityType === "product" ? byId.get(String(value.upstreamEntityId)) : undefined;
    if (value.upstreamEntityType === "product" && oldById.has(String(value.upstreamEntityId)) && !upstream) throw new Error("REVISION_REFERENCED_ENTITY_REMOVED");
    const isDiktatLineage = downstream.productType === "diktat" && upstream?.productType === "article" && downstream.sourceArticleId === upstream.id;
    const previousDependency = original.dependencies.find(dependency => dependency.id === value.id);
    if (isDiktatLineage && previousDependency?.freshness !== "UP_TO_DATE" && value.freshness === "UP_TO_DATE" && !updatedDerived.has(downstream.id)) throw new Error("REVISION_DERIVED_CONTENT_UPDATE_REQUIRED");
    return [{ ...value, downstreamEntityType: downstream.productType, downstreamVersion: downstream.version, downstreamHash: downstream.generationHash,
      ...(upstream ? { upstreamVersion: upstream.version, upstreamHash: upstream.generationHash } : {}),
      ...(isDiktatLineage && updatedDerived.has(downstream.id) ? { freshness: "UP_TO_DATE" } : {}),
      ...(isDiktatLineage && staleDerived.has(downstream.id) ? { freshness: "STALE" } : {}),
    } as ProductDependency];
  });
  current.products = clone(products) as Node[];
  current.dependencies = clone(dependencies) as Node[];
  const files = new Map(original.files);
  const entityFiles = original.manifest.entityFiles.map(file => {
    const values = file.entityType === "products" ? products : dependencies;
    if (same(before[file.entityType], values)) return file;
    const bytes = strToU8(`${serializeDeterministically(values)}\n`);
    files.set(file.path, bytes);
    return { ...file, checksum: createHash("sha256").update(bytes).digest("hex"), stableIds: values.map(value => value.id) };
  });
  const manifestBase = { ...original.manifest, bundleId: input.bundleId, entityFiles, bundleChecksum: undefined };
  const manifest = { ...manifestBase, bundleChecksum: computeProductBundleChecksum(manifestBase, files) };
  if (!same(manifest, original.manifest)) files.set("manifest.json", strToU8(`${serializeDeterministically(manifest)}\n`));
  const validated = parseProductBundle(files);
  if (!validated.success) throw new Error(`REVISION_ARTIFACT_INVALID:${validated.issues.map(issue => issue.code).join(",")}`);
  return { bytes: zipSync(Object.fromEntries([...files].sort(([left], [right]) => left.localeCompare(right))), { level: 6 }), bundle: validated.data, impact: impactFor(before, current, validated.data.dependencies) };
}

function ideaArtifact(input: RevisionArtifactInput, original: ValidatedIdeaBundle): RevisionArtifactResult {
  if (original.manifest.schemaVersion !== "idea-bundle.v3") throw new Error("REVISION_PROFILE_UNSUPPORTED");
  const before: Record<string, Node[]> = { ideas: clone(original.entities.ideas) as Node[], provenance: clone(original.entities.provenance) as Node[], relations: clone(original.entities.relations) as Node[], learningSections: clone(original.entities.learningSections) as Node[] };
  const current = clone(before);
  for (const operation of input.operations) mutate(current, "idea", operation);
  assertManagedIdentity(before, current);
  const oldIdeas = new Map(before.ideas.map(value => [String(value.id), value]));
  const affectedProvenance = new Set<string>();
  for (const item of [...before.provenance, ...current.provenance]) {
    const previous = before.provenance.find(value => value.id === item.id), next = current.provenance.find(value => value.id === item.id);
    if (!same(previous, next)) { if (previous) affectedProvenance.add(String(previous.ideaId)); if (next) affectedProvenance.add(String(next.ideaId)); }
  }
  const chapterIds = new Set(original.entities.ideas.map(value => value.chapterId));
  current.ideas = current.ideas.map(value => {
    if (value.courseId !== original.manifest.courseId || !chapterIds.has(String(value.chapterId))) throw new Error("REVISION_SCOPE_CHANGED");
    const previous = oldIdeas.get(String(value.id));
    if (!previous) {
      value.creatorId = original.manifest.creatorId; value.curatorId = original.manifest.curatorId;
      value.status = "published"; value.schemaVersion = original.entities.ideas[0]?.schemaVersion ?? "1.0";
      value.createdAt = original.manifest.createdAt; value.updatedAt = original.manifest.createdAt;
    }
    const changed = !previous || !same(authored(previous), authored(value)) || affectedProvenance.has(String(value.id));
    value.version = contentVersion(previous, value, input, changed);
    if (changed || value.version !== previous?.version) {
      if (!previous || !same(ideaMeaning(previous), ideaMeaning(value))) value.semanticHash = digest(ideaMeaning(value));
      const { generationHash: _hash, ...generated } = value;
      value.generationHash = digest(generated);
    }
    return value;
  });
  for (const section of current.learningSections) if (section.courseId !== original.manifest.courseId || !chapterIds.has(String(section.chapterId))) throw new Error("REVISION_SCOPE_CHANGED");
  current.relations = current.relations.map(value => {
    const previous = before.relations.find(item => item.id === value.id);
    if (!previous) { value.status = "active"; value.createdAt = original.manifest.createdAt; value.updatedAt = original.manifest.createdAt; }
    value.version = contentVersion(previous, value, input, !previous || !same(authored(previous), authored(value)));
    return value;
  });
  const values: Record<string, readonly unknown[]> = { source_materials: original.entities.sourceMaterials, source_chunks: original.entities.sourceChunks, ideas: current.ideas, provenance: current.provenance, relations: current.relations, learning_sections: current.learningSections };
  const files = new Map(original.files);
  const entityFiles = original.manifest.entityFiles.map(file => {
    const entities = values[file.entityType];
    const beforeValues: Record<string, readonly unknown[]> = { source_materials: original.entities.sourceMaterials, source_chunks: original.entities.sourceChunks, ideas: before.ideas, provenance: before.provenance, relations: before.relations, learning_sections: before.learningSections };
    if (same(beforeValues[file.entityType], entities)) return file;
    const bytes = strToU8(`${serializeDeterministically(entities)}\n`);
    files.set(file.path, bytes);
    return { ...file, checksum: createHash("sha256").update(bytes).digest("hex"), stableIds: entities.map(value => String(node(value).id)) };
  });
  const manifestBase = { ...original.manifest, bundleId: input.bundleId, entityFiles, bundleChecksum: undefined };
  const manifest = { ...manifestBase, bundleChecksum: computeIdeaBundleChecksum(manifestBase, files) };
  if (!same(manifest, original.manifest)) files.set("manifest.json", strToU8(`${serializeDeterministically(manifest)}\n`));
  const validated = validateIdeaBundle(files);
  if (!validated.success) throw new Error(`REVISION_ARTIFACT_INVALID:${validated.issues.map(issue => issue.code).join(",")}`);
  return { bytes: zipSync(Object.fromEntries([...files].sort(([left], [right]) => left.localeCompare(right))), { level: 6 }), bundle: validated.data, impact: impactFor(before, current) };
}

export function buildRevisionArtifact(input: RevisionArtifactInput): RevisionArtifactResult {
  if (!["idea", "product"].includes(input.kind)) throw new Error("REVISION_KIND_UNSUPPORTED");
  if (!input.bundleId.trim() || input.bundleId.length > 256 || input.operations.length > 128) throw new Error("REVISION_INPUT_INVALID");
  for (const operation of input.operations) {
    if (Object.keys(operation).some(key => !["op", "target", "field", "value", "beforeId"].includes(key))) throw new Error("REVISION_OPERATION_INVALID");
    if (!["set", "add", "remove", "move"].includes(operation.op)) throw new Error("REVISION_OPERATION_UNSUPPORTED");
    if ((["set", "remove"].includes(operation.op) && operation.beforeId !== undefined) || (["remove", "move"].includes(operation.op) && operation.value !== undefined)) throw new Error("REVISION_OPERATION_ARGUMENT_INVALID");
    if (operation.value !== undefined) assertSafeJson(operation.value);
    if (["set", "add"].includes(operation.op) && operation.value === undefined) throw new Error("REVISION_VALUE_REQUIRED");
  }
  if (Buffer.byteLength(JSON.stringify(input.operations)) > 2 * 1024 * 1024) throw new Error("REVISION_PATCH_TOO_LARGE");
  const versioned = input.kind === "product" ? (input.original as ValidRevisionProductBundle).products : [...(input.original as ValidatedIdeaBundle).entities.ideas, ...(input.original as ValidatedIdeaBundle).entities.relations];
  for (const [id, version] of Object.entries(input.versionOverrides ?? {})) if (!versioned.some(value => value.id === id) || !Number.isSafeInteger(version) || version < 1) throw new Error("REVISION_VERSION_OVERRIDE_INVALID");
  return input.kind === "product" ? productArtifact(input, input.original as ValidRevisionProductBundle) : ideaArtifact(input, input.original as ValidatedIdeaBundle);
}
