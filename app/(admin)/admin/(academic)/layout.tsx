import type { ReactNode } from "react";

export default function AcademicLayout({ children }: { children: ReactNode }) {
  return <div className="w-full">{children}</div>;
}
