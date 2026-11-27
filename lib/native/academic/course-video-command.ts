import { z } from "zod";
import type { AdminEntityDeleteDraft } from "../../../packages/native-parity/academic/courses/edit-contract";
import { courseCommandReply, handleCourseCommand, validCourseCommandId, type CourseCommandAuth, type CourseCommandViewer } from "./course-command";

type Services = CourseCommandAuth & {
  remove(slug: string, playlistId: string, videoId: string | undefined, draft: AdminEntityDeleteDraft, requestId: string, viewer: CourseCommandViewer): Promise<void>;
};

const schema = z.object({ expectedRevision: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true) }).strict();

export function handleAdminCourseVideoCommand(request: Request, parts: string[], origin: string, services: Services) {
  const [role, collection, slug, section, playlists, playlistId, videos, videoId] = parts;
  if (request.method !== "DELETE" || role !== "admin" || collection !== "courses" ||
    section !== "videos" || playlists !== "playlists" ||
    !(parts.length === 6 || (parts.length === 8 && videos === "videos"))) return courseCommandReply(404, { error: "NOT_FOUND" });
  if (![slug, playlistId, ...(videoId !== undefined ? [videoId] : [])].every(validCourseCommandId)) {
    return courseCommandReply(400, { error: "INVALID_PATH" });
  }
  return handleCourseCommand(request, origin, services, {
    schema, invalidError: "INVALID_VIDEO",
    write: (draft, requestId, viewer) => services.remove(slug, playlistId, videoId, draft, requestId, viewer),
  });
}
