export type TutorSlotFields = {
  date: string;
  start: string;
  mode: "online" | "offline";
  location: string;
  notes: string;
  courseIds?: string[];
  weeks?: number;
};

export type TutorSlotTarget = { slotId: string; expectedRevision: string };
export type TutorSlotReceipt = { requestId: string; slotId: string; date: string; created?: number; skipped?: number };
export type TutorSlotResult = { status: "saved"; receipt: TutorSlotReceipt } |
  { status: "conflict" | "denied" | "missing" | "invalid" | "overlap" | "booked" | "unknown" };
export type TutorSlotPending = { target: TutorSlotTarget | undefined; fields: TutorSlotFields };

export type TutorSlotEditor = {
  pending(): readonly TutorSlotPending[];
  save(target: TutorSlotTarget | undefined, fields: TutorSlotFields, requestId: string, signal: AbortSignal): Promise<TutorSlotResult>;
};
