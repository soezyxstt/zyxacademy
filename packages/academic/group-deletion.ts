export type GroupDeletionKind = "group" | "token";
export type GroupDeletionTarget = { kind: GroupDeletionKind; id: string };
export type GroupDeletionView = GroupDeletionTarget & {
  groupId: string; name: string; revision: string; members: number; bookings: number; tokens: number;
};
export type GroupDeletion = GroupDeletionTarget & { action: "delete"; groupId: string; expectedRevision: string; confirmed: true };

export function isGroupDeletionView(input: unknown): input is GroupDeletionView {
  if (!input || typeof input !== "object") return false;
  const data = input as GroupDeletionView;
  return (data.kind === "group" || data.kind === "token") && typeof data.id === "string" && typeof data.groupId === "string" &&
    typeof data.name === "string" && /^[a-f0-9]{64}$/.test(data.revision) &&
    [data.members, data.bookings, data.tokens].every(value => Number.isSafeInteger(value) && value >= 0);
}
