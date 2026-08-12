import type { ReactNode } from "react";

export default function ContentLayout({ children }: { children: ReactNode }) {
  return <div className="flex w-full flex-col">{children}</div>;
}
