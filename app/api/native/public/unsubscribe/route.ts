import { z } from "zod";
import { verifyEmailUnsubscribeToken } from "@/lib/email-preferences/token";
import { unsubscribeWithEmailToken } from "@/lib/email-preferences/unsubscribe";

const input = z.object({
  token: z.string().min(1).max(4096),
  intent: z.enum(["inspect", "confirm"]),
}).strict();

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 404, headers });

  const { token, intent } = parsed.data;
  let category;
  try {
    ({ category } = verifyEmailUnsubscribeToken(token));
  } catch {
    return Response.json({ error: "invalid" }, { status: 404, headers });
  }

  if (intent === "confirm") {
    try {
      ({ category } = await unsubscribeWithEmailToken(token));
    } catch {
      return Response.json({ error: "unavailable" }, { status: 503, headers });
    }
  }
  return Response.json({ category }, { headers });
}
