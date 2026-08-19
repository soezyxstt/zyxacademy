import { aggregateZyraEvidence } from "./aggregate";
import {
  toAdaptationSnapshot,
  type ZyraAdaptationDecision,
  type ZyraLearnerPreferences,
} from "./contracts";
import {
  getZyraLearnerPreferences,
  getZyraLearnerProfile,
  loadZyraEvidence,
  resetZyraLearnerProfile,
  saveZyraLearnerProfile,
  upsertZyraLearnerPreferences,
} from "./evidence";

export async function getZyraAdaptation(input: {
  studentId: string;
  courseId: string;
  readOnly?: boolean;
}): Promise<ZyraAdaptationDecision> {
  const profile = await getZyraLearnerProfile(input.studentId, input.courseId);
  const preferences = await getZyraLearnerPreferences(input.studentId, input.courseId);
  const events = await loadZyraEvidence({
    studentId: input.studentId,
    courseId: input.courseId,
    after: profile?.resetAt ?? null,
  });
  const decision = aggregateZyraEvidence({ events, explicitPreferences: preferences });

  if (!input.readOnly) {
    await saveZyraLearnerProfile(
      input.studentId,
      input.courseId,
      decision,
      profile?.resetAt ?? null,
    );
  }

  return decision;
}

export async function updateZyraPreferences(input: {
  studentId: string;
  courseId: string;
  preferences: ZyraLearnerPreferences;
}): Promise<ZyraAdaptationDecision> {
  await upsertZyraLearnerPreferences(input.studentId, input.courseId, input.preferences);
  return getZyraAdaptation(input);
}

export async function resetZyraAdaptation(input: {
  studentId: string;
  courseId: string;
}): Promise<ZyraAdaptationDecision> {
  await resetZyraLearnerProfile(input.studentId, input.courseId);
  return getZyraAdaptation({ ...input, readOnly: true });
}

export async function getZyraProfileView(input: {
  studentId: string;
  courseId: string;
}) {
  const decision = await getZyraAdaptation({ ...input, readOnly: true });
  return toAdaptationSnapshot(decision);
}
