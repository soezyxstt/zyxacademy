import type { ReactNode } from "react";
import { DocsSidebar } from "./docs-sidebar";

export default function AdminDocsLayout({ children }: { children: ReactNode }) {
  return <DocsSidebar>{children}</DocsSidebar>;
}
