import type { z } from "zod";
import type { codingHelpRequestSchema } from "@/lib/coding/http-contracts";

type PlaygroundContext = Extract<z.infer<typeof codingHelpRequestSchema>, { kind: "playground" }>;
type ApplyResult = "applied" | "changed" | "inactive" | "invalid";

export type PlaygroundBridge = {
  courseId: string;
  capture: () => { context: PlaygroundContext; apply: (code: string, force?: boolean) => ApplyResult };
};

let current: PlaygroundBridge | null = null;
const listeners = new Set<() => void>();

export function getPlaygroundBridge() { return current; }
export function subscribePlaygroundBridge(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function registerPlaygroundBridge(courseId: string, getContext: () => PlaygroundContext, getRevision: () => number, setCode: (code: string) => void) {
  const bridge: PlaygroundBridge = {
    courseId,
    capture() {
      const context = getContext(), revision = getRevision();
      return {
        context,
        apply(code, force = false) {
          if (current !== bridge) return "inactive";
          if (code.length > 64_000 || !code.trim()) return "invalid";
          if (!force && (revision !== getRevision() || context.code !== getContext().code)) return "changed";
          setCode(code);
          return "applied";
        },
      };
    },
  };
  current = bridge;
  listeners.forEach((listener) => listener());
  return () => {
    if (current !== bridge) return;
    current = null;
    listeners.forEach((listener) => listener());
  };
}
