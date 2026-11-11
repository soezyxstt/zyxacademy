import "server-only";
import { getAuthSession } from "@/lib/auth-session";
import { requireTutorCourseAccess } from "@/lib/auth/request-cache";

// RSC counterpart to the action guard, using the same session and override policy.
export async function verifyTutorAccess(courseId: string, options?: { allowAdmin?: boolean }) {
  const session = await getAuthSession();
  if (!session?.user) {
    throw new Error("Unauthorized: Silakan masuk terlebih dahulu.");
  }

  const role = (session.user as { role?: string | null }).role;
  const allowAdmin = options?.allowAdmin ?? (role === "admin");
  const access = await requireTutorCourseAccess(session.user.id, courseId, { allowAdmin });
  return { session, role, user: session.user, access };
}
