import { Inngest } from "inngest";

/**
 * Framework-neutral Inngest client for Zyx Academy background execution.
 * Reads INNGEST_EVENT_KEY from process.env without importing Next.js runtime or @t3-oss/env-nextjs.
 */
class QueueClient extends Inngest {
  override async send(...[payload, options]: Parameters<Inngest["send"]>) {
    const provider = process.env.QUEUE_PROVIDER ?? "inngest";
    if (process.env.NODE_ENV !== "test" && provider === "inngest") return super.send(payload, options);
    if (options?.env && options.env !== process.env.INNGEST_ENV) throw new Error("QUEUE_ENVIRONMENT_MISMATCH");
    const { enqueueTask } = await import("@/lib/queue/cloud-tasks");
    const ids = [];
    for (const event of Array.isArray(payload) ? payload : [payload]) {
      ids.push(await enqueueTask({ name: event.name, data: event.data ?? {}, id: event.id,
        delaySeconds: event.ts ? Math.max(0, (event.ts - Date.now()) / 1000) : 0 }));
    }
    return { ids };
  }
}

export const inngest = new QueueClient({
  id: "zyx-academy",
  eventKey: process.env.INNGEST_EVENT_KEY,
  isDev: process.env.NODE_ENV === "development",
});
