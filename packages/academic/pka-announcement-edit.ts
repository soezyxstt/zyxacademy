export const pkaAnnouncementTitleLimit = 100;
export const pkaAnnouncementBodyLimit = 4000;

export type PkaAnnouncementText = { title: string; body: string };
export type PkaAnnouncementEdit = PkaAnnouncementText & { expectedRevision: string };
export type PkaAnnouncementRevision = PkaAnnouncementText & { revision: string };
export type PkaAnnouncementSaved = { status: "saved"; requestId: string; announcement: PkaAnnouncementRevision };
export type PkaAnnouncementConflict = { status: "conflict"; announcement: PkaAnnouncementRevision };

export function validatePkaAnnouncementText({ title, body }: PkaAnnouncementText): string | undefined {
  if (!title.trim() || !body.trim()) return "Isi judul dan isi pengumuman.";
  if (title.length > pkaAnnouncementTitleLimit || body.length > pkaAnnouncementBodyLimit) return "Judul maksimal 100 karakter dan isi maksimal 4.000 karakter.";
}

export function isPkaAnnouncementRevision(value: unknown): value is PkaAnnouncementRevision {
  return Boolean(value && typeof value === "object" && "title" in value && typeof value.title === "string"
    && "body" in value && typeof value.body === "string" && "revision" in value && typeof value.revision === "string"
    && /^[a-f0-9]{64}$/.test(value.revision));
}
