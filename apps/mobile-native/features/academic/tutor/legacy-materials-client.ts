import { tutorLegacyMaterialCommand, tutorLegacyMaterialDraft, tutorLegacyMaterialsPath,
  type TutorLegacyMaterialCommand } from "../../../../../packages/academic/tutor-legacy-materials";
import type { TutorSupportClient } from "../../../../../packages/academic/tutor-support";
import { TutorDataError } from "../../../../../packages/native-parity/academic/tutor/model";
import type { AcademicTransport } from "../client";
import { createCourseCommandTarget } from "../courses/write-client";

export function createTutorLegacyMaterials(transport: AcademicTransport): TutorSupportClient["legacyMaterials"] {
  if (!transport.command) return undefined;
  const target = createCourseCommandTarget<TutorLegacyMaterialCommand>(transport.command.bind(transport),
    command => tutorLegacyMaterialCommand.safeParse(command).success, "");
  return {
    async read(courseId, legacyCourseId, materialId, signal) {
      const path = tutorLegacyMaterialsPath(courseId) + "?" + new URLSearchParams({ materialId });
      const response = await transport.get(path, signal);
      if (!response.ok) throw new TutorDataError(response.status);
      const material = tutorLegacyMaterialDraft.safeParse(await response.json());
      if (!material.success || material.data.id !== materialId || material.data.courseId !== legacyCourseId) throw new TutorDataError(502);
      return material.data;
    },
    target(courseId) { return target(tutorLegacyMaterialsPath(courseId).slice(1), "POST"); },
  };
}
