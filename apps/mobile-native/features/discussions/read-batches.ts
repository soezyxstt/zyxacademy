export type ReadItem = { id: string; seq: number; revision?: number };
export type ReadPage = { receipt: string; throughSeq: number; items: ReadItem[]; status: string };
export type ReadBatch = { receipt: string; throughSeq: number; messageIds: string[] };
export type ReadHistory = { through: number; revisions: Map<string, number>; sequences: Set<number>; status?: string };

export function visibleHeight(row: { y: number; height: number }, viewport: { y: number; height: number }) {
  if (row.height <= 0 || viewport.height <= 0) return false;
  const intersection = Math.min(row.y + row.height, viewport.y + viewport.height) - Math.max(row.y, viewport.y);
  return intersection >= Math.min(row.height, viewport.height) / 2;
}

export function nextReadBatch(pages: ReadPage[], visible: Set<string>, history: ReadHistory) {
  // A later fetch can contain a newer revision of a message from an older page.
  const latest = new Map<string, ReadPage>();
  for (const page of pages) for (const item of page.items) latest.set(item.id, page);
  for (const page of pages) {
    const items = page.items.filter(item => visible.has(item.id) && latest.get(item.id) === page &&
      ((history.revisions.get(item.id) ?? -1) < (item.revision ?? 0) || (page === pages.at(-1) && history.status !== page.status)));
    if (!items.length) continue;
    const selected = new Set(items.map(item => item.seq));
    let throughSeq = Math.max(history.through, page.throughSeq);
    while (selected.has(throughSeq + 1) || history.sequences.has(throughSeq + 1)) throughSeq++;
    return { request: { receipt: page.receipt, throughSeq, messageIds: items.map(item => item.id) }, items, status: page === pages.at(-1) ? page.status : history.status };
  }
}

export function confirmReadBatch(history: ReadHistory, batch: NonNullable<ReturnType<typeof nextReadBatch>>) {
  history.through = Math.max(history.through, batch.request.throughSeq);
  history.status = batch.status;
  for (const item of batch.items) {
    history.revisions.set(item.id, Math.max(history.revisions.get(item.id) ?? -1, item.revision ?? 0));
    if (item.seq > history.through) history.sequences.add(item.seq);
  }
  for (const seq of history.sequences) if (seq <= history.through) history.sequences.delete(seq);
}
