import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PYTHON_RUNTIME_ASSETS, PYTHON_RUNTIME_REVISION } from "@/lib/coding/runtime-assets";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ asset: string; revision: string }> }) {
  const { asset, revision } = await params;
  if (revision !== PYTHON_RUNTIME_REVISION) return new Response(null, { status: 404 });
  if (!Object.hasOwn(PYTHON_RUNTIME_ASSETS, asset)) return new Response(null, { status: 404 });
  const requestUrl = new URL(request.url);
  if (requestUrl.searchParams.has("v") && requestUrl.searchParams.get("v") !== PYTHON_RUNTIME_REVISION) return new Response(null, { status: 404 });
  // Native resolution keeps bundlers from replacing the asset path with a module ID.
  const root = dirname(process.getBuiltinModule("module").createRequire(join(process.cwd(), "package.json")).resolve("pyodide"));
  return new Response(await readFile(join(root, asset)), { headers: {
    "Content-Type": PYTHON_RUNTIME_ASSETS[asset as keyof typeof PYTHON_RUNTIME_ASSETS],
    "Cache-Control": "public, max-age=31536000, immutable",
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "X-Content-Type-Options": "nosniff",
  } });
}
