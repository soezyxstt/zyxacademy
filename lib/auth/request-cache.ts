import "server-only";
import { cache } from "react";
import {
  getPeranCodes as readPeranCodes,
  hasAnyPeranFromCodes,
  hasPeranFromCodes,
  type AuthorizationOptions,
} from "@/lib/auth/authorization";
import {
  listTutorAccessibleCourses as readTutorAccessibleCourses,
  resolveTutorCourseAccess as readTutorCourseAccess,
  type DbExecutor,
  type TutorCourseAccessInput,
  type TutorCourseAccessOptions,
} from "@/lib/auth/tutor-access";
import type { PeranCode } from "@/lib/auth/peran";

// React scopes these caches to a render. Primitive keys share work between
// independently constructed inputs without sharing it across requests.
export const getPeranCodes = cache(readPeranCodes);

export async function hasPeran(
  penggunaId: string,
  required: PeranCode,
  options: AuthorizationOptions = {},
): Promise<boolean> {
  return hasPeranFromCodes(await getPeranCodes(penggunaId), required, options);
}

export async function hasAnyPeran(
  penggunaId: string,
  required: readonly PeranCode[],
  options: AuthorizationOptions = {},
): Promise<boolean> {
  return hasAnyPeranFromCodes(await getPeranCodes(penggunaId), required, options);
}

const cachedTutorCourseAccess = cache((penggunaId: string, courseId: string, allowAdmin: boolean) =>
  readTutorCourseAccess({ penggunaId, courseId, allowAdmin }, undefined, getPeranCodes),
);

export function resolveTutorCourseAccess(input: TutorCourseAccessInput, executor?: DbExecutor) {
  if (executor) return readTutorCourseAccess(input, executor);
  return cachedTutorCourseAccess(input.penggunaId, input.courseId, input.allowAdmin === true);
}

export function checkTutorCourseAccess(
  penggunaId: string,
  courseId: string,
  options?: TutorCourseAccessOptions,
  executor?: DbExecutor,
) {
  return resolveTutorCourseAccess({ penggunaId, courseId, allowAdmin: options?.allowAdmin }, executor);
}

export async function requireTutorCourseAccess(
  penggunaId: string,
  courseId: string,
  options?: TutorCourseAccessOptions,
  executor?: DbExecutor,
) {
  const result = await checkTutorCourseAccess(penggunaId, courseId, options, executor);
  if (!result.hasAccess) {
    throw new Error(`TUTOR_ACCESS_DENIED: ${result.reason ?? "FORBIDDEN"}`);
  }
  return result;
}

const cachedTutorAccessibleCourses = cache((penggunaId: string, allowAdmin: boolean) =>
  readTutorAccessibleCourses(penggunaId, { allowAdmin }, undefined, getPeranCodes),
);

export function listTutorAccessibleCourses(
  penggunaId: string,
  options?: TutorCourseAccessOptions,
  executor?: DbExecutor,
) {
  if (executor) return readTutorAccessibleCourses(penggunaId, options, executor);
  return cachedTutorAccessibleCourses(penggunaId, options?.allowAdmin === true);
}
