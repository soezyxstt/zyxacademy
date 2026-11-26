import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { session } from "@/db/schema";
import { getAuthSession } from "@/lib/auth-session";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { ensureLegacyIdentity } from "@/lib/auth/legacy-identity";
import { getDiscussionActor } from "@/lib/discussions/access";
import { tutorDiscussionWorkspaceServices } from "@/lib/native/academic/tutor-discussion-workspace-services";
import { tutorSupportServices } from "@/lib/native/academic/tutor-support-services";
import { handleAdminDiscussions, type AdminDiscussionActor } from "@/lib/native/handle-admin-discussions";

type Context = { params: Promise<{ operation?: string[] }> };

async function actor() {
  const auth = await getAuthSession();
  if (!auth?.user.id || !auth.session?.id) return null;
  return { id: auth.user.id, sessionId: auth.session.id };
}

async function allowed(actor: AdminDiscussionActor) {
  try {
    await ensureLegacyIdentity(actor.id);
    const [identity, [active]] = await Promise.all([
      getDiscussionActor(actor.id),
      db.select({ id: session.id }).from(session).where(and(
        eq(session.id, actor.sessionId), eq(session.userId, actor.id), gt(session.expiresAt, new Date()),
      )).limit(1),
    ]);
    return identity.role === "admin" && Boolean(active);
  } catch {
    return false;
  }
}

async function dispatch(request: Request, context: Context) {
  return handleAdminDiscussions(request, (await context.params).operation ?? [], new URL(resolveAuthBaseUrl()).origin, {
    actor, allowed, threads: tutorSupportServices, workspace: tutorDiscussionWorkspaceServices,
  });
}

export const GET = dispatch;
export const POST = dispatch;
