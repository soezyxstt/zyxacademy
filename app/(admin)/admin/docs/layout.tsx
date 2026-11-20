import type { ReactNode } from "react";
import { DocsShell } from "@/components/docs/docs-shell";

export default function AdminDocsLayout({ children }: { children: ReactNode }) {
  return <DocsShell surface="admin">{children}</DocsShell>;
}
