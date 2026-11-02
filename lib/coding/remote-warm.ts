const socketUrl = "wss://zyx-py-runtime.onrender.com/v1/terminal";
type Entry = { courseId: string; refs: number; abort: AbortController; socket?: WebSocket; promise: Promise<WebSocket | null>; taken: boolean };
let entry: Entry | undefined;

async function connect(current: Entry): Promise<WebSocket | null> {
  try {
    const response = await fetch('/api/coding/terminal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ courseId: current.courseId }), signal: current.abort.signal });
    if (!response.ok) return null;
    const value = await response.json();
    if (value.url !== socketUrl || typeof value.ticket !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.ticket) || current.abort.signal.aborted) return null;
    const socket = new WebSocket(value.url, ['zyx-v1', 'zyx-warm', `ticket.${value.ticket}`]);
    current.socket = socket;
    socket.addEventListener("close", () => { if (entry === current) entry = undefined; }, { once: true });
    return await new Promise(resolve => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true; clearTimeout(timer); current.abort.signal.removeEventListener('abort', cancel);
        socket.removeEventListener('message', message); socket.removeEventListener('error', cancel); socket.removeEventListener('close', cancel);
        if (!ok) socket.close();
        resolve(ok ? socket : null);
      };
      const cancel = () => finish(false);
      const timer = setTimeout(cancel, 12000);
      const message = (event: MessageEvent) => {
        try { const data = JSON.parse(event.data); if (data.type === 'ready') socket.send(JSON.stringify({ type: 'prepare' })); else if (data.type === 'prepared') finish(true); else if (data.type === 'result') finish(false); } catch { finish(false); }
      };
      current.abort.signal.addEventListener('abort', cancel, { once: true });
      socket.addEventListener('message', message); socket.addEventListener('error', cancel); socket.addEventListener('close', cancel);
    });
  } catch { return null; }
}

export function warmRemotePython(courseId: string): () => void {
  if (entry && entry.courseId !== courseId) return () => {};
  if (!entry) {
    const current: Entry = { courseId, refs: 0, abort: new AbortController(), taken: false, promise: Promise.resolve(null) };
    entry = current;
    current.promise = connect(current).then(socket => { if (!socket && entry === current) entry = undefined; return socket; });
  }
  const current = entry; current.refs++;
  return () => { if (--current.refs === 0 && !current.taken) { current.abort.abort(); current.socket?.close(); if (entry === current) entry = undefined; } };
}

export async function takeWarmRemotePython(courseId: string, signal?: AbortSignal): Promise<WebSocket | null> {
  const current = entry;
  if (!current || current.courseId !== courseId || current.taken) return null;
  current.taken = true;
  if (entry === current) entry = undefined;
  const cancel = () => current.abort.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  const socket = await current.promise;
  signal?.removeEventListener('abort', cancel);
  if (signal?.aborted) { socket?.close(); return null; }
  return socket?.readyState === WebSocket.OPEN ? socket : null;
}
