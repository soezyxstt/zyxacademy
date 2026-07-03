import type { Metadata } from "next";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { requirePkaSession } from "@/lib/pka-enrollment";
import CourseMaterialDetailPage, {
  generateMetadata as generateCourseMaterialDetailMetadata,
} from "@/app/(student)/courses/[id]/material/[materialId]/page";

/** Thin wrapper: the PKA course reuses the generic material detail viewer. */

type Props = { params: Promise<{ materialId: string }> };

function withCourseId({ params }: Props) {
  return {
    params: params.then(({ materialId }) => ({ id: PKA_COURSE_ID, materialId })),
  };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  return generateCourseMaterialDetailMetadata(withCourseId(props));
}

export default async function PkaMaterialDetailPage(props: Props) {
  const { materialId } = await props.params;
  await requirePkaSession(`/courses/tutorial-pka/material/${materialId}`);
  return CourseMaterialDetailPage(withCourseId(props));
}
