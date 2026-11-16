import { auth } from "@/lib/auth";
import { uploadDiscussionImage } from "@/lib/discussions/images";
import { DiscussionImageError, parseDiscussionImageUpload } from "@/lib/discussions/image-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function POST(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) return Response.json({ code: "login", error: "Masuk untuk mengunggah gambar." }, { status: 401, headers: privateHeaders });
  try {
    const input = await parseDiscussionImageUpload(request);
    const image = await uploadDiscussionImage({ actorId: session.user.id, ...input });
    return Response.json(image, { status: 201, headers: privateHeaders });
  } catch (error) {
    if (error instanceof DiscussionImageError) {
      const message = error.code === "size" ? "Ukuran gambar maksimal 8 MiB." : error.code === "pixels" ? "Dimensi gambar maksimal 4096 piksel per sisi dan 16 juta piksel." : "Gunakan gambar JPEG, PNG, atau WebP yang valid dan tidak bergerak.";
      const code = error.code === "size" || error.code === "pixels" ? error.code : "format";
      return Response.json({ code, error: message }, { status: error.code === "size" ? 413 : 400, headers: privateHeaders });
    }
    if (error instanceof Error && ["DISCUSSION_IMAGE_RATE_LIMIT", "DISCUSSION_IMAGE_PENDING_LIMIT"].includes(error.message)) {
      return Response.json({ code: "rate_limited", error: "Terlalu banyak gambar. Coba lagi nanti." }, { status: 429, headers: privateHeaders });
    }
    if (error instanceof Error && error.message === "DISCUSSION_UNAVAILABLE") {
      return Response.json({ code: "access", error: "Gambar tidak dapat diunggah. Periksa akses dan coba lagi." }, { status: 403, headers: privateHeaders });
    }
    return Response.json({ code: "unknown", error: "Gambar belum dapat diunggah. Coba lagi." }, { status: 503, headers: privateHeaders });
  }
}
