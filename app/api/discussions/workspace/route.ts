import { getAuthSession } from "@/lib/auth-session";
import type { DiscussionChannelKind, DiscussionThreadStatus } from "@/lib/discussions/contracts";
import { getThread, listChannelMetadata, listChannelMetadataPage, listThreadsAcrossChannels } from "@/lib/discussions/service";

async function readWorkspace(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const respond = (data: unknown, status = 200) => Response.json(data, { status, headers });
  try {
    const session = await getAuthSession();
    const actorId = session?.user?.id;
    if (!actorId) return respond({ error: "unauthenticated" }, 401);
    if (request.headers.get("x-student-id") !== actorId) return respond({ error: "account_changed" }, 409);

    const expectedSession = request.headers.get("x-discussion-session-id");
    if (expectedSession && expectedSession !== session?.session?.id) return respond({ error: "account_changed" }, 409);

    const params = new URL(request.url).searchParams;
    const cursor = params.get("cursor") ?? undefined;
    switch (params.get("view")) {
      case "channels":
        if (request.method !== "GET") return respond({ error: "invalid" }, 405);
        return respond(await listChannelMetadata(actorId, params.getAll("channelId")));
      case "catalog": {
        if (request.method !== "POST") return respond({ error: "invalid" }, 405);
        const kindFilter = params.get("kindFilter");
        return respond(await listChannelMetadataPage(actorId, {
          courseId: params.get("courseId") ?? undefined,
          search: params.get("search") ?? undefined,
          kind: (params.get("kind") ?? undefined) as DiscussionChannelKind | undefined,
          kinds: kindFilter === null ? undefined : kindFilter ? kindFilter.split(",") as DiscussionChannelKind[] : [],
          limit: 20,
          cursor,
        }));
      }
      case "threads":
        if (request.method !== "GET") return respond({ error: "invalid" }, 405);
        return respond(await listThreadsAcrossChannels(actorId, {
          channelId: params.get("channelId") ?? undefined,
          search: params.get("search") ?? undefined,
          status: (params.get("status") ?? undefined) as DiscussionThreadStatus | undefined,
          cursor,
        }));
      case "thread":
        if (request.method !== "POST") return respond({ error: "invalid" }, 405);
        return respond(await getThread(actorId, params.get("threadId") ?? "", cursor, params.get("messageId") ?? undefined));
      default:
        return respond({ error: "invalid" }, 400);
    }
  } catch (error) {
    if (error instanceof Error && error.message === "DISCUSSION_INVALID") return respond({ error: "invalid" }, 400);
    if (error instanceof Error && error.message === "DISCUSSION_UNAVAILABLE") return respond({ error: "unavailable" }, 404);
    return respond({ error: "unavailable" }, 503);
  }
}

export const GET = readWorkspace;
export const POST = readWorkspace;
