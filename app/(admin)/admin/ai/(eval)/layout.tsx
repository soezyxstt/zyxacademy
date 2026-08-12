import type { ReactNode } from "react";

export default function EvalLayout({ children }: { children: ReactNode }) {
  return <div className="w-full">{children}</div>;
}
