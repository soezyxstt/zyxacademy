import { inngest } from "@/lib/inngest";

/**
 * Dispatches an event to trigger vector synchronization in the background.
 * Uses retry with exponential backoff so transient dispatch failures are recovered,
 * and catches final errors safely so database transactions/actions aren't broken if Inngest is unreachable.
 */
export async function dispatchVectorSync(courseId?: string, retries = 3): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await inngest.send({
        name: "vector.sync.dispatch",
        data: { courseId: courseId ?? "" },
      });
      return;
    } catch (error) {
      if (attempt === retries) {
        console.error(`Failed to dispatch vector.sync.dispatch event after ${retries} attempts:`, error);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 150 * 2 ** (attempt - 1)));
      }
    }
  }
}
