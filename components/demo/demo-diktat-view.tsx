"use client";
import { useDemoSession } from "./demo-session";
import { MaterialViewer } from "@/components/course/material-viewer";
import type { DemoDiktatSection } from "@/app/(marketing)/demo/demo-data";
import { useStudentExperience } from "@/components/student-experience-provider";

export function DemoDiktatView({ id, course, chapterId, title, sections }: { id: string; chapterId: string; course: { id: string; title: string }; title: string; sections: DemoDiktatSection[] }) {
  const experience = useStudentExperience();
  const { overlay } = useDemoSession();
  const materialId = `demo-diktat-${id}`.slice(0,128);
  const material = { id: materialId, courseId: course.id, chapterId, title, kind: "article" as const, docCategory: "diktat" as const, body: `# ${title.replace(/\r?\n/g, " ")}\n\n${sections.map((section) => `## ${section.title}\n\n${section.content}`).join("\n\n")}`, completed: overlay.events.some(event => event.kind === "article" && event.id === materialId) };
  return <MaterialViewer key={id} material={material} course={course} backHref={experience.href?.(`/courses/${course.id}/material`)} canDownload={false} chapterId={chapterId} ragEnabled accessTier="standard" />;
}
