import { z } from "zod";
import { getAuthSession } from "@/lib/auth-session";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { handleAdminCommand } from "@/lib/native/academic/administration/admin-command-handler";
import { administrationReadServices } from "@/lib/native/academic/administration/read-services";
import { courseCommandReply } from "@/lib/native/academic/course-command";
import { pendingBookingMeets, provisionBookingMeet } from "@/lib/schedule/booking-meet";
import { validTutorialTargetId } from "@/packages/academic/admin-tutorial-operations";

const command = z.strictObject({ bookingId: z.string().refine(validTutorialTargetId) });

export async function GET(request: Request) {
  const viewer = await getAuthSession();
  if (!viewer) return courseCommandReply(401, { error: "UNAUTHENTICATED" });
  const after = new URL(request.url).searchParams.get("after");
  if (after !== null && !validTutorialTargetId(after)) return courseCommandReply(400, { error: "INVALID_INPUT" });
  try {
    return courseCommandReply(200, await pendingBookingMeets(viewer, after));
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "UNAUTHENTICATED" || code === "FORBIDDEN") return courseCommandReply(code === "FORBIDDEN" ? 403 : 401, { error: code });
    return courseCommandReply(500, { error: "READ_FAILED" });
  }
}

export function POST(request: Request) {
  return handleAdminCommand(request, new URL(resolveAuthBaseUrl()).origin, {
    session: getAuthSession, hasAdmin: administrationReadServices.hasAdmin,
  }, command, async ({ bookingId }, _key, viewer) => {
    const { status } = await provisionBookingMeet(bookingId, viewer);
    if (status !== "ready") throw new Error(status === "skipped" ? "BOOKING_CHANGED" : status === "rejected" ? "MEET_REJECTED" : "MEET_UNCERTAIN");
    return { id: bookingId };
  }, { BOOKING_CHANGED: 409, MEET_REJECTED: 422, MEET_UNCERTAIN: 409 });
}
