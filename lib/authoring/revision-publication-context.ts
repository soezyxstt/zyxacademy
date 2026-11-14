import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "@/db";
import { dispatchVectorSync } from "@/lib/vector-sync-dispatch";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ReleaseContext = {
  tx: Tx;
  replacements: ReadonlySet<string>;
  verifications: ReadonlyMap<string, unknown>;
  unchangedProducts?: ReadonlySet<string>;
  dispatchCourses: Set<string>;
};
const releaseContext = new AsyncLocalStorage<ReleaseContext>();
export const revisionEntityKey = (type: string, id: string) => JSON.stringify([type, id]);

/** Internal release coordinator only. Context is isolated per asynchronous request. */
export function withRevisionPublication<T>(context: ReleaseContext, operation: () => Promise<T>) {
  if (releaseContext.getStore()) throw new Error("REVISION_RELEASE_NESTING_FORBIDDEN");
  return releaseContext.run(context, operation);
}
export function inRevisionPublication() { return Boolean(releaseContext.getStore()); }
export function revisionPublicationConnection() { return releaseContext.getStore()?.tx ?? db; }
export function revisionPublicationTransaction<T>(operation: (tx: Tx) => Promise<T>): Promise<T> {
  const context = releaseContext.getStore();
  return context ? operation(context.tx) : db.transaction(operation);
}
export function canReplaceRevisionEntity(type: string, id: string): boolean {
  return releaseContext.getStore()?.replacements.has(revisionEntityKey(type, id)) ?? false;
}
export function revisionPublicationVerification(importId: string) { return releaseContext.getStore()?.verifications.get(importId); }
export function reusesRevisionProduct(type: string, id: string, version: number) {
  return releaseContext.getStore()?.unchangedProducts?.has(JSON.stringify([type, id, version])) ?? false;
}
export async function dispatchRevisionPublication(courseId: string) {
  const context = releaseContext.getStore();
  if (context) { context.dispatchCourses.add(courseId); return; }
  await dispatchVectorSync(courseId);
}
