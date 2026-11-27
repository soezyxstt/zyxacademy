export type WebsiteHandoffStatus = "opening" | "failed" | "expired";

type WebsiteHandoffDependencies = {
  resolve(): string | null;
  open(url: string): Promise<{ type: string }>;
  isFocused(): boolean;
  release(): void;
  leave(): void;
  setStatus(status: WebsiteHandoffStatus): void;
};

export function createWebsiteHandoff({ resolve, open, isFocused, release, leave, setStatus }: WebsiteHandoffDependencies) {
  let attempted = false;
  let opening = false;
  let completed = false;
  let closed = false;

  function back() {
    if (closed || !isFocused()) return;
    closed = true;
    release();
    leave();
  }

  async function retry() {
    if (closed || completed || opening || !isFocused()) return;
    const url = resolve();
    if (!url) { setStatus("expired"); return; }
    opening = true;
    setStatus("opening");
    try {
      const result = await open(url);
      if (closed) return;
      if (result.type === "locked") { setStatus("failed"); return; }
      completed = true;
      back();
    } catch {
      if (!closed) setStatus("failed");
    } finally {
      opening = false;
    }
  }

  function focus() {
    if (completed) { back(); return; }
    if (attempted || closed) return;
    attempted = true;
    return retry();
  }

  return { focus, retry, back };
}
