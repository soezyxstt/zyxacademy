import { z } from "zod";
import type { FlashcardAdminChange } from "@/lib/academic/flashcard-admin-writes";
import { courseCommandReply, handleCourseCommand, validCourseCommandId, type CourseCommandAuth, type CourseCommandViewer } from "./course-command";

type Services = CourseCommandAuth & {
  save(slug: string, change: FlashcardAdminChange, requestId: string, viewer: CourseCommandViewer): Promise<void>;
};

const id = z.string().refine(validCourseCommandId);
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const statuses = z.enum(["draft", "published", "retired"]);
const initialStatuses = z.enum(["draft", "published"]);
const text = (max: number) => z.string().trim().min(1).max(max).refine(value => !value.includes("\0"));
const deleteSchema = z.object({ expectedRevision: revision, confirmed: z.literal(true) }).strict();
const setFields = { title: text(500), chapterId: id.nullable() };
const cardFields = {
  front: text(10_000), back: text(10_000),
  explanation: text(20_000).nullable(), targetSetId: id,
};

export function handleAdminCourseFlashcardCommand(request: Request, parts: string[], origin: string, services: Services) {
  const [role, collection, slug, section, sets, setId, cards, cardId] = parts;
  const { method } = request;
  if (role !== "admin" || collection !== "courses" || section !== "flashcards" || sets !== "sets" ||
    ![5, 6, 7, 8].includes(parts.length) || (parts.length >= 7 && cards !== "cards")) {
    return courseCommandReply(404, { error: "NOT_FOUND" });
  }
  if (![slug, setId, cardId].every(value => value === undefined || validCourseCommandId(value))) {
    return courseCommandReply(400, { error: "INVALID_PATH" });
  }
  const write = <T,>(schema: z.ZodType<T>, project: (body: T) => FlashcardAdminChange) =>
    handleCourseCommand(request, origin, services, {
      schema, invalidError: "INVALID_FLASHCARD",
      write: (body, requestId, viewer) => services.save(slug, project(body), requestId, viewer),
    });

  if (method === "POST" && parts.length === 5) {
    return write(z.object({ ...setFields, status: initialStatuses, expectedRevision: z.null() }).strict(),
      draft => ({ kind: "set", method: "create", draft }));
  }
  if (method === "POST" && setId && parts.length === 7) {
    return write(z.object({ ...cardFields, status: initialStatuses, expectedRevision: z.null() }).strict().refine(body => body.targetSetId === setId),
      draft => ({ kind: "card", method: "create", draft, parentId: setId }));
  }
  if (method === "PATCH" && setId && parts.length === 6) {
    return write(z.object({ ...setFields, status: statuses, expectedRevision: revision }).strict(),
      draft => ({ kind: "set", method: "update", id: setId, draft }));
  }
  if (method === "PATCH" && setId && cardId && parts.length === 8) {
    return write(z.object({ ...cardFields, status: statuses, expectedRevision: revision }).strict(),
      draft => ({ kind: "card", method: "update", id: cardId, parentId: setId, draft }));
  }
  if (method === "DELETE" && setId && parts.length === 6) {
    return write(deleteSchema, ({ expectedRevision }) => ({ kind: "set", method: "delete", id: setId, expectedRevision }));
  }
  if (method === "DELETE" && setId && cardId && parts.length === 8) {
    return write(deleteSchema, ({ expectedRevision }) => ({ kind: "card", method: "delete", id: cardId, parentId: setId, expectedRevision }));
  }
  return courseCommandReply(404, { error: "NOT_FOUND" });
}
