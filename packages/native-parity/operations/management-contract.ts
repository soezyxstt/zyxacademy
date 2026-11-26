import type { FormQuestion as ValidatedFormQuestion } from "../../../lib/forms/validation";

export const managementRoutes = [
  "/admin/blog", "/admin/blog/new", "/admin/blog/[id]/edit", "/admin/forms", "/admin/forms/[id]",
  "/admin/media", "/admin/docs", "/admin/docs/[slug]", "/admin/meet", "/admin/meet/[id]",
  "/admin/discussions", "/admin/pricing", "/admin/tautan",
] as const;

export type ManagementRoute = typeof managementRoutes[number];
export type ManagementMode = "populated" | "empty" | "recoverable-error";
export type ManagementError = "forbidden" | "not-found" | "conflict" | "invalid" | "unavailable" | "unsupported" | "pending" | "uncertain" | "payload-too-large";

export class ManagementFailure extends Error {
  constructor(readonly code: ManagementError, message?: string) {
    super(message ?? code);
  }
}

const staticRoutes: ReadonlySet<string> = new Set(managementRoutes.filter(route => !route.includes("[")));

export function matchManagementPath(path: string): { route: ManagementRoute; id?: string; query: URLSearchParams } | null {
  const [rawPath, query = ""] = path.split("?", 2);
  const pathname = rawPath.replace(/\/$/, "");
  const parameters = new URLSearchParams(query);
  if (staticRoutes.has(pathname)) return { route: pathname as ManagementRoute, query: parameters };
  const match = /^\/admin\/(blog|forms|docs|meet)\/([^/]+)(\/edit)?$/.exec(pathname);
  if (!match || (match[1] === "blog") !== Boolean(match[3])) return null;
  try {
    const id = decodeURIComponent(match[2]);
    if (!id || /[/\\\0]/.test(id)) return null;
    const route = (match[1] === "docs" ? "/admin/docs/[slug]" : `/admin/${match[1]}/[id]${match[3] ?? ""}`) as ManagementRoute;
    return { route, id, query: parameters };
  } catch {
    return null;
  }
}

export const isManagementPath = (path: string) => matchManagementPath(path) !== null;

export const articleCategories = {
  tips_kuliah: "Tips kuliah", pojok_kampus: "Pojok kampus", fakta_seru: "Fakta seru", kegiatan_zyx: "Kegiatan Zyx",
} as const;
export type ArticleFields = {
  title: string; summary: string; content: string; category: keyof typeof articleCategories;
  status: "draft" | "published" | "scheduled"; thumbnailUrl: string; tags: string[];
};
export type Article = ArticleFields & { id: string; slug: string; author: string; revision: string };
export type ArticleSummary = Pick<Article, "id" | "slug" | "title" | "category" | "status" | "author">;
export const emptyArticle: ArticleFields = {
  title: "", summary: "", content: "", category: "tips_kuliah", status: "draft", thumbnailUrl: "", tags: [],
};

export const formCategories = { survey: "Survei", quiz: "Kuis", feedback: "Umpan balik", registration: "Pendaftaran" } as const;
export const questionTypes = {
  TEXT: "Jawaban singkat", PARAGRAPH: "Paragraf", RADIO: "Pilihan ganda", CHECKBOX: "Kotak centang", DROP_DOWN: "Dropdown",
  FILE_UPLOAD: "Unggah file", SCALE: "Skala linear", RATING: "Rating", GRID_RADIO: "Kisi pilihan ganda", GRID_CHECKBOX: "Kisi kotak centang",
  DATE: "Tanggal", TIME: "Waktu", SECTION: "Bagian", STATEMENT: "Pernyataan",
} as const;
export type FormQuestion = ValidatedFormQuestion;
export type FormSettings = {
  acceptingResponses?: boolean; displayMode?: "question" | "section"; collectEmail?: "none" | "input" | "verified";
  openAt?: string; closeAt?: string; closedMessage?: string; customSuccessMessage?: string;
  allowResponseEditing?: boolean; limitToOneResponse?: boolean; sendResponseCopy?: "off" | "requested" | "always";
};
export type FormFields = {
  title: string; description: string; category: keyof typeof formCategories; slug: string; questions: FormQuestion[]; settings: FormSettings;
};
export type FormDefinition = FormFields & { id: string; revision: string; totalResponses: number; spreadsheetUrl?: string | null };
export type FormResponse = { id: string; responderEmail?: string; answers: Record<string, unknown>; submittedAt: string };
export type FormDetails = { form: FormDefinition; responses: FormResponse[] };
export type FormPresetFields = {
  name: string; description: string; category: FormFields["category"]; questions: FormQuestion[]; settings?: FormSettings;
};
export type FormPreset = FormPresetFields & { id: string; revision: string; canApplyQuestions?: boolean; invalidSettings?: boolean };
export type FormPresetSummary = Pick<FormPreset, "id" | "name" | "category"> & { hasSettings: boolean };
export type FormPresetPage = { items: FormPresetSummary[]; nextCursor?: string };
export const formPresetPageSize = 20;
export const newQuestion = (): FormQuestion => ({ title: "", type: "TEXT", required: true });
export const newForm = (): FormFields => ({ title: "", description: "", category: "survey", slug: "", questions: [newQuestion()], settings: { acceptingResponses: true } });

