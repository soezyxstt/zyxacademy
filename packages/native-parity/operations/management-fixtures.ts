import {
  ManagementFailure, articleTitle, managementRoutes, managementSlug, validateArticle, validateForm, validateFormSettings,
  type Article, type DiscussionMessage, type DiscussionThread, type FormDetails, type ManagementAction, type ManagementClient,
  type ManagementMode, type ManagementReads, type ManagementReceipt, type MediaFile, type MeetingDetails,
  type MeetingDirectory, type MeetingSpace, type PricingData, type PublicLink, type Voucher,
} from "./management-contract";

export type ManagementFixtureOptions = { mode?: ManagementMode; admin?: boolean };
const now = "2026-11-26T09:00:00Z";
const initialArticles: Article[] = [
  { id: "article-local", slug: "strategi-latihan-mandiri", title: "Strategi latihan mandiri", summary: "Rencanakan sesi singkat dan ulangi soal yang sulit.", content: "# Strategi latihan mandiri\n\nBagi latihan menjadi beberapa sesi singkat.\n\n## Tinjau jawaban\n\nCatat alasan jawaban yang keliru sebelum mencoba lagi.", category: "tips_kuliah", status: "draft", thumbnailUrl: "", tags: ["belajar"], author: "Admin Zyx", revision: "article-1" },
  { id: "article-public", slug: "menata-waktu-belajar", title: "Menata waktu belajar", summary: "Sesuaikan jadwal dengan target mingguan.", content: "# Menata waktu belajar\n\nMulai dengan menyusun target yang dapat diukur.", category: "pojok_kampus", status: "published", thumbnailUrl: "", tags: [], author: "Admin Zyx", revision: "article-2" },
];
const initialForms: FormDetails[] = [
  {
    form: { id: "form-local", revision: "form-1", title: "Umpan balik latihan", description: "Masukan peserta setelah sesi latihan.", slug: "umpan-balik-latihan", category: "feedback", totalResponses: 2,
      questions: [{ title: "Materi latihan", type: "SECTION" }, { title: "Topik apa yang membantu?", type: "CHECKBOX", options: ["Kinematika", "Dinamika"], required: true }, { title: "Catatan tambahan", type: "PARAGRAPH" }], settings: { acceptingResponses: true, displayMode: "section" } },
    responses: [{ id: "response-one", answers: { 1: ["Kinematika", "Dinamika"], 2: "Tambahkan soal bertahap." }, submittedAt: now }, { id: "response-two", answers: { 1: ["Kinematika"] }, submittedAt: now }],
  },
];
const initialMeetings: MeetingDetails[] = [
  { id: "record-local", title: "Pembahasan soal Fisika I", startTime: "2026-11-25T08:00:00Z", endTime: "2026-11-25T09:00:00Z", participantCount: 2, peakConcurrentParticipants: 2, totalDurationSeconds: 3600,
    participants: [{ id: "attendee-one", name: "Tutor Contoh", userType: "signedin", totalDurationSeconds: 3600, sessions: [{ startTime: "2026-11-25T08:00:00Z", endTime: "2026-11-25T09:00:00Z" }] }, { id: "attendee-two", name: "Murid Contoh", userType: "anonymous", totalDurationSeconds: 1800, sessions: [{ startTime: "2026-11-25T08:10:00Z", endTime: "2026-11-25T08:40:00Z" }] }], recordings: [], transcripts: [] },
];
const initialDirectory: MeetingDirectory = {
  users: [{ id: "tutor-local", name: "Tutor Contoh", email: "tutor@example.invalid", roles: ["tutor"], courseIds: ["physics"] }, { id: "student-local", name: "Murid Contoh", email: "murid@example.invalid", roles: ["student"], courseIds: ["physics"] }],
  courses: [{ id: "physics", title: "Fisika I" }],
};
const initialThreads: DiscussionThread[] = [
  { id: "thread-local", title: "Bahas soal gerak lurus", channel: "Fisika I", status: "open", messageCount: 1 },
  { id: "thread-second", title: "Materi latihan pekan ini", channel: "Umum", status: "resolved", messageCount: 1 },
];
const initialMessages: Record<string, DiscussionMessage[]> = {
  "thread-local": [{ id: "message-one", author: "Murid Contoh", seq: 1, body: "Apa perbedaan perpindahan dan jarak dalam soal ini?" }],
  "thread-second": [{ id: "message-two", author: "Tutor Contoh", seq: 1, body: "Daftar latihan dibahas pada pertemuan berikutnya." }],
};
const initialLinks: PublicLink[] = [
  { id: "link-local", title: "Panduan belajar", url: "https://example.invalid/panduan", description: "Panduan sesi latihan", category: "Dokumen", icon: "📚", color: "neutral", isActive: true, sortOrder: 0 },
  { id: "link-second", title: "Jadwal latihan", url: "https://example.invalid/jadwal", description: "Jadwal mingguan", category: "Materi Belajar", icon: "📅", color: "neutral", isActive: false, sortOrder: 1 },
];
const initialVouchers: Voucher[] = [
  { id: "voucher-local", code: "LATIHAN10", discountPercent: 10, maxQuota: 20, usedCount: 3, expiresAt: "2026-12-31T16:59:59Z", description: "Paket latihan", isActive: true },
];
const initialPricing: PricingData = {
  vouchers: initialVouchers,
  discounts: { platform: { percent: 40, startsOn: "2026-09-12", endsOn: "2026-10-31" }, tutorial: { percent: 40, startsOn: "2026-09-12", endsOn: "2026-10-31" } }, now,
};
const initialMedia = {
  folders: ["media/blog"], storageFolders: ["course-materials"],
  files: [{ key: "media/blog/ilustrasi.png", name: "ilustrasi.png", size: 5240, lastModified: now }, { key: "media/panduan.pdf", name: "panduan.pdf", size: 93812, lastModified: now }],
  storage: [{ key: "course-materials/latihan.pdf", name: "latihan.pdf", size: 12485, lastModified: now }],
};

