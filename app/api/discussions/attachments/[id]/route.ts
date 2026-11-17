import { auth } from "@/lib/auth";
import { readDiscussionImage } from "@/lib/discussions/images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) return new Response("Not found", { status: 404, headers: privateHeaders });
    const { id } = await params;
    const searchParams = new URL(request.url).searchParams;
    const download = searchParams.get("download") === "1";
    const preview = !download && searchParams.get("preview") === "1";
    const result = await readDiscussionImage(session.user.id, id, preview);
    if (!result) return new Response("Not found", { status: 404, headers: privateHeaders });
    const filename = encodeURIComponent(result.image.name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    return new Response(Buffer.from(result.bytes), { headers: {
      ...privateHeaders,
      "Content-Type": preview ? "image/webp" : result.image.mime,
      "Content-Length": String(result.bytes.byteLength),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="gambar"; filename*=UTF-8''${filename}`,
      "Content-Security-Policy": "sandbox",
    } });
  } catch {
    return new Response("Not found", { status: 404, headers: privateHeaders });
  }
}
