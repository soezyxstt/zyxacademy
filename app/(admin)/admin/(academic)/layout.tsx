import type { ReactNode } from "react";

export default function AcademicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      {children}
    </div>
  );
}
