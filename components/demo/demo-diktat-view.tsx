"use client";
import { MaterialViewer } from "@/components/course/material-viewer";
import type { DemoDiktatSection } from "@/app/(marketing)/demo/demo-data";
import { useStudentExperience } from "@/components/student-experience-provider";

export function DemoDiktatView({ title, sections }: { title: string; sections: DemoDiktatSection[]; nextPath: string }) {
  const experience = useStudentExperience();
  const material = { id: "demo-diktat", courseId: "demo-course", title, kind: "article" as const, docCategory: "diktat" as const, body: `# ${title.replace(/\r?\n/g, " ")}\n\n${sections.map((section) => `## ${section.title}\n\n${section.content}`).join("\n\n")}`, completed: false };
  return <div className="h-[70vh]"><MaterialViewer material={material} mode="admin-preview" backHref={experience.route("courses")} canDownload={false} /></div>;
}
