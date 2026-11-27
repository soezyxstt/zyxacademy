"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { loadConceptPopover, type ConceptPopoverData } from "@/lib/student/learning-concept-popover";

export type { ConceptPopoverData } from "@/lib/student/learning-concept-popover";

/** The concept popover uses deterministic course content. Zyra is a separate action. */
export async function getConceptPopover(courseId: string, conceptName: string): Promise<ConceptPopoverData | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return loadConceptPopover(session.user.id, courseId, conceptName);
}
