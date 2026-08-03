import {
  assertCanonicalDelete,
  assertCanonicalGet,
  assertCanonicalList,
  assertCanonicalQuery,
  assertCanonicalVector,
  assertCanonicalProfile,
  type CanonicalFilterValue,
  type CanonicalMetadataFilter,
  type CanonicalMutationResult,
  type CanonicalQueryRequest,
  type CanonicalQueryResult,
  type CanonicalVectorMatch,
  type CanonicalVectorProvider,
  type CanonicalVectorRecord,
  type CanonicalUpsertRequest,
  type CanonicalDeleteRequest,
  type CanonicalGetRequest,
  type CanonicalGetResult,
  type CanonicalListRequest,
  type CanonicalListResult,
} from "@/lib/vectorize/contracts";

function matchesFilter(record: CanonicalVectorRecord, filter: CanonicalMetadataFilter | undefined): boolean {
  if (!filter) return true;

  return Object.entries(filter).every(([key, expected]) => {
    const actual = record.metadata[key as keyof typeof record.metadata];
    if (typeof expected !== "object" || expected === null) return actual === expected;

    if ("$eq" in expected) return actual === expected.$eq;
    if ("$ne" in expected) return actual !== expected.$ne;
    if ("$in" in expected) return expected.$in.includes(actual as never);
    if ("$nin" in expected) return !expected.$nin.includes(actual as never);
    return false;
  });
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

function cloneRecord(record: CanonicalVectorRecord): CanonicalVectorRecord {
  return {
    id: record.id,
    values: [...record.values],
    metadata: { ...record.metadata },
  };
}

/** Deterministic local provider used by the contract suite. */
export class FakeCanonicalVectorProvider implements CanonicalVectorProvider {
  private readonly records = new Map<string, CanonicalVectorRecord>();
  private mutationCounter = 0;

  public readonly calls = {
    upsert: [] as CanonicalUpsertRequest[],
    query: [] as CanonicalQueryRequest[],
    delete: [] as CanonicalDeleteRequest[],
    list: [] as CanonicalListRequest[],
    get: [] as CanonicalGetRequest[],
  };

  async upsert(request: CanonicalUpsertRequest): Promise<CanonicalMutationResult> {
    assertCanonicalProfile(request.profileId);
    if (request.vectors.length === 0) {
      throw new Error("FAKE_EMPTY_UPSERT");
    }
    request.vectors.forEach(assertCanonicalVector);
    this.calls.upsert.push({ profileId: request.profileId, vectors: request.vectors.map(cloneRecord) });
    request.vectors.forEach((record) => this.records.set(record.id, cloneRecord(record)));
    this.mutationCounter += 1;
    return { count: request.vectors.length, mutationId: `fake-mutation-${this.mutationCounter}` };
  }

  async query(request: CanonicalQueryRequest): Promise<CanonicalQueryResult> {
    assertCanonicalQuery(request);
    this.calls.query.push({ ...request, vector: [...request.vector] });

    const matches: CanonicalVectorMatch[] = [...this.records.values()]
      .filter((record) => record.metadata.namespace === request.namespace)
      .filter((record) => matchesFilter(record, request.filter))
      .map((record) => ({
        id: record.id,
        score: cosineSimilarity(request.vector, record.values),
        metadata: { ...record.metadata },
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, request.topK);

    return { count: matches.length, matches };
  }

  async delete(request: CanonicalDeleteRequest): Promise<CanonicalMutationResult> {
    assertCanonicalDelete(request);
    request.ids.forEach((id) => {
      if (!this.records.delete(id)) return;
    });
    this.calls.delete.push({ profileId: request.profileId, ids: [...request.ids] });
    this.mutationCounter += 1;
    return { count: request.ids.length, mutationId: `fake-mutation-${this.mutationCounter}` };
  }

  async list(request: CanonicalListRequest): Promise<CanonicalListResult> {
    assertCanonicalList(request);
    this.calls.list.push({ ...request });
    const sorted = [...this.records.keys()]
      .filter((id) => !request.prefix || id.startsWith(request.prefix))
      .sort();
    const offset = request.cursor ? Number(request.cursor) : 0;
    const limit = request.limit ?? 1000;
    const ids = sorted.slice(offset, offset + limit);
    const nextOffset = offset + ids.length;
    return {
      ids,
      count: ids.length,
      totalCount: sorted.length,
      isTruncated: nextOffset < sorted.length,
      ...(nextOffset < sorted.length ? { nextCursor: String(nextOffset) } : {}),
    };
  }

  async get(request: CanonicalGetRequest): Promise<CanonicalGetResult> {
    assertCanonicalGet(request);
    this.calls.get.push({ ...request, ids: [...request.ids] });
    return {
      vectors: request.ids
        .map((id) => this.records.get(id))
        .filter((record): record is CanonicalVectorRecord => Boolean(record))
        .map(cloneRecord),
    };
  }

  getRecord(id: string): CanonicalVectorRecord | undefined {
    const record = this.records.get(id);
    return record ? cloneRecord(record) : undefined;
  }

  listRecords(): CanonicalVectorRecord[] {
    return [...this.records.values()].map(cloneRecord);
  }
}

export function fakeFilterValue(value: CanonicalFilterValue): CanonicalFilterValue {
  return value;
}
