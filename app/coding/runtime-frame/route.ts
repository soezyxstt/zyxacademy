import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const address = new URL(request.url);
  const host = request.headers.get("host");
  if (host && /^[a-zA-Z0-9.:[\]-]+$/.test(host)) address.host = host;
  const origin = address.origin;
  return new Response(await readFile(join(process.cwd(), "lib/coding/frame.html")), { headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": `default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' data: ${origin}/api/coding/runtime/; connect-src ${origin}/api/coding/runtime/ ${origin}/coding/worker.js; worker-src data:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,
    "X-Content-Type-Options": "nosniff",
  } });
}
