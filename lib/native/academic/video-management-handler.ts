import { z } from "zod";
import { readCourseCommandBody, validCourseCommandId, courseCommandReply, type CourseCommandViewer } from "./course-command";
import {
  videoManagerAccount, videoManagerSession, videoManagementPath, type ManagedVideoCommand, type VideoManagementCatalog, type VideoManagerRole,
  type VideoUploadGrant, type VideoUploadInput,
} from "@/packages/course-video/management";

type Scope = { role: VideoManagerRole; courseId: string; viewer: CourseCommandViewer };
type Services = {
  session(request: Request): Promise<CourseCommandViewer | null>;
  read(scope: Scope): Promise<VideoManagementCatalog>;
  write(scope: Scope, command: ManagedVideoCommand, requestId: string): Promise<{ id: string }>;
  prepare?(scope: Scope, input: VideoUploadInput): Promise<VideoUploadGrant>;
  metadata?(scope: Scope, video: string): Promise<{ title: string }>;
};

const id = z.string().refine(validCourseCommandId);
const expectedRevision = z.string().regex(/^[a-f0-9]{64}$/);
const uploaded = z.strictObject({ kind: z.literal("uploaded"), token: z.string().min(1).max(2048) });
const fields = z.strictObject({ title: z.string().trim().min(1).max(500), description: z.string().trim().max(10_000).nullable() });
const videoFields = fields.extend({
  playlistId: id,
  chapterId: id.nullable(),
  source: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("keep") }),
    z.strictObject({ kind: z.literal("youtube"), video: z.string().trim().min(1).max(2048) }),
    uploaded,
  ]),
  thumbnail: z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("default") }), uploaded]).optional(),
});
const commands = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("prepare-upload"), fields: z.strictObject({
    kind: z.enum(["video", "thumbnail"]), name: z.string().trim().min(1).max(120), mime: z.string().max(80), size: z.number().int().positive(),
    uploadId: z.uuidv4(),
  }) }),
  z.strictObject({ action: z.literal("new-playlist"), fields }),
  z.strictObject({ action: z.literal("edit-playlist"), id, expectedRevision, fields }),
  z.strictObject({ action: z.literal("new-video"), fields: videoFields.refine(value => value.source.kind !== "keep") }),
  z.strictObject({ action: z.literal("edit-video"), id, playlistId: id, expectedRevision, fields: videoFields }),
  z.strictObject({ action: z.literal("delete-playlist"), id, expectedRevision, confirmed: z.literal(true) }),
  z.strictObject({ action: z.literal("delete-video"), id, playlistId: id, expectedRevision, confirmed: z.literal(true) }),
]);

export async function handleVideoManagement(request: Request, input: { role: string; courseId: string }, origin: string, services: Services) {
  const { role, courseId } = input;
  if ((role !== "admin" && role !== "tutor") || !videoManagementPath(role, courseId)) return courseCommandReply(404, { error: "NOT_FOUND" });
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return courseCommandReply(403, { error: "INVALID_ORIGIN" });
  if (request.method !== "GET" && request.method !== "POST") return courseCommandReply(405, { error: "INVALID_METHOD" });
  if (request.method === "POST" && request.headers.get("origin") !== origin) return courseCommandReply(403, { error: "INVALID_ORIGIN" });
  try {
    const viewer = await services.session(request);
    if (!viewer) return courseCommandReply(401, { error: "UNAUTHENTICATED" });
    if (request.headers.get(videoManagerAccount) !== viewer.user.id || request.headers.get(videoManagerSession) !== viewer.session.id) {
      return courseCommandReply(409, { error: "SESSION_CHANGED" });
    }
    const scope: Scope = { role, courseId, viewer };
    if (request.method === "GET") {
      const video = new URL(request.url).searchParams.get("youtube");
      if (video !== null) {
        if (!services.metadata || !/^[A-Za-z0-9_-]{11}$/.test(video)) return courseCommandReply(422, { error: "INVALID_VIDEO" });
        return courseCommandReply(200, await services.metadata(scope, video));
      }
      return courseCommandReply(200, await services.read(scope));
    }
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return courseCommandReply(415, { error: "INVALID_CONTENT_TYPE" });
    const key = z.uuidv4().safeParse(request.headers.get("idempotency-key"));
    const command = await readCourseCommandBody(request, commands);
    if (!key.success || !command?.success) return courseCommandReply(422, { error: "INVALID_VIDEO" });
    if (command.data.action === "prepare-upload") {
      if (!services.prepare || key.data !== command.data.fields.uploadId) return courseCommandReply(422, { error: "INVALID_VIDEO" });
      const prepared = await services.prepare(scope, command.data.fields);
      return courseCommandReply(200, { ...prepared, requestId: key.data });
    }
    const saved = await services.write(scope, command.data, key.data);
    return courseCommandReply(200, { id: saved.id, requestId: key.data });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "UNAUTHENTICATED") return courseCommandReply(401, { error: code });
    if (code === "FORBIDDEN") return courseCommandReply(403, { error: code });
    if (["COURSE_NOT_FOUND", "CHAPTER_NOT_FOUND", "VIDEO_NOT_FOUND"].includes(code)) return courseCommandReply(404, { error: "NOT_FOUND" });
    if (["REVISION_CONFLICT", "REQUEST_CONFLICT", "DEPENDENCIES_EXIST"].includes(code)) return courseCommandReply(409, { error: code });
    if (code === "INVALID_VIDEO") return courseCommandReply(422, { error: code });
    return courseCommandReply(503, { error: "SAVE_FAILED" });
  }
}
