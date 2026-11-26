import { publicMeetingUrl } from "../../../../packages/meet/public-destination";
import { FORM_FILE_MIMES, type FormFileMime } from "../../../../packages/forms/file-types";
import { formFileSizeLimitMb, isEmptyFormAnswer } from "../../../../packages/forms/presentation";
import type { FormClosure } from "../../../../packages/forms/response-policy";

export const otherOption = "\uE000__other__";
const questionTypes = [
  "TEXT", "PARAGRAPH", "RADIO", "CHECKBOX", "DROP_DOWN", "FILE_UPLOAD", "SCALE", "RATING",
  "GRID_RADIO", "GRID_CHECKBOX", "DATE", "TIME", "SECTION", "STATEMENT",
] as const;

type QuestionType = typeof questionTypes[number];
export type PublicQuestion = {
  type: QuestionType;
  title: string;
  description?: string;
  imageUrl?: string;
  required?: boolean;
  options?: string[];
  otherOption?: { enabled: boolean; label: string };
  scaleLow?: number;
  scaleHigh?: number;
  scaleLowLabel?: string;
  scaleHighLabel?: string;
  gridRows?: string[];
  gridColumns?: string[];
  maxFileSizeMb?: number;
  allowedFileTypes?: FormFileMime[];
};

export type PublicForm = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  questions: PublicQuestion[];
  settings: {
    collectEmail: "none" | "input" | "verified";
    displayMode: "question" | "section";
    requireLogin: boolean;
    limitToOneResponse: boolean;
    customSuccessMessage?: string;
  };
};

export type FormEntry = "full" | "short";
export type FormLocale = "id" | "en";
type GridAnswers = Record<string, string | string[]>;
export type PublicAnswer = string | string[] | GridAnswers;
export type PublicFormAnswers = Record<number, PublicAnswer>;
export type FormDraft = { answers: PublicFormAnswers; other: Record<number, string>; email: string };
export type FieldIssue = "required" | "other" | "date" | "time";
export type PublicFormLoad =
  | { status: "ready"; form: PublicForm }
  | { status: "closed"; title: string; closure: FormClosure | null }
  | { status: "meeting"; url: string | null }
  | { status: "missing" | "error" | "unsupported" };

function record(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : null;
}

export function formIdentifier(raw: unknown) {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 256 || raw === "." || raw === ".."
    || /[\\/\u0000-\u001f\u007f\ud800-\udfff]/u.test(raw)) return null;
  return raw;
}

export function publicFormPath(entry: FormEntry, identifier: string) {
  return `/${entry === "short" ? "f" : "forms"}/${encodeURIComponent(identifier)}` as const;
}

export function publicFormApiPath(identifier: string, entry: FormEntry = "full") {
  return `/api/forms/${encodeURIComponent(identifier)}${entry === "short" ? "?entry=short" : ""}`;
}

function stringSet(input: unknown) {
  return Array.isArray(input) && input.every(item => typeof item === "string") ? input as string[] : undefined;
}

function text(input: unknown) {
  return typeof input === "string" ? input : undefined;
}

function parseQuestion(input: unknown): PublicQuestion | null {
  const item = record(input);
  const type = item?.type as QuestionType | undefined;
  if (!item || !type || !questionTypes.includes(type) || typeof item.title !== "string") return null;
  const other = record(item.otherOption);
  const allowed = stringSet(item.allowedFileTypes);
  return {
    type, title: item.title, description: text(item.description), imageUrl: text(item.imageUrl), required: item.required === true,
    options: stringSet(item.options), otherOption: other ? { enabled: other.enabled === true, label: text(other.label) ?? "" } : undefined,
    scaleLow: Number.isInteger(item.scaleLow) && Number(item.scaleLow) >= 0 && Number(item.scaleLow) <= 1 ? Number(item.scaleLow) : undefined,
    scaleHigh: Number.isInteger(item.scaleHigh) && Number(item.scaleHigh) >= 2 && Number(item.scaleHigh) <= 10 ? Number(item.scaleHigh) : undefined,
    scaleLowLabel: text(item.scaleLowLabel), scaleHighLabel: text(item.scaleHighLabel),
    gridRows: stringSet(item.gridRows), gridColumns: stringSet(item.gridColumns),
    maxFileSizeMb: typeof item.maxFileSizeMb === "number" ? item.maxFileSizeMb : undefined,
    allowedFileTypes: item.allowedFileTypes === undefined ? undefined : FORM_FILE_MIMES.filter(mime => allowed?.includes(mime)),
  };
}

