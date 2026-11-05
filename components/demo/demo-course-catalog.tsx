import type { DemoSummary } from "./demo-shell";
import { StudentCourseCatalogView } from "@/components/course/student-course-catalog-view";
import type { CourseGroup } from "@/app/(student)/courses/course-catalog-client";

export function DemoCourseCatalog({ experiences, whatsappHref = null }: { experiences: DemoSummary[]; whatsappHref?: string | null }) {
  const groups = new Map<string, CourseGroup>();
  for (const { content: { course }, snapshot } of experiences) {
    const group = groups.get(course.category) ?? { jurusan: course.category, isStudentMajor: course.category === "TPB", courses: [] };
    group.courses.push({ id: course.id, title: course.title, category: course.category, description: course.description ?? "", materialsCount: snapshot.course.totalMaterials, quizzesCount: snapshot.availableAssessments.filter(item => item.type === "quiz").length, tryoutsCount: 1 });
    groups.set(course.category, group);
  }
  return <StudentCourseCatalogView groups={[...groups.values()].sort((a,b) => Number(b.isStudentMajor) - Number(a.isStudentMajor) || a.jurusan.localeCompare(b.jurusan))} studentTargetCategory="TPB" whatsappHref={whatsappHref} />;
}
