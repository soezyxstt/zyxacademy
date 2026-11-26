import { handleTutorDiscussionAnswer, handleTutorSupport, type TutorSupportServices } from "./academic/handle-tutor-support";
import { handleTutorDiscussionWorkspace, type TutorDiscussionWorkspaceServices } from "./academic/handle-tutor-discussion-workspace";

export type AdminDiscussionActor = { id: string; sessionId: string };
type Services = {
  actor(): Promise<AdminDiscussionActor | null>;
  allowed(actor: AdminDiscussionActor): Promise<boolean>;
  threads: TutorSupportServices;
  workspace: TutorDiscussionWorkspaceServices;
};

const reply = (status: number) => Response.json({ error: "unavailable" }, { status, headers: { "Cache-Control": "private, no-store" } });

/** Bind the shared discussion protocol to the live Admin session and this route. */
export async function handleAdminDiscussions(request: Request, parts: string[], origin: string, services: Services) {
  if (parts.length > 1 || (parts.length === 1 && parts[0] !== "workspace")) return reply(404);
  const write = request.method === "POST";
  if (!write && request.method !== "GET") return reply(405);
  const suppliedOrigin = request.headers.get("origin");
  if (((write || suppliedOrigin !== null) && suppliedOrigin !== origin) || request.headers.get("sec-fetch-site") === "cross-site") return reply(403);
  try {
    const actor = await services.actor();
    if (!actor) return reply(401);
    if (request.headers.get("x-native-operations-user-id") !== actor.id ||
        request.headers.get("x-native-operations-session-id") !== actor.sessionId) return reply(403);

    const identity = {
      session: async () => ({ user: { id: actor.id } }),
      hasTutor: async () => services.allowed(actor),
      authorizeCourse: async () => { throw new Error("FORBIDDEN"); },
    };

    // The shared handler can finish decoding after the role or session was revoked.
    function guard<Args extends unknown[], Result>(operation: (...args: Args) => Promise<Result>) {
      return async (...args: Args) => {
        if (write && !await services.allowed(actor)) throw new Error("FORBIDDEN");
        return operation(...args);
      };
    }

    if (parts.length) {
      const { workspace } = services;
      return handleTutorDiscussionWorkspace(request, ["discussions", "workspace"], origin, {
        ...workspace, ...identity,
        create: guard(workspace.create), message: guard(workspace.message), mute: guard(workspace.mute), forward: guard(workspace.forward),
      });
    }
    const { threads } = services;
    const scoped = { ...threads, ...identity, answer: guard(threads.answer),
      ...(threads.changeDiscussion ? { changeDiscussion: guard(threads.changeDiscussion) } : {}) };
    return write
      ? handleTutorDiscussionAnswer(request, ["discussions"], origin, scoped)
      : handleTutorSupport(new URL(request.url), ["discussions"], scoped);
  } catch {
    return reply(503);
  }
}