// Fixture payloads are JSON objects, matching the supported transport types.
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new ManagementFailure("not-found");
  return value;
}
function checkRevision(expected: string | undefined, actual: string) {
  if (expected !== actual) throw new ManagementFailure("conflict");
}
function invalid(reason?: string): asserts reason is undefined {
  if (reason) throw new ManagementFailure("invalid", reason);
}
function within(key: string, folder: string) { return key === folder || key.startsWith(`${folder}/`); }
function directChild(key: string, folder: string) { return key.substring(folder ? folder.length + 1 : 0).indexOf("/") < 0 && key !== folder && (!folder || within(key, folder)); }
function parentPath(key: string) { return key.split("/").slice(0, -1).join("/"); }
function joinPath(folder: string, name: string) { return folder ? `${folder}/${name}` : name; }
function validateFileName(name: string) { invalid(!name.trim() || /[/\\]/.test(name) || name === "." || name === ".." ? "Nama tidak valid." : undefined); }
function safeLink(value: string) {
  try { return ["https:", "http:"].includes(new URL(value).protocol); } catch { return false; }
}

export function createManagementFixture({ mode = "populated", admin = true }: ManagementFixtureOptions = {}): ManagementClient {
  const data = mode !== "empty";
  const articles = data ? clone(initialArticles) : [];
  const forms = data ? clone(initialForms) : [];
  const meetings = data ? clone(initialMeetings) : [];
  const threads = data ? clone(initialThreads) : [];
  const messages = data ? clone(initialMessages) : {};
  const discussionsReadThrough = new Map<string, number>();
  const links = data ? clone(initialLinks) : [];
  const pricing = clone(initialPricing);
  if (!data) pricing.vouchers = [];
  const files: MediaFile[] = data ? clone(initialMedia.files) : [];
  const folders = data ? clone(initialMedia.folders) : [];
  const storage: MediaFile[] = data ? clone(initialMedia.storage) : [];
  const storageFolders = data ? clone(initialMedia.storageFolders) : [];
  const receipts = new Map<string, { payload: string; receipt: ManagementReceipt }>();
  const failingReads = new Set<string>();
  let meetingSpace: MeetingSpace | undefined;
  let serial = 10;
  const nextId = (prefix: string) => `${prefix}-${++serial}`;
  const reads: { [K in keyof ManagementReads]: (input: ManagementReads[K][0]) => ManagementReads[K][1] } = {
    articles: () => articles.map(({ id, slug, title, category, status, author }) => ({ id, slug, title, category, status, author })),
    article: id => required(articles.find(article => article.id === id)),
    forms: () => forms.map(detail => detail.form),
    form: id => required(forms.find(detail => detail.form.id === id)),
    media: ({ space, folder }) => {
      const prefix = folder || (space === "media" ? "media" : "");
      return { folders: (space === "media" ? folders : storageFolders).filter(key => directChild(key, prefix)), files: (space === "media" ? files : storage).filter(file => directChild(file.key, prefix)) };
    },
    meetings: () => ({ items: meetings.map(({ id, title, startTime, endTime, participantCount, peakConcurrentParticipants }) => ({ id, title, startTime, endTime, participantCount, peakConcurrentParticipants })) }),
    meeting: id => required(meetings.find(record => record.id === id)),
    meetingDirectory: () => data ? initialDirectory : { users: [], courses: [] },
    discussions: ({ search, status }) => ({ items: threads.filter(thread => (!status || thread.status === status) && (!search || `${thread.title} ${thread.channel}`.toLowerCase().includes(search.toLowerCase()))) }),
    discussion: ({ id }) => ({ items: required(messages[id]), observationReceipt: `discussion-fixture-${id}`, throughSeq: discussionsReadThrough.get(id) ?? 0 }),
    pricing: () => pricing,
    links: () => links.slice().sort((a, b) => a.sortOrder - b.sortOrder),
  };

  function apply(action: ManagementAction): ManagementReceipt {
    switch (action.type) {
      case "article.save": {
        invalid(validateArticle(action.fields));
        const previous = action.id ? required(articles.find(article => article.id === action.id)) : undefined;
        if (previous) checkRevision(action.revision, previous.revision);
        const title = articleTitle(action.fields);
        const baseSlug = managementSlug(title) || "artikel";
        let slug = previous?.slug ?? baseSlug;
        for (let suffix = 2; !previous && articles.some(article => article.slug === slug); suffix += 1) slug = `${baseSlug}-${suffix}`;
        const content = action.fields.content.trim().replace(/^#\s+([^\r\n]+)(?:\r?\n|$)/, (line, heading: string) => heading.trim() === title ? "" : line).trim();
        const summary = action.fields.summary.trim() || content.slice(0, 150).trim();
        const article = { ...clone(action.fields), title, content, summary, slug, id: previous?.id ?? nextId("article"), revision: nextId("revision"), author: previous?.author ?? "Admin Zyx" };
        articles.splice(previous ? articles.indexOf(previous) : 0, previous ? 1 : 0, article);
        return { id: article.id, revision: article.revision };
      }
      case "form.save": {
        invalid(validateForm(action.fields));
        const previous = action.id ? required(forms.find(detail => detail.form.id === action.id)) : undefined;
        if (previous) checkRevision(action.revision, previous.form.revision);
        const slug = action.fields.slug || previous?.form.slug || nextId("f");
        invalid(forms.some(detail => detail.form.slug === slug && detail.form.id !== action.id) ? "Slug sudah digunakan." : undefined);
        invalid(previous?.responses.length && JSON.stringify(previous.form.questions) !== JSON.stringify(action.fields.questions) ? "Pertanyaan formulir dengan respons harus dipertahankan." : undefined);
        const form = { ...clone(action.fields), title: action.fields.title.trim(), slug, id: previous?.form.id ?? nextId("form"), revision: nextId("revision"), totalResponses: previous?.form.totalResponses ?? 0 };
        forms.splice(previous ? forms.indexOf(previous) : 0, previous ? 1 : 0, { form, responses: previous?.responses ?? [] });
        return { id: form.id, revision: form.revision };
      }
      case "form.settings": {
        invalid(validateFormSettings(action.settings));
        const detail = reads.form(action.id);
        checkRevision(action.revision, detail.form.revision);
        detail.form.settings = clone(action.settings);
        detail.form.revision = nextId("revision");
        return { id: action.id, revision: detail.form.revision };
      }
      case "form.delete": {
        const detail = reads.form(action.id);
        checkRevision(action.revision, detail.form.revision);
        forms.splice(forms.indexOf(detail), 1);
        return { id: action.id };
      }
      case "media.folder": {
        validateFileName(action.name);
        const key = joinPath(action.folder || "media", action.name.trim());
        invalid(folders.includes(key) ? "Nama folder sudah dipakai." : undefined);
        folders.push(key);
        return { id: key };
      }
      case "media.rename": {
        validateFileName(action.name);
        const file = required(files.find(item => item.key === action.key));
        const key = joinPath(parentPath(file.key), action.name.trim());
        invalid(key === file.key || files.some(other => other.key === key) ? "Nama file sudah dipakai." : undefined);
        Object.assign(file, { key, name: action.name.trim() });
        return { id: key };
      }
      case "media.delete": {
        if (action.folder) {
          required(folders.find(key => key === action.key));
          for (let index = files.length - 1; index >= 0; index -= 1) if (within(files[index].key, action.key)) files.splice(index, 1);
          for (let index = folders.length - 1; index >= 0; index -= 1) if (within(folders[index], action.key)) folders.splice(index, 1);
        } else {
          const file = required(files.find(item => item.key === action.key));
          files.splice(files.indexOf(file), 1);
        }
        return { id: action.key };
      }
      case "media.copy": {
        const destination = action.destination || "media";
        const name = required(action.key.split("/").at(-1));
        const key = joinPath(destination, name);
        if (action.folder) {
          required(storageFolders.find(path => path === action.key));
          invalid(folders.includes(key) ? "Nama folder sudah dipakai." : undefined);
          folders.push(key, ...storageFolders.filter(path => path !== action.key && within(path, action.key)).map(path => `${key}${path.substring(action.key.length)}`));
          files.push(...storage.filter(file => within(file.key, action.key)).map(file => ({ ...file, key: `${key}${file.key.substring(action.key.length)}` })));
        } else {
          const file = required(storage.find(item => item.key === action.key));
          invalid(files.some(item => item.key === key) ? "Nama file sudah dipakai." : undefined);
          files.push({ ...file, key });
        }
        return { id: key };
      }
      case "meet.create": {
        invalid(meetingSpace ? "Sesi aktif harus diakhiri terlebih dahulu." : undefined);
        const space = { name: nextId("space"), title: action.title.trim() || "Sesi meeting baru", slug: action.slug, meetingCode: "lok-alco-nto", invitedEmails: [...action.invitedEmails] };
        meetingSpace = space;
        return { id: space.name, space };
      }
      case "meet.end": {
        const space = required(meetingSpace?.name === action.spaceName ? meetingSpace : undefined);
        const id = nextId("record");
        meetings.unshift({ id, title: space.title, startTime: now, endTime: now, participantCount: 0, totalDurationSeconds: 0, participants: [], recordings: [], transcripts: [] });
        meetingSpace = undefined;
        return { id };
      }
      case "meet.delete": {
        meetings.splice(meetings.indexOf(reads.meeting(action.id)), 1);
        return { id: action.id };
      }
      case "discussion.resolve": {
        const thread = required(threads.find(item => item.id === action.id));
        thread.status = action.resolved ? "resolved" : "open";
        return { id: thread.id };
      }
      case "discussion.reply": {
        const thread = required(threads.find(item => item.id === action.id));
        invalid(!action.body.trim() ? "Tulis balasan terlebih dahulu." : undefined);
        invalid(thread.status === "resolved" ? "Diskusi sudah selesai." : undefined);
        const id = nextId("message");
        const page = reads.discussion({ id: thread.id });
        page.items.push({ id, author: "Admin Zyx", seq: page.items.length + 1, body: action.body.trim() });
        thread.messageCount += 1;
        return { id };
      }
      case "discussion.read": {
        const page = reads.discussion({ id: action.id });
        invalid(action.observationReceipt !== page.observationReceipt || !action.messageIds.every(id => page.items.some(message => message.id === id)) ? "Muat ulang halaman diskusi." : undefined);
        discussionsReadThrough.set(action.id, Math.max(page.throughSeq ?? 0, action.throughSeq));
        return { id: action.id };
      }
      case "link.save": {
        invalid(!action.fields.title.trim() || !safeLink(action.fields.url) ? "Isi judul serta URL HTTP atau HTTPS yang valid." : undefined);
        const existing = action.id ? required(links.find(link => link.id === action.id)) : undefined;
        const link = { ...action.fields, title: action.fields.title.trim(), id: existing?.id ?? nextId("link"), sortOrder: existing?.sortOrder ?? Math.max(-1, ...links.map(link => link.sortOrder)) + 1 };
        links.splice(existing ? links.indexOf(existing) : links.length, existing ? 1 : 0, link);
        return { id: link.id };
      }
      case "link.toggle": {
        required(links.find(link => link.id === action.id)).isActive = action.isActive;
        return { id: action.id };
      }
      case "link.move": {
        const link = required(links.find(item => item.id === action.id));
        const previous = links.find(item => item.sortOrder === action.sortOrder);
        if (previous) previous.sortOrder = link.sortOrder;
        link.sortOrder = action.sortOrder;
        return { id: link.id };
      }
      case "link.delete": {
        links.splice(links.indexOf(required(links.find(link => link.id === action.id))), 1);
        return { id: action.id };
      }
      case "voucher.create": {
        const voucher = action.voucher;
        invalid(!/^[A-Z0-9_-]+$/.test(voucher.code) || !Number.isInteger(voucher.discountPercent) || voucher.discountPercent < 1 || voucher.discountPercent > 100 || !Number.isInteger(voucher.maxQuota) || voucher.maxQuota < 1 || !Number.isFinite(Date.parse(voucher.expiresAt)) ? "Periksa kode, diskon, kuota, dan tanggal voucher." : undefined);
        invalid(pricing.vouchers.some(item => item.code === voucher.code) ? "Kode sudah digunakan." : undefined);
        const id = nextId("voucher");
        pricing.vouchers.unshift({ ...voucher, id, usedCount: 0, isActive: true });
        return { id };
      }
      case "voucher.toggle": {
        required(pricing.vouchers.find(item => item.id === action.id)).isActive = action.isActive;
        return { id: action.id };
      }
      case "voucher.delete": {
        pricing.vouchers.splice(pricing.vouchers.indexOf(required(pricing.vouchers.find(item => item.id === action.id))), 1);
        return { id: action.id };
      }
      case "pricing.discounts": {
        const settings = Object.values(action.discounts);
        invalid(settings.some(rule => !Number.isInteger(rule.percent) || rule.percent < 0 || rule.percent > 100 || !/^\d{4}-\d{2}-\d{2}$/.test(rule.startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(rule.endsOn) || rule.startsOn > rule.endsOn) ? "Periksa persentase dan periode diskon." : undefined);
        pricing.discounts = clone(action.discounts);
        return {};
      }
    }
  }

  return {
    async read<K extends keyof ManagementReads>(view: K, input: ManagementReads[K][0], signal?: AbortSignal) {
      if (!admin) throw new ManagementFailure("forbidden");
      if (signal?.aborted) throw new ManagementFailure("unavailable");
      const key = JSON.stringify([view, input]);
      if (mode === "recoverable-error" && !failingReads.has(key)) {
        failingReads.add(key);
        throw new ManagementFailure("unavailable");
      }
      return clone(reads[view](input));
    },
    async mutate(action, requestKey) {
      if (!admin) throw new ManagementFailure("forbidden");
      if (!requestKey.trim()) throw new ManagementFailure("invalid");
      const payload = JSON.stringify(action);
      const previous = receipts.get(requestKey);
      if (previous) {
        if (payload !== previous.payload) throw new ManagementFailure("conflict");
        return clone(previous.receipt);
      }
      const receipt = apply(action);
      receipts.set(requestKey, { payload, receipt });
      return clone(receipt);
    },
  };
}

const sampleIds = { "/admin/blog/[id]/edit": "article-local", "/admin/forms/[id]": "form-local", "/admin/docs/[slug]": "blog-dan-tautan", "/admin/meet/[id]": "record-local" };
export const managementCases = managementRoutes.flatMap(route => (["populated", "empty", "recoverable-error"] as const).map((mode, index) => ({
  id: `operations-management-${route.replace(/^\/admin\//, "").replaceAll(/[^a-z]+/g, "-").replace(/-$/, "")}-${mode}`,
  route, path: Object.hasOwn(sampleIds, route) ? route.replace(/\[(id|slug)\]/, sampleIds[route as keyof typeof sampleIds]) : route,
  theme: index === 2 ? "dark" as const : "light" as const, mode,
})));
