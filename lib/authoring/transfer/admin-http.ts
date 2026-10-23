import { assertAdmin } from "@/lib/auth/admin-guards";
import { transferConfig } from "./security";
import { readTransferJson, transferError } from "./http";

export async function adminTransferRequest(request: Request, operation: (config: ReturnType<typeof transferConfig>, actor: { actorId: string; sessionId: string }, body: unknown) => Promise<unknown>, readOnly = false, noBody = false) {
  try {
    const session = await assertAdmin();
    if (!readOnly) {
      const origin = request.headers.get("origin");
      if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const { auth } = await import("@/lib/auth");
    const fullSession = await auth.api.getSession({ headers: request.headers });
    if (!fullSession?.session.id || fullSession.user.id !== session.user.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = readOnly || noBody ? undefined : await readTransferJson(request);
    const result = await operation(transferConfig(), { actorId: session.user.id, sessionId: fullSession.session.id }, body);
    return Response.json(result, { status: request.method === "POST" && new URL(request.url).pathname === "/api/admin/transfers" ? 202 : 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof Error && error.message.startsWith("Forbidden")) return Response.json({ error: "Forbidden" }, { status: 403 });
    return transferError(error);
  }
}
