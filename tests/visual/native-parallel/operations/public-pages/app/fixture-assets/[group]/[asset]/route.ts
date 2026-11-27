import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const assets: Record<string, string[]> = {
  founders: ["adi.jpeg", "dawam.jpeg", "heidi.jpeg", "raihan.png"],
  testimoni: ["yomi.jpeg", "agatha.jpeg", "florence.jpeg"],
  platforms: ["windows11.svg", "android.svg", "debian.svg", "linux.svg", "apple.svg", "ios.svg"],
};

export async function GET(_request: Request, context: { params: Promise<{ group: string; asset: string }> }) {
  const { group, asset } = await context.params;
  if (!Object.hasOwn(assets, group) || !assets[group].includes(asset)) return new Response(null, { status: 404 });
  const type = asset.endsWith(".svg") ? "image/svg+xml" : asset.endsWith(".png") ? "image/png" : "image/jpeg";
  const body = await readFile(resolve(process.cwd(), "public", group, asset));
  return new Response(new Uint8Array(body), { headers: { "Content-Type": type } });
}
