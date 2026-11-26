export type PkaDeliveryStatus = "queued" | "running" | "succeeded" | "partial" | "failed" | "unknown";
export type PkaDeliveryKind = "announcement" | "schedule-create" | "schedule-update";
export type PkaDeliveryResult = {
  recipientCount: number;
  notificationsSucceeded: number;
  emailsSucceeded: number;
  failedCount: number;
};

export function isPkaDeliveryStatus(value: unknown): value is PkaDeliveryStatus {
  return value === "queued" || value === "running" || value === "succeeded" || value === "partial" || value === "failed" || value === "unknown";
}
