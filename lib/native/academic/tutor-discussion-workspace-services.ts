import "server-only";
import { createThread } from "@/lib/discussions/actions";
import { listChannelMetadataPage, searchChannelMentions, setMute } from "@/lib/discussions/service";
import { requireDiscussionChannelAccess } from "@/lib/discussions/access";
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
  async mute(actorId, courseId, channelId, muted) {
    await authorizeChannel(actorId, courseId, channelId);
    await setMute(actorId, channelId, muted);
  },
} satisfies TutorDiscussionWorkspaceServices;
