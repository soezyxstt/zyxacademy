import { z } from "zod";
import { CanvasSpecSchema, type CanvasSpec } from "./contracts";

const TutorMessageSourceSchema = z.object({
  type: z.string().min(1).max(80),
  id: z.string().min(1).max(240),
  label: z.string().min(1).max(400),
  href: z.string().min(1).max(800),
}).strict();

const TutorMessageSourcesEnvelopeSchema = z.object({
  version: z.literal("zyra-chat-sources-v2"),
  sources: z.array(TutorMessageSourceSchema).max(64),
  canvasSpec: CanvasSpecSchema,
}).strict();

export type TutorMessageSource = z.infer<typeof TutorMessageSourceSchema>;

export interface DecodedTutorMessageSources {
  sources: TutorMessageSource[];
  canvasSpec?: CanvasSpec;
}

/**
 * Keeps the old array format for ordinary messages. A typed envelope is used
 * only when a validated canvas needs to travel with the persisted message.
 */
export function serializeTutorMessageSources(
  sources: unknown,
  canvasSpec?: unknown,
): unknown {
  if (canvasSpec === undefined || canvasSpec === null) return sources ?? null;

  const parsedCanvas = CanvasSpecSchema.safeParse(canvasSpec);
  if (!parsedCanvas.success) return sources ?? null;

  const parsedSources = z.array(TutorMessageSourceSchema).max(64).safeParse(sources ?? []);
  return {
    version: "zyra-chat-sources-v2" as const,
    sources: parsedSources.success ? parsedSources.data : [],
    canvasSpec: parsedCanvas.data,
  };
}

export function deserializeTutorMessageSources(value: unknown): DecodedTutorMessageSources {
  if (Array.isArray(value)) {
    const parsedSources = z.array(TutorMessageSourceSchema).max(64).safeParse(value);
    return { sources: parsedSources.success ? parsedSources.data : [] };
  }

  const parsedEnvelope = TutorMessageSourcesEnvelopeSchema.safeParse(value);
  if (!parsedEnvelope.success) return { sources: [] };

  return {
    sources: parsedEnvelope.data.sources,
    canvasSpec: parsedEnvelope.data.canvasSpec,
  };
}
