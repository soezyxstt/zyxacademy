"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasPeran } from "@/lib/auth/authorization";
import {
  queryTutorActivityDetail,
  queryTutorActivityFilterOptions,
  queryTutorActivityLogs,
  queryTutorActivityStats,
  type CourseOption,
  type TutorActivityCursor,
  type TutorActivityFilterInput,
  type TutorActivityFilterOptions,
  type TutorActivityItem,
  type TutorActivityOutcomeFilter,
  type TutorActivityQueryResult,
  type TutorActivityStats,
  type TutorOption,
} from "./dal";

export type {
  CourseOption,
  TutorActivityCursor,
  TutorActivityFilterInput,
  TutorActivityFilterOptions,
  TutorActivityItem,
  TutorActivityOutcomeFilter,
  TutorActivityQueryResult,
  TutorActivityStats,
  TutorOption,
};

async function requireAdmin() {
  let sessionHeaders: Headers | undefined;
  try {
    sessionHeaders = await headers();
  } catch {
    sessionHeaders = undefined;
  }

  const session = await auth.api.getSession({
    headers: sessionHeaders ?? new Headers(),
  });

  if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
    throw new Error("UNAUTHORIZED");
  }
  return session.user;
}

export async function getTutorActivityLogsAction(
  input: TutorActivityFilterInput,
): Promise<TutorActivityQueryResult> {
  await requireAdmin();
  return queryTutorActivityLogs(input);
}

export async function getTutorActivityStatsAction(): Promise<TutorActivityStats> {
  await requireAdmin();
  return queryTutorActivityStats();
}

export async function getTutorActivityFilterOptionsAction(): Promise<TutorActivityFilterOptions> {
  await requireAdmin();
  return queryTutorActivityFilterOptions();
}

export async function getTutorActivityDetailAction(
  id: string,
): Promise<TutorActivityItem | null> {
  await requireAdmin();
  if (typeof id !== "string" || id.trim().length === 0) {
    return null;
  }
  return queryTutorActivityDetail(id.trim());
}
