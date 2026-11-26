import { ManagementFailure, type ManagementAction, type ManagementClient } from "../../../../../packages/native-parity/operations/management-contract";

export type MediaItem = { key: string; folder: boolean };
export type MediaMutation = Extract<ManagementAction, { type: "media.move" | "media.delete" | "media.copy" }>;

export function mediaSelection(items: MediaItem[]) {
  const unique = [...new Map(items.map(item => [item.key, item])).values()];
  return unique.filter(item => !unique.some(parent => parent.folder && item.key.startsWith(`${parent.key}/`)));
}

export function mediaDestination(items: MediaItem[], destination: string) {
  return items.every(({ key, folder }) => {
    const parent = key.slice(0, key.lastIndexOf("/"));
    return parent !== (destination || "media") && (!folder || (key !== destination && !destination.startsWith(`${key}/`)));
  });
}

export async function runMediaBatch(client: ManagementClient, retries: Map<string, string>, commands: MediaMutation[],
  nextKey: () => string, signal: AbortSignal) {
  const failed: Array<{ item: MediaItem; uncertain: boolean }> = [];
  let succeeded = 0;
  for (const command of commands) {
    if (signal.aborted) break;
    const fingerprint = JSON.stringify(command);
    const key = retries.get(fingerprint) ?? nextKey();
    retries.set(fingerprint, key);
    try {
      await client.mutate(command, key);
      retries.delete(fingerprint);
      succeeded++;
    } catch (error) {
      const uncertain = !(error instanceof ManagementFailure) || ["unavailable", "pending", "uncertain"].includes(error.code);
      const denied = error instanceof ManagementFailure && error.code === "forbidden";
      if (!uncertain && !denied) retries.delete(fingerprint);
      failed.push({ item: { key: command.key, folder: command.folder }, uncertain });
      if (denied) {
        for (const remaining of commands.slice(succeeded + failed.length)) {
          failed.push({ item: { key: remaining.key, folder: remaining.folder }, uncertain: false });
        }
        return { succeeded, failed, denied: true };
      }
    }
  }
  return { succeeded, failed };
}
