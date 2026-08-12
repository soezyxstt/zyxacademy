import type { ReactNode } from "react";

export default function EvalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      {children}
    </div>
  );
}
