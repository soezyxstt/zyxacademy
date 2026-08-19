import { notFound } from "next/navigation";
import { db } from "@/db";
import { aiMaterialInstances, courses } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { verifyTutorAccess } from "@/app/actions/tutor-management";
import { MaterialsClient } from "./materials-client";
import { Reveal } from "@/components/ui/reveal";
import { pageTitle } from "@/lib/site";

type Props = { params: Promise<{ courseId: string }> };

export async function generateMetadata({ params }: Props) {
  const { courseId } = await params;
  const [c] = await db.select({ title: courses.title }).from(courses).where(eq(courses.id, courseId)).limit(1);
  return {
    title: pageTitle(c ? `Kelola Materi: ${c.title}` : "Kelola Materi"),
    description: c
      ? `Atur dan kelola materi pembelajaran untuk ${c.title}.`
      : "Atur dan kelola materi pembelajaran untuk kelas.",
  };
}

export default async function TutorMaterialsPage({ params }: Props) {
  const { courseId } = await params;

  // Verify access
  await verifyTutorAccess(courseId);

  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);

  if (!course) notFound();

  // Load all material instances for this course
  const materialsList = await db.query.aiMaterialInstances.findMany({
    where: eq(aiMaterialInstances.courseId, courseId),
    orderBy: [desc(aiMaterialInstances.createdAt)],
    with: {
      sections: {
        orderBy: (s, { asc }) => [asc(s.orderIndex)],
        with: {
          chunks: {
            orderBy: (c, { asc }) => [asc(c.orderIndex)],
          },
        },
      },
    },
  });

  return (
    <div className="px-6 py-8 max-w-5xl space-y-8 font-sans">
      <Reveal>
        <div className="flex flex-col gap-1">
          <h1 className="text-h5 font-heading font-bold text-foreground">
            Kelola Materi Belajar
          </h1>
          <p className="text-body-sm text-muted-foreground">
            {course.title} · Tambah, edit, dan hapus modul serta dokumen belajar siswa.
          </p>
        </div>
      </Reveal>

      <Reveal>
        <MaterialsClient courseId={courseId} initialMaterials={materialsList} />
      </Reveal>
    </div>
  );
}
