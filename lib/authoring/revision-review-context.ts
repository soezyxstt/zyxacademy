import { AsyncLocalStorage } from "node:async_hooks";
import type { db } from "@/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const reviewContext = new AsyncLocalStorage<(connection: Tx) => Promise<void>>();

/** Internal revision review only, invoked before any import claim or row lock. */
export function withRevisionReviewGuard<T>(guard: (connection: Tx) => Promise<void>, operation: () => Promise<T>) {
  if (reviewContext.getStore()) throw new Error("REVISION_REVIEW_NESTING_FORBIDDEN");
  return reviewContext.run(guard, operation);
}
export async function assertRevisionReviewGuard(connection: Tx) {
  await reviewContext.getStore()?.(connection);
}