function parseClosure(input: unknown): FormClosure | null {
  const row = record(input);
  if (row?.kind === "closed") return { kind: "closed", message: text(row.message) };
  if (row?.kind === "scheduled" && typeof row.opensAt === "string" && Number.isFinite(Date.parse(row.opensAt))) {
    return { kind: "scheduled", opensAt: row.opensAt };
  }
  if (row?.kind === "ended" && typeof row.endedAt === "string" && Number.isFinite(Date.parse(row.endedAt))) {
    return { kind: "ended", endedAt: row.endedAt, message: text(row.message) };
  }
  return null;
}

export function parsePublicForm(input: unknown, entry: FormEntry): PublicFormLoad {
  const envelope = record(input);
  if (entry === "short" && envelope?.destination === "meeting" && envelope?.success === true) {
    return { status: "meeting", url: publicMeetingUrl(envelope.meetingUri) };
  }
  const form = record(envelope?.form);
  if (!form || typeof form.title !== "string") return { status: "error" };
  if (envelope?.isClosed === true) return { status: "closed", title: form.title, closure: parseClosure(envelope.closure) };
  const id = formIdentifier(form.id);
  const slug = formIdentifier(form.slug);
  if (!id || !slug || !Array.isArray(form.questions) || envelope?.success !== true) return { status: "error" };
  const settings = record(form.settings);
  const questions = form.questions.map(parseQuestion);
  if (questions.some(question => !question)) return { status: "unsupported" };
  return { status: "ready", form: {
    id, slug, title: form.title, description: text(form.description), questions: questions as PublicQuestion[],
    settings: {
      collectEmail: settings?.collectEmail === "input" || settings?.collectEmail === "verified" ? settings.collectEmail : "none",
      displayMode: settings?.displayMode === "section" ? "section" : "question",
      requireLogin: settings?.requireLogin === true, limitToOneResponse: settings?.limitToOneResponse === true,
      customSuccessMessage: text(settings?.customSuccessMessage),
    },
  } };
}

// Expo fetch keeps both file bytes and the complete multipart body in JavaScript memory.
const maxBufferedUploadMb = 10;

export function formUploadPolicy(question: PublicQuestion) {
  const authoredMaxMb = formFileSizeLimitMb(question.maxFileSizeMb);
  const maxMb = Math.min(authoredMaxMb, maxBufferedUploadMb);
  return { mimeTypes: question.allowedFileTypes ?? FORM_FILE_MIMES, maxBytes: Math.floor(maxMb * 1024 * 1024), maxMb, authoredMaxMb };
}

export function isOtherAnswer(answer: PublicAnswer | undefined) {
  return answer === otherOption || (Array.isArray(answer) && answer.includes(otherOption));
}

export function questionIssue(question: PublicQuestion, answer: PublicAnswer | undefined, detail: string): FieldIssue | null {
  if (question.type === "SECTION" || question.type === "STATEMENT") return null;
  if (isOtherAnswer(answer) && !detail.trim()) return "other";
  const temporal = question.type === "TIME" || question.type === "DATE";
  const value = temporal && typeof answer === "string" && !answer.replace(/[-:]/g, "") ? undefined : answer;
  if (typeof value === "string" && temporal) {
    if (question.type === "TIME" && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return "time";
    if (question.type === "DATE") {
      const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      if (!parts) return "date";
      const [, year, month, day] = parts;
      const date = new Date(value + "T00:00:00Z");
      if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month)
        || date.getUTCDate() !== Number(day)) return "date";
    }
  }
  if (question.required && isEmptyFormAnswer(question, value)) return "required";
  return null;
}

export function validFormEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function submitFormBody(form: PublicForm, draft: FormDraft) {
  const answers: PublicFormAnswers = {};
  for (const [key, answer] of Object.entries(draft.answers)) {
    const index = Number(key);
    const question = form.questions[index];
    if (!question || question.type === "SECTION" || question.type === "STATEMENT") continue;
    if ((question.type === "DATE" || question.type === "TIME") && typeof answer === "string" && !answer.replace(/[-:]/g, "")) continue;
    const detail = draft.other[index]?.trim();
    answers[index] = answer === otherOption && detail ? detail
      : Array.isArray(answer) && detail ? answer.map(value => value === otherOption ? detail : value) : answer;
  }
  return { answers, responderEmail: form.settings.collectEmail === "input" ? draft.email.trim() : undefined };
}

export function fieldsOnStep(step: import("../../../../packages/forms/presentation").FormStep | undefined) {
  if (step?.kind === "page") return { indices: step.questionIndices, email: step.includeEmail, cover: step.includeCover };
  if (step?.kind === "email" || step?.kind === "cover") return { indices: [], email: step.kind === "email", cover: step.kind === "cover" };
  return { indices: step ? [step.questionIndex] : [], email: false, cover: false };
}
