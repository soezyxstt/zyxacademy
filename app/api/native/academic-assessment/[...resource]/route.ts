import { handleAssessmentRead } from "@/lib/native/academic/assessment/handle-read";
import { assessmentReadServices } from "@/lib/native/academic/assessment/read-services";

export async function GET(_request: Request, { params }: { params: Promise<{ resource: string[] }> }) {
  return handleAssessmentRead((await params).resource, assessmentReadServices);
}
