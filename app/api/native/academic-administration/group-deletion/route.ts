import { z } from "zod";
import { getAuthSession } from "@/lib/auth-session";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { handleAdminCommand } from "@/lib/native/academic/administration/admin-command-handler";
import { readGroupDeletion, writeGroupDeletion } from "@/lib/native/academic/administration/group-deletion-service";
import { nativeAdminIdSchema } from "@/lib/native/academic/administration/request-validation";
import { hasPeran } from "@/lib/auth/request-cache";
import { courseCommandReply as reply } from "@/lib/native/academic/course-command";

const target = z.object({ kind: z.enum(["group", "token"]), id: nativeAdminIdSchema }).strict();
const deletion = target.extend({ action: z.literal("delete"), groupId: nativeAdminIdSchema,
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true) });
const auth = { session: getAuthSession, hasAdmin: (id: string) => hasPeran(id, "admin") };

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = target.safeParse(Object.fromEntries(params));
  if (!parsed.success || params.size !== 2) return reply(400, { error: "INVALID_INPUT" });
  try {
    const viewer = await getAuthSession();
    if (!viewer?.user.id || !viewer.session.id) return reply(401, { error: "UNAUTHENTICATED" });
    if (!await auth.hasAdmin(viewer.user.id)) return reply(403, { error: "FORBIDDEN" });
    const current = await readGroupDeletion(parsed.data, viewer);
    return current ? reply(200, current) : reply(404, { error: "NOT_FOUND" });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return code === "FORBIDDEN" ? reply(403, { error: code }) : code === "UNAUTHENTICATED" ? reply(401, { error: code }) : reply(503, { error: "READ_FAILED" });
  }
}

export function POST(request: Request) {
  return handleAdminCommand(request, new URL(resolveAuthBaseUrl()).origin, auth, deletion, writeGroupDeletion);
}
