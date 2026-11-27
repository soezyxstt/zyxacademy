import "server-only";
import { createThread, forward } from "@/lib/discussions/actions";
import { deleteMessage, edit, listChannelMetadata, listChannelMetadataPage, listThreadsAcrossChannels, report, searchChannelMentions, setMute } from "@/lib/discussions/service";
import { requireDiscussionChannelAccess, requireDiscussionMessageAccess } from "@/lib/discussions/access";
import { canForwardDiscussion } from "@/lib/discussions/policy";
import type { TutorDiscussionMessageScope } from "@/packages/academic/tutor-discussion-workspace";
import { requireTutorCourseAccess } from "@/lib/auth/request-cache";
import { tutorSupportServices } from "./tutor-support-services";
import type { TutorDiscussionWorkspaceServices } from "./handle-tutor-discussion-workspace";

async function authorizeChannel(actorId: string, courseId: string | undefined, channelId: string) {
  const channel = await requireDiscussionChannelAccess({ id: actorId, role: "tutor" }, channelId);
  if (!courseId) return channel;
  const access = await requireTutorCourseAccess(actorId, courseId, { allowAdmin: false });
  const aliases = [access.courseId, access.legacyCourseId].filter(Boolean);
  const channelIds = [channel.courseId, channel.legacyCourseId].filter(Boolean);
  if (channel.kind !== "course" || !channelIds.length || !channelIds.every(id => aliases.includes(id))) throw new Error("DISCUSSION_UNAVAILABLE");
  return channel;
}

async function authorizeMessage(actorId: string, courseId: string | undefined, { threadId, messageId }: TutorDiscussionMessageScope) {
  const viewed = await requireDiscussionMessageAccess({ id: actorId, role: "tutor" }, messageId);
  if (viewed.thread.id !== threadId || viewed.message.deletedAt) throw new Error("DISCUSSION_UNAVAILABLE");
  if (courseId) await authorizeChannel(actorId, courseId, viewed.channel.id);
  return viewed;
}

async function authorizeForward(actorId: string, courseId: string | undefined, scope: TutorDiscussionMessageScope) {
  const { channel, message } = await authorizeMessage(actorId, courseId, scope);
  if (message.messageType === "forward" || !canForwardDiscussion(channel, channel)) throw new Error("DISCUSSION_UNAVAILABLE");
  return channel;
}

export const tutorDiscussionWorkspaceServices = {
  session: tutorSupportServices.session,
  hasTutor: tutorSupportServices.hasTutor,
  authorizeCourse: tutorSupportServices.authorizeCourse,
  catalog: (actorId, courseId, search, cursor) => listChannelMetadataPage(actorId, {
    courseId, ...(courseId ? { kind: "course" as const } : {}), search, cursor, limit: 20,
  }),
  async channelMentions(actorId, courseId, channelId, search) {
    await authorizeChannel(actorId, courseId, channelId);
    return (await searchChannelMentions(actorId, channelId, search)).map(({ id, name, role, context, hasNamesake, ambiguous }) =>
      ({ id, name, role, context, hasNamesake, ambiguous }));
  },
  async create(actorId, courseId, { input, requestId }) {
    const channel = await authorizeChannel(actorId, courseId, input.channelId);
    if (channel.kind !== "course" && channel.kind !== "global") throw new Error("DISCUSSION_UNAVAILABLE");
    return createThread({ ...input, requestId, attachmentIds: input.attachmentIds ?? [], mentionIds: input.mentionIds ?? [], askZyra: input.askZyra ?? false });
  },
  async forwardChannels(actorId, courseId, scope, search, cursor) {
    const source = await authorizeForward(actorId, courseId, scope);
    if (source.kind !== "global") {
      return { items: await listChannelMetadata(actorId, [source.id]), nextCursor: null };
    }
    return listChannelMetadataPage(actorId, { kinds: ["global", "course"], search, cursor, limit: 20 });
  },
  async forwardTargets(actorId, courseId, scope, channelId, search, cursor) {
    const source = await authorizeForward(actorId, courseId, scope);
    const destination = await requireDiscussionChannelAccess({ id: actorId, role: "tutor" }, channelId);
    if (!canForwardDiscussion(source, destination)) throw new Error("DISCUSSION_UNAVAILABLE");
    const page = await listThreadsAcrossChannels(actorId, { channelId, status: "open", search, cursor });
    return { items: page.items.filter(item => item.id !== scope.threadId).map(({ id, channelId, title }) => ({ id, channelId, title })),
      nextCursor: page.nextCursor };
  },
  async forward(actorId, courseId, action) {
    await authorizeForward(actorId, courseId, action);
    return forward(action.messageId, action.destinationId, action.requestId);
  },
  async message(actorId, courseId, action) {
    await authorizeMessage(actorId, courseId, action);
    switch (action.action) {
      case "edit": await edit(actorId, action.messageId, action.body, action.revision); break;
      case "delete": await deleteMessage(actorId, action.messageId); break;
      case "report": await report(actorId, action.messageId, action.reason); break;
    }
  },
  async mute(actorId, courseId, channelId, muted) {
    await authorizeChannel(actorId, courseId, channelId);
    await setMute(actorId, channelId, muted);
  },
} satisfies TutorDiscussionWorkspaceServices;
