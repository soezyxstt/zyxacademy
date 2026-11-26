import { handleAcademicRead } from "@/lib/native/academic/handle-read";
import { academicReadServices } from "@/lib/native/academic/read-services";

export async function GET(_request: Request, context: { params: Promise<{ resource: string[] }> }) {
  return handleAcademicRead((await context.params).resource, academicReadServices);
}
