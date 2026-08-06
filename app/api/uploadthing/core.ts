import type { FileRouter } from "uploadthing/next";

// UploadThing is deprecated and pending complete teardown (P7). The admin drive
// no longer accepts uploads; all upload flows use structured R2 keys through
// lib/storage/keys.ts. Keep the router object so the SSR plugin and route
// handler keep typechecking.
export const uploadRouter = {} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;
