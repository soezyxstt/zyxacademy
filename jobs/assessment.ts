import { inngest } from "./client";

export const assessmentIngestWorker = inngest.createFunction(
  {
    id: "assessment-ingest-worker",
    name: "Assessment Ingest Worker",
    triggers: [{ event: "assessment.ingest" }],
  },
  async ({ event, step }) => {
    const { sourceId } = event.data as { sourceId: string };

    const result = await step.run("extract-assessment-objects", async () => {
      const { extractAssessmentObjectsForSource } = await import("@/lib/assessment-extractor");
      const extraction = await extractAssessmentObjectsForSource(sourceId);
      return { status: extraction.status, objectIds: extraction.objects.map(object => object.id), createdConcepts: extraction.createdConcepts };
    });

    if (result.status === "failed") throw new Error(`ASSESSMENT_EXTRACTION_FAILED:${sourceId}`);
    return { sourceId, ...result };
  }
);
