import { AsyncLocalStorage } from "node:async_hooks";

type Progress = "dispatch" | "receiving" | "checking";
export const zyraLiveProgress = new AsyncLocalStorage<(progress: Progress) => void>();