export type MediaFile = { key: string; name: string; size: number; url?: string; lastModified?: string };
export type MediaLibrary = { folders: string[]; files: MediaFile[]; destinations?: string[]; cursor?: string };
export type MediaLocation = { space: "media" | "storage"; folder: string; cursor?: string };
export type MeetingRecord = { id: string; title: string; startTime: string; endTime?: string; participantCount?: number; peakConcurrentParticipants?: number };
export type MeetingParticipant = { id: string; name: string; userType: string; totalDurationSeconds: number; sessions: { startTime?: string; endTime?: string }[] };
export type MeetingSpeech = { id: string; speakerId: string; startTime: string; text: string };
export type MeetingTranscript = { id: string; lines: number; startTime?: string; endTime?: string; documentUrl?: string; firstPage?: ManagementPage<MeetingSpeech> };
export type MeetingDetails = MeetingRecord & { totalDurationSeconds: number; participants: MeetingParticipant[]; recordings: { id: string; url?: string; startTime?: string }[]; transcripts: MeetingTranscript[] };
export type MeetingSpace = { name: string; title: string; meetingCode: string; meetingUri?: string; slug?: string; hostEmail?: string; invitedEmails: string[] };
export type MeetingUser = { id: string; name: string; email: string; roles: string[]; courseIds: string[] };
export type MeetingDirectory = { users: MeetingUser[]; courses: { id: string; title: string }[] };
export type DiscussionThread = { id: string; title: string; channel: string; status: "open" | "resolved"; messageCount: number; canReply?: boolean; canResolve?: boolean };
export type ManagementPage<T> = { items: T[]; nextCursor?: string };
export type DiscussionMessage = { id: string; author: string; body: string; seq: number };
export type DiscussionPage = ManagementPage<DiscussionMessage> & {
  thread?: DiscussionThread; observationReceipt?: string; throughSeq?: number; previousCursor?: string;
};
export type DiscussionReportSummary = {
  id: string; threadId: string; messageId: string; title: string; reason: string; reporterName?: string; createdAt?: string; status: "pending" | "resolved" | "dismissed";
};
export type LinkFields = { title: string; url: string; description: string; category: string; icon: string; color: string; isActive: boolean };
export type PublicLink = LinkFields & { id: string; sortOrder: number };
export type Voucher = { id: string; code: string; discountPercent: number; maxQuota: number; usedCount: number; expiresAt: string; description: string; isActive: boolean };
export type PricingDiscounts = Record<"platform" | "tutorial", { percent: number; startsOn: string; endsOn: string }>;
export type PricingData = { vouchers: Voucher[]; discounts: PricingDiscounts; now: string };

export type ManagementReads = {
  articles: [undefined, ArticleSummary[]]; article: [string, Article]; forms: [undefined, FormDefinition[]]; form: [string, FormDetails];
  presets: [{ cursor?: string; settingsOnly?: boolean }, FormPresetPage]; preset: [string, FormPreset];
  media: [MediaLocation, MediaLibrary]; meetings: [string | undefined, ManagementPage<MeetingRecord>]; meeting: [string, MeetingDetails]; transcript: [{ id: string; transcript: string; cursor: string }, ManagementPage<MeetingSpeech>]; meetingDirectory: [undefined, MeetingDirectory];
  discussions: [{ cursor?: string; search?: string; status?: DiscussionThread["status"] }, ManagementPage<DiscussionThread>]; discussion: [{ id: string; cursor?: string; message?: string }, DiscussionPage];
  discussionReports: [{ cursor?: string }, ManagementPage<DiscussionReportSummary>]; pricing: [undefined, PricingData]; links: [undefined, PublicLink[]];
};

