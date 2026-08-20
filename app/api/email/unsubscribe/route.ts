import { unsubscribeWithEmailToken } from "@/lib/email-preferences/unsubscribe";

export async function POST(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return new Response(null, { status: 400 });

  try {
    await unsubscribeWithEmailToken(token);
    return new Response(null, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[POST /api/email/unsubscribe]", error);
    return new Response(null, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
