import { z } from "zod";
import { discussionMentionTokens, validDiscussionId } from "../../lib/discussions/policy";
import type { DiscussionMention } from "../../lib/discussions/contracts";

const id = z.string().refine(validDiscussionId);
const role = z.enum(["student", "tutor", "admin"]);
const handle = z.string().regex(/^[\p{L}\p{N}_]{1,64}$/u);
export const tutorMentionCandidate = z.object({
  id, name: z.string().min(1).max(512), role: role.optional(),
  context: z.string().max(100).nullish(), hasNamesake: z.boolean().optional(), ambiguous: z.boolean().optional(),
});
export const tutorDiscussionProfile = z.object({
  name: z.string().min(1).max(512), role: role.nullable(),
  major: z.string().nullable().optional(), faculty: z.string().nullable().optional(),
});
export type TutorDiscussionProfile = z.infer<typeof tutorDiscussionProfile>;
export const tutorMentionInput = z.object({
  mentionIds: z.array(id).max(10).optional(),
  mentionHandles: z.array(handle).max(10).optional(),
  askZyra: z.boolean().optional(),
});

export type MentionBinding = { id: string; handle: string };
export type MentionSelection = { start: number; end: number };
export type TutorMentionInput = z.infer<typeof tutorMentionInput>;

export function validTutorMentionInput(body: string, fields: TutorMentionInput) {
  const ids = fields.mentionIds ?? [];
  const handles = fields.mentionHandles?.map(value => value.toLowerCase()) ?? [];
  const tokens = discussionMentionTokens(body);
  return ids.length === handles.length && new Set(ids).size === ids.length && new Set(handles).size === handles.length
    && handles.every(value => value !== "zyra" && tokens.has(value)) && (!fields.askZyra || tokens.has("zyra"));
}

export function activeTutorMentions(body: string, bindings: readonly MentionBinding[]) {
  const tokens = discussionMentionTokens(body);
  return bindings.filter(item => tokens.has(item.handle.toLowerCase()));
}

export function tutorMentionSubmission(body: string, bindings: readonly MentionBinding[]): TutorMentionInput {
  const people = activeTutorMentions(body, bindings);
  return {
    ...(people.length ? { mentionIds: people.map(item => item.id), mentionHandles: people.map(item => item.handle) } : {}),
    ...(discussionMentionTokens(body).has("zyra") ? { askZyra: true } : {}),
  };
}

export function insertTutorMention(body: string, selection: MentionSelection, bindings: readonly MentionBinding[], person?: DiscussionMention) {
  if (person?.ambiguous) return null;
  const known = person && bindings.find(item => item.id === person.id);
  if (person && !known && bindings.length >= 10) return null;
  const personLabel = person?.name.trim().replace(/\s+/g, "_").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 32) || "Anggota";
  const base = personLabel.toLowerCase() === "zyra" ? "Anggota_Zyra" : personLabel;
  let selected = person ? known?.handle ?? base : "Zyra";
  if (person && !known) {
    const used = new Set([...bindings.map(item => item.handle.toLowerCase()), ...discussionMentionTokens(body)]);
    for (let suffix = 2; used.has(selected.toLowerCase()); suffix++) selected = `${base}_${suffix}`;
  }
  const end = Math.max(0, Math.min(body.length, selection.end));
  const start = Math.max(0, Math.min(end, selection.start));
  const prefix = body.slice(0, start);
  const partial = start === end ? /(?<![\p{L}\p{N}_@])@[\p{L}\p{N}_]*$/u.exec(prefix) : null;
  const before = partial ? prefix.slice(0, partial.index) : prefix;
  const separator = before && !/\s$/u.test(before) ? " " : "";
  const inserted = `${separator}@${selected} `;
  const nextBody = before + inserted + body.slice(body[end] === " " ? end + 1 : end);
  if (nextBody.length > 12_000) return null;
  const at = before.length + inserted.length;
  const nextBindings = person && !known ? [...bindings, { id: person.id, handle: selected }] : bindings;
  return { body: nextBody, bindings: activeTutorMentions(nextBody, nextBindings), selection: { start: at, end: at } };
}
