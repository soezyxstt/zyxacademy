import { isSafeKey, quizAttachmentPrefix } from "../../../storage/keys";
import { TRYOUT_GRADE_ATTACHMENT_ACCOUNT, TRYOUT_GRADE_ATTACHMENT_SESSION, tryoutGradeAttachmentPath, tryoutGradeAttachmentPolicy,
  type TryoutGradeAttachment } from "../../../../packages/academic/tryout-grade-attachment";

type Viewer = { user: { id: string }; session: { id: string } };
type Services = {
  session(): Promise<Viewer | null>;
  find(courseId: string, attemptId: string, questionId: string, viewer: Viewer): Promise<{ templateId: string; key: string } | null>;
  download(request: Request, segments: string[]): Promise<Response>;
};

const notFound = () => new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
const allowedTypes: Set<string> = new Set(tryoutGradeAttachmentPolicy.mimeTypes);

async function serveGradeAttachment(request: Request, key: string, download: Services["download"], maxBytes: number, submissionId?: string) {
  const url = new URL(request.url);
  url.search = new URLSearchParams({ download: "1", ...(submissionId ? { submissionId } : {}) }).toString();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("Range");
  const response = await download(new Request(url, { headers: requestHeaders, signal: request.signal }), key.split("/"));
  const type = response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  const length = response.headers.get("Content-Length");
  if (response.status !== 200 || !response.body || !type || !allowedTypes.has(type) ||
    (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes))) {
    await response.body?.cancel().catch(() => {});
    return notFound();
  }
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, { headers });
}

export async function serveVerifiedQuizAttachment(request: Request, attachment: { templateId: string; key: string }, download: Services["download"]) {
  if (!isSafeKey(attachment.key)) return notFound();
  const prefix = quizAttachmentPrefix(attachment.templateId);
  if (!attachment.key.startsWith(prefix) || !/^[a-z0-9][a-z0-9._-]*$/i.test(attachment.key.slice(prefix.length))) return notFound();
  return serveGradeAttachment(request, attachment.key, download, 4 * 1024 * 1024);
}

export async function handleGradeAttachment(request: Request, parts: string[], services: Services) {
  const [role, courseId, operation, attemptId, action, questionId] = parts;
  if (parts.length !== 6 || role !== "tutor" || operation !== "grading" || action !== "attachment" ||
    [courseId, attemptId, questionId].some(id => !id.trim() || id.length > 256 || /[/\\\u0000-\u001f]/.test(id))) return notFound();
  try {
    const viewer = await services.session();
    if (!viewer?.user.id || !viewer.session.id) return notFound();
    const attachment = await services.find(courseId, attemptId, questionId, viewer);
    return attachment ? await serveVerifiedQuizAttachment(request, attachment, services.download) : notFound();
  } catch {
    return notFound();
  }
}


type TryoutServices = Pick<Services, "session" | "download"> & {
  find(target: TryoutGradeAttachment, viewer: Viewer): Promise<string | null>;
};

export async function handleTryoutGradeAttachment(request: Request, target: TryoutGradeAttachment, services: TryoutServices) {
  if (request.method !== "GET" || !tryoutGradeAttachmentPath(target)) return notFound();
  try {
    const viewer = await services.session();
    if (!viewer?.user.id || !viewer.session.id || viewer.user.id !== request.headers.get(TRYOUT_GRADE_ATTACHMENT_ACCOUNT) ||
      viewer.session.id !== request.headers.get(TRYOUT_GRADE_ATTACHMENT_SESSION)) return notFound();
    const key = await services.find(target, viewer);
    if (!key || !isSafeKey(key)) return notFound();
    return await serveGradeAttachment(request, key, services.download, tryoutGradeAttachmentPolicy.maxBytes, target.submissionId);
  } catch {
    return notFound();
  }
}
