import { inngest } from "./client";
import { processSourceFigure, failSourceFigure } from "@/lib/authoring/source-figures";

export const sourceFigureWorker = inngest.createFunction({
  id: "source-figure-extraction", triggers: [{ event: "source.figure.requested" }], retries: 2, concurrency: { limit: 2 },
  onFailure: async ({ event }) => { await failSourceFigure(event.data.event.data); },
}, async ({ event, step }) => step.run("extract-figure", () => processSourceFigure(event.data)));
