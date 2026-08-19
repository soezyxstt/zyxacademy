import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { bab, mataKuliah } from "@/db/schema";

export type AuthoringChapterOption = {
  id: string;
  code: string;
  title: string;
  orderIndex: number;
};

export type AuthoringCourseOption = {
  id: string;
  code: string;
  title: string;
  chapters: AuthoringChapterOption[];
};

export async function listAuthoringCourseOptions(): Promise<AuthoringCourseOption[]> {
  const [courses, chapters] = await Promise.all([
    db
      .select({ id: mataKuliah.id, code: mataKuliah.code, title: mataKuliah.title })
      .from(mataKuliah)
      .where(eq(mataKuliah.status, "active"))
      .orderBy(asc(mataKuliah.title)),
    db
      .select({ id: bab.id, courseId: bab.mataKuliahId, code: bab.code, title: bab.title, orderIndex: bab.orderIndex })
      .from(bab)
      .where(eq(bab.status, "active"))
      .orderBy(asc(bab.orderIndex)),
  ]);
  return courses.map((course) => ({
    ...course,
    chapters: chapters
      .filter((chapter) => chapter.courseId === course.id)
      .map(({ courseId: _courseId, ...chapter }) => chapter),
  }));
}

export async function getAuthoringCourseOption(courseId: string): Promise<AuthoringCourseOption | null> {
  const courses = await listAuthoringCourseOptions();
  return courses.find((course) => course.id === courseId) ?? null;
}
