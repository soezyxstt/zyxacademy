export const studyGroupPackages = ["reguler_15", "intensif_30", "super_intensif_45", "custom"] as const;
export const studyGroupStatuses = ["active", "completed", "inactive", "archived"] as const;
export const studyGroupSemesters = ["Ganjil", "Genap"] as const;

export type StudyGroupFields = {
  name: string;
  packageType: (typeof studyGroupPackages)[number];
  totalQuotaSessions: number;
  weeklyQuotaSessions: number;
  academicYear: string;
  semester: string;
  startDate: string | null;
  endDate: string | null;
  status: (typeof studyGroupStatuses)[number];
  notes: string;
};

export type StudyGroupCreate = StudyGroupFields & { courseIds: string[] };
export type StudyGroupEdit = StudyGroupFields & { expectedRevision: string; courseIds?: string[] };
export type StudyGroupWrite = { type: "create"; fields: StudyGroupCreate } | { type: "edit"; id: string; fields: StudyGroupEdit };
export type StudyGroupCourse = { id: string; title: string };
export type StudyGroupRecord = { id: string; revision: string; fields: StudyGroupFields; courses: StudyGroupCourse[]; usedQuotaSessions: number };
export type StudyGroupEditorRead = { type: "create"; courses: StudyGroupCourse[] } | { type: "edit"; record: StudyGroupRecord; choices?: StudyGroupCourse[] };

export function validateStudyGroupFields(fields: StudyGroupFields, allowZeroQuota = false): string | undefined {
  if (!fields.name.trim() || fields.name.length > 180) return "Isi nama kelompok, maksimal 180 karakter.";
  const zeroQuota = allowZeroQuota && fields.totalQuotaSessions === 0 && fields.weeklyQuotaSessions === 0;
  if (!zeroQuota && (!Number.isSafeInteger(fields.totalQuotaSessions) || fields.totalQuotaSessions < 1 || fields.totalQuotaSessions > 100000)) return "Total kuota harus berupa bilangan bulat 1 sampai 100.000.";
  if (!zeroQuota && (!Number.isSafeInteger(fields.weeklyQuotaSessions) || fields.weeklyQuotaSessions < 1 || fields.weeklyQuotaSessions > fields.totalQuotaSessions)) return "Batas mingguan harus antara 1 dan total kuota.";
  if (!/^\d{4}\/\d{4}$/.test(fields.academicYear) || Number(fields.academicYear.slice(5)) !== Number(fields.academicYear.slice(0, 4)) + 1) return "Gunakan tahun ajaran berurutan, misalnya 2026/2027.";
  if (!fields.semester.trim() || fields.semester.length > 50) return "Isi semester, maksimal 50 karakter.";
  if (fields.notes.length > 2000) return "Catatan maksimal 2.000 karakter.";
  for (const date of [fields.startDate, fields.endDate]) {
    if (date !== null && !Number.isFinite(Date.parse(date))) return "Periksa tanggal mulai dan selesai.";
  }
  if (fields.startDate && fields.endDate && Date.parse(fields.startDate) > Date.parse(fields.endDate)) return "Tanggal selesai harus sama dengan atau setelah tanggal mulai.";
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isStudyGroupCourse(value: unknown): value is StudyGroupCourse {
  return object(value) && typeof value.id === "string" && typeof value.title === "string";
}

export function rebaseStudyGroupFields(base: StudyGroupFields, draft: StudyGroupFields, current: StudyGroupFields): StudyGroupFields {
  const next = { ...current };
  const apply = <K extends keyof StudyGroupFields>(key: K) => {
    if (draft[key] !== base[key]) next[key] = draft[key];
  };
  (Object.keys(next) as (keyof StudyGroupFields)[]).forEach(apply);
  return next;
}

function isDateValue(value: unknown) {
  return value === null || (typeof value === "string" && Number.isFinite(Date.parse(value)));
}

function isStudyGroupFields(value: unknown): value is StudyGroupFields {
  return object(value) && typeof value.name === "string"
    && studyGroupPackages.some((entry) => entry === value.packageType)
    && typeof value.totalQuotaSessions === "number" && typeof value.weeklyQuotaSessions === "number"
    && typeof value.academicYear === "string" && typeof value.semester === "string"
    && isDateValue(value.startDate) && isDateValue(value.endDate)
    && studyGroupStatuses.some((entry) => entry === value.status) && typeof value.notes === "string";
}

export function isStudyGroupRecord(value: unknown): value is StudyGroupRecord {
  return object(value) && typeof value.id === "string" && typeof value.revision === "string" && /^[a-f0-9]{64}$/.test(value.revision)
    && isStudyGroupFields(value.fields) && typeof value.usedQuotaSessions === "number"
    && Array.isArray(value.courses) && value.courses.every(isStudyGroupCourse);
}

export function isStudyGroupEditorRead(value: unknown): value is StudyGroupEditorRead {
  return object(value) && ((value.type === "create" && Array.isArray(value.courses) && value.courses.every(isStudyGroupCourse))
    || (value.type === "edit" && isStudyGroupRecord(value.record)
      && (value.choices === undefined || Array.isArray(value.choices) && value.choices.every(isStudyGroupCourse))));
}
