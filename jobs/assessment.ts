import { inngest } from "./client";

export const assessmentIngestWorker = inngest.createFunction(
  {
    id: "assessment-ingest-worker",
    name: "Assessment Ingest Worker",
    triggers: [{ event: "assessment.ingest" }],
  },
  async ({ event, step }) => {
    const { sourceId } = event.data as { sourceId: string };

    await step.run("extract-assessment-objects", async () => {
      const { extractAssessmentObjectsForSource } = await import("@/lib/assessment-extractor");
      await extractAssessmentObjectsForSource(sourceId);
    });

    return { sourceId };
  }
);
