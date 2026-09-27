import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { requireTutorCourseAccess } from "@/lib/auth/tutor-access";
import { pageTitle } from "@/lib/site";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { FileText } from "lucide-react";
import { db } from "@/db";
import { aiMaterialInstances, aiMaterialInstanceSections, aiMaterialInstanceChunks } from "@/db/schema";
import { eq, inArray, desc } from "drizzle-orm";
import { MaterialsClient } from "./materials-client";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";

type Props = { params: Promise<{ courseId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId } = await params;
  return {
    title: pageTitle("Dokumen & Modul"),
    description: `Kelola modul dan materi pengajaran mata kuliah ${courseId}.`,
  };
}

export default async function TutorMaterialsPage({ params }: Props) {
  const { courseId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/tutor");

  try {
    await requireTutorCourseAccess(session.user.id, courseId, { allowAdmin: true });
  } catch {
    redirect("/tutor");
  }

  const identity = await resolveCourseIdentity(courseId);
  if (!identity) notFound();

  const courseIds = identity.allIds;

  const rawMaterials = await db
    .select()
    .from(aiMaterialInstances)
    .where(inArray(aiMaterialInstances.courseId, courseIds))
    .orderBy(desc(aiMaterialInstances.createdAt));

  const materialIds = rawMaterials.map((m) => m.id);

  const sections = materialIds.length > 0
    ? await db
        .select()
        .from(aiMaterialInstanceSections)
        .where(inArray(aiMaterialInstanceSections.materialInstanceId, materialIds))
    : [];

  const sectionIds = sections.map((s) => s.id);

  const chunks = sectionIds.length > 0
    ? await db
        .select()
        .from(aiMaterialInstanceChunks)
        .where(inArray(aiMaterialInstanceChunks.sectionId, sectionIds))
    : [];

  const chunksBySection = new Map<string, typeof chunks>();
  for (const c of chunks) {
    const list = chunksBySection.get(c.sectionId) || [];
    list.push(c);
    chunksBySection.set(c.sectionId, list);
  }

  const sectionsByMaterial = new Map<string, Array<{ title: string | null; orderIndex: number; chunks: Array<{ chunkText: string; orderIndex: number }> }>>();
  for (const s of sections) {
    const list = sectionsByMaterial.get(s.materialInstanceId) || [];
    list.push({
      title: s.title,
      orderIndex: s.orderIndex,
      chunks: (chunksBySection.get(s.id) || []).map((ch) => ({
        chunkText: ch.chunkText,
        orderIndex: ch.orderIndex,
      })),
    });
    sectionsByMaterial.set(s.materialInstanceId, list);
  }

  const materials = rawMaterials.map((m) => ({
    id: m.id,
    courseId: m.courseId,
    title: m.title,
    summary: m.summary,
    createdAt: m.createdAt,
    sections: sectionsByMaterial.get(m.id) || [],
  }));

  return (
    <ApplicationPage spacing="space-y-6">
      <PageHeader
        title={`Dokumen: ${identity.title}`}
        icon={FileText}
        backHref={`/tutor/${courseId}`}
        backLabel="Kembali ke Ringkasan Kelas"
      />
      <MaterialsClient courseId={identity.primaryId} initialMaterials={materials} />
    </ApplicationPage>
  );
}
