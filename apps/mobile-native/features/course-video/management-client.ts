import { z } from "zod";
import { videoManagerAccount, videoManagerSession, videoManagementPath,
  type ManagedVideoCommand, type VideoManagementCatalog, type VideoManagerRole } from "../../../../packages/course-video/management";
import type { NativeSessionTransport } from "../../network/transport";

const row = z.object({ id: z.string(), title: z.string(), description: z.string().nullable(), revision: z.string().regex(/^[a-f0-9]{64}$/) });
const video = row.extend({ chapterId: z.string().nullable(), youtube: z.string().nullable(), duration: z.number().int().nullable(), fileSize: z.number().int().nullable() });
const catalog = z.object({ courseId: z.string(), title: z.string(), chapters: z.array(z.object({ id: z.string(), title: z.string() })),
  playlists: z.array(row.extend({ videos: z.array(video) })) });
const receipt = z.object({ id: z.string().min(1), requestId: z.string() });
export type VideoManagementAttempt = { requestId: string; command: ManagedVideoCommand };

export class VideoManagementFailure extends Error {
  constructor(readonly status: number) { super("Course video management unavailable"); }
}

function address(session: NativeSessionTransport, role: VideoManagerRole, courseId: string) {
  const path = videoManagementPath(role, courseId);
  if (!path) throw new VideoManagementFailure(404);
  return { path, headers: { [videoManagerAccount]: session.scope.accountId, [videoManagerSession]: session.scope.sessionId } };
}

export async function readManagedVideos(session: NativeSessionTransport, role: VideoManagerRole, courseId: string, signal: AbortSignal): Promise<VideoManagementCatalog> {
  const { path, headers } = address(session, role, courseId);
  const response = await session.request(path, { headers, signal, retry: "transient-read" });
  try {
    if (!response.ok) throw new VideoManagementFailure(response.status);
    const result = catalog.safeParse(await response.json());
    if (!result.success || result.data.courseId !== courseId) throw new VideoManagementFailure(409);
    return result.data;
  } finally { response.dispose(); }
}

export async function submitManagedVideo(session: NativeSessionTransport, role: VideoManagerRole, courseId: string, attempt: VideoManagementAttempt, signal: AbortSignal) {
  const { path, headers } = address(session, role, courseId);
  const response = await session.request(path, {
    requiredRole: role, method: "POST", signal, body: JSON.stringify(attempt.command),
    headers: { ...headers, Origin: session.scope.origin, "Content-Type": "application/json", "Idempotency-Key": attempt.requestId },
  });
  try {
    if (!response.ok) throw new VideoManagementFailure(response.status);
    const result = receipt.safeParse(await response.json());
    if (!result.success || result.data.requestId !== attempt.requestId ||
      ("id" in attempt.command && attempt.command.id !== result.data.id)) throw new VideoManagementFailure(503);
    return result.data;
  } finally { response.dispose(); }
}
