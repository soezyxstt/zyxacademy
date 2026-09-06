import { Inngest } from "inngest";

/**
 * Framework-neutral Inngest client for Zyx Academy background execution.
 * Reads INNGEST_EVENT_KEY from process.env without importing Next.js runtime or @t3-oss/env-nextjs.
 */
export const inngest = new Inngest({
  id: "zyx-academy",
  eventKey: process.env.INNGEST_EVENT_KEY,
  isDev: process.env.NODE_ENV === "development",
});
