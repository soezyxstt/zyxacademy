import { inngest } from "@/lib/inngest";

/**
 * Dispatches an event to trigger vector synchronization in the background.
 * Uses a safe try/catch so database transactions/actions aren't broken if Inngest is unreachable.
 */
export async function dispatchVectorSync(courseId?: string): Promise<void> {
  try {
    await inngest.send({
      name: "vector.sync.dispatch",
      data: { courseId: courseId ?? "" },
    });
  } catch (error) {
    console.error("Failed to dispatch vector.sync.dispatch event:", error);
  }
}
