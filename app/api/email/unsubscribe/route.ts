import { env } from "@/lib/env";
import { unsubscribeWithEmailToken } from "@/lib/email-preferences/unsubscribe";

export async function POST(request: Request): Promise<Response> {
  if (env.FEATURE_NOTIFICATION_PREFERENCES !== "1") {
    return new Response(null, { status: 404 });
  }

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
