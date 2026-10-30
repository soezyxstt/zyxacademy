import { createHmac, randomBytes } from "node:crypto";
import { codingErrorResponse, requireCodingAccess } from "@/lib/coding/server-access";

const socketUrl = "wss://zyx-py-runtime.onrender.com/v1/terminal";

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== "https://staging.zyxacademy.com") throw new Error("CODING_FORBIDDEN");
    if (process.env.ZYX_ENVIRONMENT !== "staging") throw new Error("CODING_RUNTIME_CONFIGURATION_REQUIRED");
    const input = await request.json().catch(() => null);
    if (!input || typeof input.courseId !== "string" || !input.courseId.trim() || input.courseId.length > 160 || Object.keys(input).length !== 1) {
      return Response.json({ error: "Permintaan terminal tidak valid." }, { status: 400 });
    }
    await requireCodingAccess(request, input.courseId);
    const secret = process.env.PYTHON_RUNTIME_TOKEN_SECRET;
    if (!secret || !/^[A-Za-z0-9_-]{43,}$/.test(secret)) throw new Error("CODING_RUNTIME_CONFIGURATION_REQUIRED");
    const key = Buffer.from(secret, "base64url");
    if (key.length < 32) throw new Error("CODING_RUNTIME_CONFIGURATION_REQUIRED");
    const body = Buffer.from(JSON.stringify({ aud: "zyx-python-staging", exp: Math.floor(Date.now() / 1000) + 90, jti: randomBytes(18).toString("base64url") })).toString("base64url");
    const signature = createHmac("sha256", key).update(body).digest("base64url");
    return Response.json({ url: socketUrl, ticket: `${body}.${signature}` }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return codingErrorResponse(error); }
}
