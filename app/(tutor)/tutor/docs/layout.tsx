import type { ReactNode } from "react";
import { ApplicationPage } from "@/components/application-page";
import { DocsShell } from "@/components/docs/docs-shell";

export default function TutorDocsLayout({ children }: { children: ReactNode }) {
  return (
    <ApplicationPage>
      <DocsShell surface="tutor">{children}</DocsShell>
    </ApplicationPage>
  );
}
