"use server";

import { LEGACY_AUTHORING_RETIRED_MESSAGE } from "@/lib/admin/legacy-authoring-retirement";
import { assertTutorOrAdmin } from "@/lib/uploadthing-admin";

export interface CreateDiktatDraftActionResult {
  success: boolean;
  error?: string;
  diktatId?: string;
  url?: string;
  warning?: string;
}

export interface CompileDiktatActionResult {
  success: boolean;
  error?: string;
  url?: string;
}

export interface DeleteDiktatActionResult {
  success: boolean;
  error?: string;
}

export async function createDiktatDraftAction(
  _courseId: string,
  _chapterIds: string[],
): Promise<CreateDiktatDraftActionResult> {
  await assertTutorOrAdmin();
  return { success: false, error: LEGACY_AUTHORING_RETIRED_MESSAGE };
}

export async function compileDiktatAction(
  _diktatId: string,
): Promise<CompileDiktatActionResult> {
  await assertTutorOrAdmin();
  return { success: false, error: LEGACY_AUTHORING_RETIRED_MESSAGE };
}

export async function deleteDiktatAction(
  _diktatId: string,
): Promise<DeleteDiktatActionResult> {
  await assertTutorOrAdmin();
  return { success: false, error: LEGACY_AUTHORING_RETIRED_MESSAGE };
}
