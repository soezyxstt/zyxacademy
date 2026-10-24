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
import { inArray, desc, asc } from "drizzle-orm";
import { MaterialsClient } from "./materials-client";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";

type Props = { params: Promise<{ courseId: string }> };

/**
 * Generates page metadata for the tutor course materials page.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { courseId } = await params;
  const t = await getTranslations("tutor.routeTitles");
  return {
    title: pageTitle(t("documents")),
    description: t("materialsDescription", { courseId }),
  };
}

/**
 * Tutor course materials management page rendering document list and editor.
 */
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
        .orderBy(asc(aiMaterialInstanceSections.orderIndex))
    : [];

  const sectionIds = sections.map((s) => s.id);

  const chunks = sectionIds.length > 0
    ? await db
        .select()
        .from(aiMaterialInstanceChunks)
        .where(inArray(aiMaterialInstanceChunks.sectionId, sectionIds))
        .orderBy(asc(aiMaterialInstanceChunks.orderIndex))
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
        title={<><TranslatedText namespace="tutor" messageKey="routeTitles.documents" />: {identity.title}</>}
        icon={FileText}
        backHref={`/tutor/${courseId}`}
        backLabel={<TranslatedText namespace="tutor" messageKey="routeTitles.backToCourse" />}
      />
      <MaterialsClient courseId={identity.legacyId || identity.primaryId} initialMaterials={materials} />
    </ApplicationPage>
  );
}
