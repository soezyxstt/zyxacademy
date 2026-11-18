"use client";

import type { ReactNode } from "react";
import { useSession } from "@/lib/auth-client";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useSyncQueryAccount } from "@/hooks/use-query-account";

export type StudentAccountState = {
  data: { user: { id: string; name: string; email: string; image?: string | null; role?: string | null; roles?: string[] | null } } | null;
  isPending: boolean;
};
/** UI gate only; server actions independently enforce canonical student access. */
export function isStudentSocialAccount(state: StudentAccountState): boolean {
  const user = state.data?.user;
  if (!user) return false;
  if (user.roles?.length) return user.roles.includes("murid") && !user.roles.some(role => role === "admin" || role === "tutor");
  return user.role === "student" || user.role === "murid";
}
type Props = { children: (state: StudentAccountState) => ReactNode };

export function StudentAccountBoundary({ children }: Props) {
  const experience = useStudentExperience();
  if (experience.mode === "demo") {
    return children({ data: { user: { id: "fictional-demo-student", name: experience.account?.name ?? "Pelajar Demo", email: experience.account?.email ?? "pelajar@example.test", role: "murid" } }, isPending: false });
  }
  return <LiveAccountBoundary>{children}</LiveAccountBoundary>;
}

function LiveAccountBoundary({ children }: Props) {
  const session = useSession();
  useSyncQueryAccount(session.data?.user.id, session.isPending);
  return children(session);
}
