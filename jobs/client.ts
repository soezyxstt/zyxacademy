import { enqueueTask } from "@/lib/queue/cloud-tasks";

export interface QueueEventPayload {
  name: string;
  data?: object;
  id?: string;
  ts?: number;
  user?: unknown;
  v?: string;
}

export interface QueueSendOptions {
  env?: string;
}

export interface QueueFunctionHandle<TDefinition = unknown, THandler = unknown> {
  id: string;
  definition: TDefinition;
  handler: THandler;
}

/**
 * Framework-neutral queue client for Zyx Academy background execution.
 * Routes all background events through the Cloud Tasks queue adapter.
 */
class QueueClient {
  readonly id: string;

  constructor(options: { id: string }) {
    this.id = options.id;
  }

  async send(
    payload: QueueEventPayload | QueueEventPayload[],
    options?: QueueSendOptions,
  ): Promise<{ ids: string[] }> {
    if (options?.env && options.env !== process.env.INNGEST_ENV) {
      throw new Error("QUEUE_ENVIRONMENT_MISMATCH");
    }
    const events = Array.isArray(payload) ? payload : [payload];
    const ids: string[] = [];
    for (const event of events) {
      ids.push(
        await enqueueTask({
          name: event.name,
          data: (event.data ?? {}) as Record<string, unknown>,
          id: event.id,
          delaySeconds: event.ts ? Math.max(0, (event.ts - Date.now()) / 1000) : 0,
        }),
      );
    }
    return { ids };
  }

  createFunction<TDefinition extends { id: string }, THandler>(
    definition: TDefinition,
    handler: THandler,
  ): QueueFunctionHandle<TDefinition, THandler> {
    return { id: definition.id, definition, handler };
  }
}

export const queueClient = new QueueClient({ id: "zyx-academy" });

/**
 * Compatibility export name for existing background event producers.
 */
export const inngest = queueClient;
