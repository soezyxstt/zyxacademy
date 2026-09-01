"use server";

import { LEGACY_AUTHORING_RETIRED_MESSAGE } from "@/lib/admin/legacy-authoring-retirement";
import { assertTutorOrAdmin } from "@/lib/uploadthing-admin";

export async function createDiktatDraftAction(
  _courseId: string,
  _chapterIds: string[],
) {
  await assertTutorOrAdmin();
  return { success: false, error: LEGACY_AUTHORING_RETIRED_MESSAGE };
}

export async function compileDiktatAction(_diktatId: string) {
  await assertTutorOrAdmin();
  return { success: false, error: LEGACY_AUTHORING_RETIRED_MESSAGE };
}

export async function deleteDiktatAction(_diktatId: string) {
  await assertTutorOrAdmin();
  return { success: false, error: LEGACY_AUTHORING_RETIRED_MESSAGE };
}
