type PlaygroundOwner = { learnerId: string; courseId: string };
type PlaygroundCode = { code: string; stdin: string };
type PlaygroundHandoff = PlaygroundOwner & PlaygroundCode & { backHref?: string };

function validHandoff(value: unknown): value is PlaygroundHandoff {
  if (!value || typeof value !== "object") return false;
  const handoff = value as Partial<PlaygroundHandoff>;
  return typeof handoff.learnerId === "string" && handoff.learnerId.length > 0
    && typeof handoff.courseId === "string" && handoff.courseId.length > 0
    && typeof handoff.code === "string" && handoff.code.length <= 64_000
    && typeof handoff.stdin === "string" && handoff.stdin.length <= 8000;
}

export function writePlaygroundHandoff(storage: Pick<Storage, "setItem">, key: string, value: PlaygroundHandoff): void {
  if (!validHandoff(value)) throw new Error("Invalid Playground handoff.");
  storage.setItem(`zyx-python-handoff:${key}`, JSON.stringify(value));
}

export function readPlaygroundHandoff(storage: Pick<Storage, "getItem">, key: string | null, owner: PlaygroundOwner): PlaygroundCode | null {
  if (!key || !owner.learnerId) return null;
  try {
    const value: unknown = JSON.parse(storage.getItem(`zyx-python-handoff:${key}`) ?? "null");
    // Legacy entries have no proven owner, including copies kept by another tab.
    if (!validHandoff(value) || value.learnerId !== owner.learnerId || value.courseId !== owner.courseId) return null;
    return { code: value.code, stdin: value.stdin };
  } catch { return null; }
}
