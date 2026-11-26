import { isSafeKey, quizAttachmentPrefix } from "../../../storage/keys";

type Viewer = { user: { id: string }; session: { id: string } };
type Services = {
  session(): Promise<Viewer | null>;
  find(courseId: string, attemptId: string, questionId: string, viewer: Viewer): Promise<{ templateId: string; key: string } | null>;
  download(request: Request, segments: string[]): Promise<Response>;
};

const notFound = () => new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export async function handleGradeAttachment(request: Request, parts: string[], services: Services) {
  const [role, courseId, operation, attemptId, action, questionId] = parts;
  if (parts.length !== 6 || role !== "tutor" || operation !== "grading" || action !== "attachment" ||
    [courseId, attemptId, questionId].some(id => !id.trim() || id.length > 256 || /[/\\\u0000-\u001f]/.test(id))) return notFound();
  try {
    const viewer = await services.session();
    if (!viewer?.user.id || !viewer.session.id) return notFound();
    const attachment = await services.find(courseId, attemptId, questionId, viewer);
    if (!attachment || !isSafeKey(attachment.key)) return notFound();
    const prefix = quizAttachmentPrefix(attachment.templateId);
    if (!attachment.key.startsWith(prefix) || !/^[a-z0-9][a-z0-9._-]*$/i.test(attachment.key.slice(prefix.length))) return notFound();
    const url = new URL(request.url);
    url.search = "?download=1";
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete("Range");
    const response = await services.download(new Request(url, { headers: requestHeaders, signal: request.signal }), attachment.key.split("/"));
    const type = response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
    const length = response.headers.get("Content-Length");
    if (response.status !== 200 || !response.body || !type || !allowedTypes.has(type) ||
      (length !== null && (!/^\d+$/.test(length) || Number(length) > 4 * 1024 * 1024))) {
      await response.body?.cancel().catch(() => {});
      return notFound();
    }
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "private, no-store");
    return new Response(response.body, { headers });
  } catch {
    return notFound();
  }
}
