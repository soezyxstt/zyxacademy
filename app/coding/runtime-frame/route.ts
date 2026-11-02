import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const publicUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!publicUrl && process.env.NODE_ENV === "production") throw new Error("NEXT_PUBLIC_APP_URL is required for the Python runtime");
  const origin = new URL(publicUrl || request.url).origin;
  return new Response(await readFile(join(process.cwd(), "lib/coding/frame.html")), { headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": `default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' data: ${origin}/api/coding/runtime/; connect-src ${origin}/api/coding/runtime/ ${origin}/coding/worker.js; worker-src data:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,
    "Document-Isolation-Policy": "isolate-and-require-corp",
    "X-Content-Type-Options": "nosniff",
  } });
}