export type ManagementAction =
  | { type: "article.save"; fields: ArticleFields; id?: string; revision?: string }
  | { type: "form.save"; fields: FormFields; id?: string; revision?: string }
  | { type: "form.settings"; id: string; settings: FormSettings; revision: string }
  | { type: "form.delete"; id: string; revision: string }
  | { type: "form.export"; id: string; confirmedRevision?: string }
  | { type: "form.preset.create"; fields: FormPresetFields }
  | { type: "form.preset.update"; id: string; revision: string; name: string; description: string }
  | { type: "form.preset.delete"; id: string; revision: string }
  | { type: "media.folder"; folder: string; name: string }
  | { type: "media.rename"; key: string; name: string; folder?: boolean }
  | { type: "media.move"; key: string; folder: boolean; destination: string }
  | { type: "media.delete"; key: string; folder: boolean }
  | { type: "media.copy"; key: string; folder: boolean; destination: string }
  | { type: "meet.create"; title: string; slug: string; accessType: "OPEN" | "TRUSTED" | "RESTRICTED"; invitedEmails: string[] }
  | { type: "meet.end"; spaceName: string }
  | { type: "meet.delete"; id: string }
  | { type: "discussion.moderate-report"; id: string; status: "resolved" | "dismissed" }
  | { type: "discussion.resolve"; id: string; resolved: boolean }
  | { type: "discussion.reply"; id: string; body: string }
  | { type: "discussion.read"; id: string; throughSeq: number; observationReceipt: string; messageIds: string[] }
  | { type: "link.save"; id?: string; fields: LinkFields }
  | { type: "link.toggle"; id: string; isActive: boolean }
  | { type: "link.move"; id: string; sortOrder: number; direction: "up" | "down" }
  | { type: "link.delete"; id: string }
  | { type: "voucher.create"; voucher: Omit<Voucher, "id" | "usedCount" | "isActive"> }
  | { type: "voucher.toggle"; id: string; isActive: boolean }
  | { type: "voucher.delete"; id: string }
  | { type: "pricing.discounts"; discounts: PricingDiscounts };

export type FormSheetConflict = "block_modified" | "manual_rows" | "manual_columns";
export type FormSheetReceipt =
  | { kind: "confirm"; revision: string; conflicts: FormSheetConflict[] }
  | { kind: "saved"; url: string; created: boolean; sharingIncomplete: boolean };
export type ManagementReceipt = { id?: string; revision?: string; space?: MeetingSpace; warningCount?: number; formSheet?: FormSheetReceipt };
export interface ManagementClient {
  read<K extends keyof ManagementReads>(view: K, input: ManagementReads[K][0], signal?: AbortSignal): Promise<ManagementReads[K][1]>;
  mutate(action: ManagementAction, requestKey: string): Promise<ManagementReceipt>;
}

export function managementSlug(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function articleTitle(fields: ArticleFields) {
  return fields.title.trim() || /^#\s+(.+)/.exec(fields.content.trim())?.[1]?.trim() || "";
}

export function validateArticle(fields: ArticleFields): string | undefined {
  if (fields.status === "scheduled") return "Publikasi terjadwal belum tersedia. Pilih draf atau terbit.";
  if (!articleTitle(fields)) return "Isi judul atau awali konten dengan heading judul.";
  const content = fields.content.trim();
  const heading = /^#\s+([^\r\n]+)(?:\r?\n|$)/.exec(content);
  if (!content || (heading?.[1].trim() === articleTitle(fields) && !content.slice(heading[0].length).trim())) return "Isi artikel tidak boleh kosong.";
  if (fields.thumbnailUrl && !/^(https:\/\/|\/(api\/storage\/file|images|assets)\/)/.test(fields.thumbnailUrl)) return "Gunakan gambar dari sumber yang didukung.";
}

export function validateFormSettings(settings: FormSettings): string | undefined {
  const open = settings.openAt ? Date.parse(settings.openAt) : undefined;
  const close = settings.closeAt ? Date.parse(settings.closeAt) : undefined;
  if ([open, close].some(value => value !== undefined && !Number.isFinite(value))) return "Masukkan tanggal dan waktu yang valid.";
  if (open !== undefined && close !== undefined && open >= close) return "Jadwal buka harus lebih awal dari jadwal tutup.";
}

export function validateForm(fields: FormFields): string | undefined {
  if (!fields.title.trim()) return "Nama formulir wajib diisi.";
  if (fields.slug && !/^[a-z0-9][a-z0-9_-]*$/.test(fields.slug)) return "Gunakan huruf kecil, angka, garis bawah atau tanda hubung untuk slug.";
  const settingsError = validateFormSettings(fields.settings);
  if (settingsError) return settingsError;
  let questionNumber = 0;
  for (const question of fields.questions) {
    if (question.type === "SECTION") continue;
    if (question.type === "STATEMENT") {
      if (!question.title.trim() && !question.description?.trim() && !question.imageUrl) return "Isi pernyataan dengan judul, deskripsi, atau gambar.";
      continue;
    }
    questionNumber += 1;
    if (!question.title.trim()) return `Isi teks pertanyaan ${questionNumber}.`;
    if (["RADIO", "CHECKBOX", "DROP_DOWN"].includes(question.type) && !question.options?.some(option => option.trim())) return `Tambahkan pilihan untuk pertanyaan ${questionNumber}.`;
    if (question.type.startsWith("GRID_") && (!question.gridRows?.some(row => row.trim()) || !question.gridColumns?.some(column => column.trim()))) return `Tambahkan baris dan kolom untuk pertanyaan ${questionNumber}.`;
  }
}
