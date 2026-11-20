import { updateMaterialProgress } from "@/app/(student)/dashboard/actions";
import { ApiResponseError } from "@/lib/query/http";
import { materialStatusResultSchema } from "./client-contracts";

export async function setMaterialStatus(studentId: string, materialId: string, status: "in_progress" | "completed") {
  const result = await updateMaterialProgress(materialId, status, studentId);
  const parsed = materialStatusResultSchema.safeParse(result);
  if (!parsed.success) throw new ApiResponseError("The server returned an invalid material status", { cause: parsed.error });
  return parsed.data;
}
