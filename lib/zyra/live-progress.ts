import { AsyncLocalStorage } from "node:async_hooks";

type Progress = "dispatch" | "receiving" | "checking";
export const zyraLiveProgress = new AsyncLocalStorage<(progress: Progress) => void>();
export const zyraLiveTextStream = new AsyncLocalStorage<((chunk: string) => void) | null>();
