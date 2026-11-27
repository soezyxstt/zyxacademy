export const publicFormCases = {
  "forms-ready": { entry: "full", id: "native-form-full", status: "ready" },
  "forms-closed": { entry: "full", id: "native-form-closed", status: "closed" },
  "forms-missing": { entry: "full", id: "native-form-missing", status: "missing" },
  "short-collision": { entry: "short", id: "native-form-collision", status: "ready" },
  "short-meeting": { entry: "short", id: "native-form-meeting", status: "meeting" },
  "short-missing": { entry: "short", id: "native-form-missing", status: "missing" },
} as const;

export type PublicFormCaseId = keyof typeof publicFormCases;
export const publicFormFrame = { width: 380, height: 640 } as const;
export const publicFormPageCases = {
  forms: { route: "/forms/[id]", cases: ["forms-ready", "forms-closed", "forms-missing"] },
  "short-forms": { route: "/f/[slug]", cases: ["short-collision", "short-meeting", "short-missing"] },
} as const satisfies Record<string, { route: string; cases: readonly PublicFormCaseId[] }>;

export function isPublicFormCaseId(id: unknown): id is PublicFormCaseId {
  return typeof id === "string" && Object.hasOwn(publicFormCases, id);
}

export const publicFormFixtureMeeting = "https://meet.google.com/abc-defg-hij";
export const publicFormFixtureTitle = "Pendaftaran tutorial";
export const publicFormFixtureQuestion = "Nama peserta";
export const publicFormFixtureClosure = { kind: "closed", message: "Pendaftaran sesi ini telah berakhir." } as const;

export function publicFormFixtureEnvelope(caseId: PublicFormCaseId) {
  const sample = publicFormCases[caseId];
  if (sample.status === "missing") return { error: "Formulir tidak ditemukan." };
  if (sample.status === "meeting") return { success: true, destination: "meeting", meetingUri: publicFormFixtureMeeting };
  const form = {
    id: `id-${sample.id}`, slug: sample.id, title: publicFormFixtureTitle,
    description: "Pilih jadwal tutorial yang sesuai dengan waktu belajar Anda.",
    category: "registration",
    questions: [{ title: publicFormFixtureQuestion, type: "TEXT", required: true }],
    settings: { displayMode: "section" },
  };
  return sample.status === "closed"
    ? { success: false, form, isClosed: true, closure: publicFormFixtureClosure, closedReason: publicFormFixtureClosure.message }
    : { success: true, form, isClosed: false };
}
