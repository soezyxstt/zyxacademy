import type { Metadata } from "next";
import { DemoDashboard } from "@/components/demo/demo-dashboard";
import { DemoEmptyState } from "@/components/demo/demo-empty-state";
import { demoCoursePath, DemoShell } from "@/components/demo/demo-shell";
import { getDemoContent } from "./demo-data";

import { createMetadata } from "@/lib/site";

export const metadata: Metadata = createMetadata({
  title: "Demo Belajar",
  description: "Jelajahi alur belajar Zyx Academy sebelum membuat akun.",
  path: "/demo",
  noIndex: true,
});


export const dynamic = "force-dynamic";

export default async function DemoPage() {
  const content = await getDemoContent();
  if (!content) return <DemoEmptyState />;

  return (
    <DemoShell course={content.course} activeView="dashboard">
      <DemoDashboard nextPath={demoCoursePath(content.course.id)} />
    </DemoShell>
  );
}
