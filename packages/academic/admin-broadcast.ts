export const broadcastTargets = ["all", "course", "user"] as const;
export const broadcastTitleLimit = 100;
export const broadcastBodyLimit = 500;
export const broadcastLinkLimit = 2048;

export type BroadcastDraft = {
  title: string;
  body: string;
  link: string;
  target: typeof broadcastTargets[number];
  targetId: string;
};

export type BroadcastReceipt = {
  id: string;
  draft: BroadcastDraft;
  audience: string;
  recipientCount: number;
  status: "prepared" | "queued" | "running" | "succeeded" | "failed" | "unknown" | "cancelled";
  attempted?: number;
  succeeded?: number;
  failedCount?: number;
  issue?: "audience_changed" | "preview_expired" | "authorization_expired" | "partial" | "delivery_uncertain";
};

export type BroadcastComposeData = {
  courses: { id: string; title: string }[];
  receipt: BroadcastReceipt | null;
};

const statuses = ["prepared", "queued", "running", "succeeded", "failed", "unknown", "cancelled"];
const issues = ["audience_changed", "preview_expired", "authorization_expired", "partial", "delivery_uncertain"];
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object";
const isCount = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function isBroadcastReceipt(value: unknown): value is BroadcastReceipt {
  if (!isRecord(value) || !isRecord(value.draft)) return false;
  const { draft, status, id, audience, recipientCount, issue, attempted, succeeded, failedCount } = value;
  return typeof id === "string" && typeof audience === "string" && isCount(recipientCount)
    && typeof status === "string" && statuses.includes(status)
    && typeof draft.target === "string" && broadcastTargets.some(target => target === draft.target)
    && ["title", "body", "link", "targetId"].every(field => typeof draft[field] === "string")
    && (issue === undefined || (typeof issue === "string" && issues.includes(issue)))
    && [attempted, succeeded, failedCount].every(count => count === undefined || isCount(count));
}

export function isBroadcastComposeData(value: unknown): value is BroadcastComposeData {
  return isRecord(value) && Array.isArray(value.courses)
    && value.courses.every(course => isRecord(course) && typeof course.id === "string" && typeof course.title === "string")
    && (value.receipt === null || isBroadcastReceipt(value.receipt));
}
