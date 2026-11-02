import type { Metadata } from "next";
import { PKA_COURSE_ID } from "@/lib/pka-config";
import { requirePkaSession } from "@/lib/pka-enrollment";
import CourseMaterialListPage, {
  generateMetadata as generateCourseMaterialMetadata,
} from "@/app/(student)/courses/[id]/material/page";

/** Thin wrapper: the PKA course reuses the generic course material tab. */

const pkaParams = { params: Promise.resolve({ id: PKA_COURSE_ID }) };

export async function generateMetadata(): Promise<Metadata> {
  return generateCourseMaterialMetadata(pkaParams);
}

type PkaProps = {
  searchParams?: Promise<{ tab?: string }>;
};

export default async function PkaMaterialPage(props: PkaProps) {
  await requirePkaSession("/courses/tutorial-pka/material");
  return CourseMaterialListPage({ ...pkaParams, searchParams: props.searchParams });
}
