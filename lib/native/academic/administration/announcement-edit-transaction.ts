import { revisionOf } from "../../../admin-mcp/revision";
import type { PkaAnnouncementEdit, PkaAnnouncementRevision, PkaAnnouncementText } from "../../../../packages/academic/pka-announcement-edit";

type StoredReceipt = { inputHash: string; result: PkaAnnouncementRevision };
export type AnnouncementEditStore = {
  lockCurrent(): Promise<PkaAnnouncementText | null>;
  receipt(): Promise<StoredReceipt | null>;
  update(input: PkaAnnouncementText): Promise<void>;
  writeReceipt(receipt: StoredReceipt): Promise<void>;
};

export const announcementRevision = (id: string, { title, body }: PkaAnnouncementText): PkaAnnouncementRevision =>
  ({ title, body, revision: revisionOf({ id, title, body }) });

export async function editAnnouncementInTransaction(id: string, draft: PkaAnnouncementEdit, store: AnnouncementEditStore) {
  const inputHash = revisionOf({ id, draft });
  const record = await store.lockCurrent();
  const receipt = await store.receipt();
  if (receipt) {
    if (receipt.inputHash !== inputHash) return { status: "request_conflict" } as const;
    return { status: "saved", announcement: receipt.result } as const;
  }
  if (!record) return { status: "missing" } as const;
  const current = announcementRevision(id, record);
  if (current.revision !== draft.expectedRevision) return { status: "conflict", announcement: current } as const;
  const next = announcementRevision(id, draft);
  if (next.revision !== current.revision) await store.update(next);
  await store.writeReceipt({ inputHash, result: next });
  return { status: "saved", announcement: next } as const;
}

export type AnnouncementEditResult = Awaited<ReturnType<typeof editAnnouncementInTransaction>>;
