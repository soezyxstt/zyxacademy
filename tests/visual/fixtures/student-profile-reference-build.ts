import { buildFixture } from "./interactive-document-build";

export function buildStudentProfileReference(locale: "id" | "en") {
  return buildFixture("tests/visual/fixtures/student-profile-reference.tsx", "", {
    "@/components/providers/locale-provider": `export const useAppLocale=()=>({locale:${JSON.stringify(locale)}});`,
    "@/app/(student)/profile/actions": `export async function updateStudentProfileAction(){throw new Error('Server saves are outside this profile reference');}`,
  });
}
