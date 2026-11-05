"use client";

import type { ReactNode } from "react";
import { useSession } from "@/lib/auth-client";
import { useStudentExperience } from "@/components/student-experience-provider";

export type StudentAccountState = {
  data: { user: { id: string; name: string; email: string; image?: string | null; role?: string | null; roles?: string[] | null } } | null;
  isPending: boolean;
};
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
  return children(session);
}
