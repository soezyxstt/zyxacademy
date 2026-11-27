import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { customForms, googleMeetSessions } from "@/db/schema";
import { publicMeetingUrl } from "@/packages/meet/public-destination";

async function findPublicForm(identifier: string, by: "id" | "slug") {
  const match = by === "id" ? eq(customForms.id, identifier) : eq(customForms.slug, identifier.toLowerCase());
  const [form] = await db.select({
    id: customForms.id,
    slug: customForms.slug,
    title: customForms.title,
    description: customForms.description,
    category: customForms.category,
    questions: customForms.questions,
    settings: customForms.settings,
  }).from(customForms).where(and(isNull(customForms.deletedAt), match)).limit(1);
  return form;
}

export async function findFullFormEntry(identifier: string) {
  return (await findPublicForm(identifier, "id")) ?? await findPublicForm(identifier, "slug");
}

/** Exact form slugs, including closed forms, take precedence over meetings and ID aliases. */
export async function findShortFormEntry(identifier: string) {
  const exactForm = await findPublicForm(identifier, "slug");
  if (exactForm) return { kind: "form", form: exactForm } as const;

  const [meeting] = await db.select({
    title: googleMeetSessions.title,
    meetingUri: googleMeetSessions.meetingUri,
  }).from(googleMeetSessions).where(and(
    eq(googleMeetSessions.slug, identifier.toLowerCase()), isNull(googleMeetSessions.deletedAt),
  )).limit(1);
  const meetingUri = publicMeetingUrl(meeting?.meetingUri);
  if (meeting && meetingUri) return { kind: "meeting", title: meeting.title, meetingUri } as const;

  const alias = await findPublicForm(identifier, "id");
  return alias ? { kind: "form", form: alias } as const : null;
}
