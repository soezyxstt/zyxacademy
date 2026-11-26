export type AdministrationActor = Readonly<{ id: string; role: "admin" | "tutor" | "student" }>;
export type AdministrationScenario = "populated" | "empty" | "error";
export type UserRole = AdministrationActor["role"];
export type GroupStatus = "active" | "inactive" | "completed" | "archived";
export type PackageType = "reguler_15" | "intensif_30" | "super_intensif_45" | "custom";
export type EventType = "official_exam" | "tryout" | "quiz" | "general";
export type EventStatus = "published" | "draft" | "archived";
export type ReviewKind = "idea" | "product";
export type ItemDecision = "pending" | "approved" | "changes_requested";
export type BundleDecision = "approved" | "rejected" | "changes_requested";

export type RecordIdentity = { id: string; revision: number };
export type User = RecordIdentity & {
  name: string; email: string; roles: UserRole[]; status: "active" | "suspended";
};

export const administrationCourses = [
  { id: "academic-course-1", slug: "biologi-dasar", title: "Biologi Dasar" },
  { id: "academic-course-2", slug: "fisika-dasar", title: "Fisika Dasar" },
  { id: "academic-course-3", slug: "kimia-dasar", title: "Kimia Dasar" },
] as const;

export const packagePresets = {
  reguler_15: { title: "Reguler", total: 15, weekly: 1 },
  intensif_30: { title: "Intensif", total: 30, weekly: 2 },
  super_intensif_45: { title: "Super intensif", total: 45, weekly: 3 },
  custom: { title: "Kustom", total: 0, weekly: 0 },
} satisfies Record<PackageType, { title: string; total: number; weekly: number }>;

export type GroupFields = {
  name: string; courseIds: string[]; packageType: PackageType; total: number; weekly: number;
  year: string; semester: "Ganjil" | "Genap"; status: GroupStatus; notes: string;
};
export type Group = RecordIdentity & GroupFields & {
  used: number; members: { userId: string; role: "leader" | "member" }[];
};
export type TokenFields = { courseIds: string[]; capacity: number; packageType: PackageType; total: number; weekly: number };
export type Token = RecordIdentity & TokenFields & { code: string; groupId: string; used: number; expires: string };

export type AcademicEventFields = {
  title: string; type: EventType; courseId: string; startsAt: string; endsAt: string;
  location: string; description: string; status: EventStatus;
};
export type AcademicEvent = RecordIdentity & AcademicEventFields;
export type TutorSlotFields = { tutorId: string; startsAt: string; endsAt: string; mode: "online" | "offline"; location: string };
export type TutorSlot = RecordIdentity & TutorSlotFields;
export type BookingFields = { groupId: string; courseId: string; slotId: string; reason: string };
export type Booking = RecordIdentity & BookingFields & { status: "scheduled" | "cancelled" };
export type TutorCertification = RecordIdentity & { courseIds: string[] };
export type Audit = { id: string; action: string; reason: string; target: string };
export type Ticket = { id: string; title: string; courseId: string; status: "open" | "resolved"; body: string };

export type BroadcastFields = { title: string; body: string; link: string; target: "all" | "course" | "user"; targetId: string };
export type Broadcast = RecordIdentity & BroadcastFields & { attempted: number; succeeded: number; failed: number; createdAt: string };
export type AnnouncementFields = { title: string; body: string };
export type Announcement = RecordIdentity & AnnouncementFields & {
  pinned: boolean; archived: boolean; sentAt: string; recipients: number;
};
export type PkaSessionFields = { title: string; sessionAt: string; meetLink: string };
export type PkaSession = RecordIdentity & PkaSessionFields & { recipients: number };
export type Registration = {
  id: string; fullName: string; faculty: string; email: string; instagram: string;
  announcements: boolean; createdAt: string; proof: "available" | "unavailable";
};

export type ReviewItem = {
  id: string; title: string; content: string; source: string; status: ItemDecision; note: string;
  type: "concept" | "article" | "diktat";
};
export type Bundle = RecordIdentity & {
  kind: ReviewKind; courseId: string; title: string; source: string; author: string;
  status: "validated" | BundleDecision | "published" | "withdrawn";
  reason: string; items: ReviewItem[]; criteria: string[]; pdf: "none" | "pending" | "ready";
};

export const productCriteria = ["Ketepatan konsep", "Alur pembelajaran", "Kesesuaian dengan sumber", "Keterbacaan"] as const;
export const fixtureClock = "2026-11-26T09:00:00+07:00";

export type AdministrationRecords = {
  users: User[]; groups: Group[]; tokens: Token[]; academicEvents: AcademicEvent[];
  slots: TutorSlot[]; bookings: Booking[]; certifications: TutorCertification[]; audits: Audit[]; tickets: Ticket[];
  broadcasts: Broadcast[]; announcements: Announcement[]; sessions: PkaSession[]; registrations: Registration[];
  bundles: Bundle[];
};

type BundleTopics = { title: string; source: string; topics: [string, string]; details: [string, string] };
const bundleTopics: BundleTopics[] = [
  {
    title: "Sel dan organel", source: "Biologi Dasar, Bab 1, hlm. 8-12",
    topics: ["Membran sel", "Fungsi organel"],
    details: ["Membran plasma mengatur perpindahan zat melalui lapisan ganda fosfolipid.",
      "Mitokondria menghasilkan ATP melalui respirasi seluler. Ribosom menyintesis protein."],
  },
  {
    title: "Gerak lurus", source: "Fisika Dasar, Bab 2, hlm. 22-29",
    topics: ["Posisi dan perpindahan", "Kecepatan konstan"],
    details: ["Perpindahan adalah selisih posisi akhir dan awal pada sumbu gerak.",
      "Pada gerak lurus beraturan, perubahan posisi sama dengan kecepatan dikali selang waktu."],
  },
  {
    title: "Ikatan kimia", source: "Kimia Dasar, Bab 3, hlm. 37-43",
    topics: ["Ikatan ion", "Ikatan kovalen"],
    details: ["Ion dengan muatan berlawanan saling tarik-menarik.",
      "Atom dalam ikatan kovalen berbagi satu atau lebih pasangan elektron."],
  },
];

export const administrationBundleFixtures: readonly Bundle[] = administrationCourses.flatMap((course, index) => {
  const topic = bundleTopics[index];
  return (["idea", "product"] as const).map((kind) => {
    const id = `academic-${kind}-${index + 1}`;
    return {
      id, kind, courseId: course.id, revision: 1, title: topic.title, source: topic.source,
      author: "Rara Wibowo", status: "validated" as const, reason: "", criteria: [], pdf: "none" as const,
      items: topic.topics.map((title, itemIndex) => ({
        id: `${id}-${itemIndex + 1}`, title, content: topic.details[itemIndex], source: topic.source,
        status: "pending" as const, note: "",
        type: kind === "idea" ? "concept" as const : itemIndex === 0 ? "article" as const : "diktat" as const,
      })),
    };
  });
});

export function seedAdministration(actor: AdministrationActor, empty: boolean): AdministrationRecords {
  const current: User = { id: actor.id, revision: 1, name: "Admin Zyx", email: "admin@example.test", roles: ["admin"], status: "active" };
  if (empty) return {
    users: [current], groups: [], tokens: [], academicEvents: [], slots: [], bookings: [], certifications: [],
    audits: [], tickets: [], broadcasts: [], announcements: [], sessions: [], registrations: [], bundles: [],
  };
  return {
    users: [
      current,
      { id: "academic-tutor-1", revision: 1, name: "Rara Wibowo", email: "rara@example.test", roles: ["tutor"], status: "active" },
      { id: "academic-student-1", revision: 1, name: "Nadia Putri", email: "nadia@example.test", roles: ["student"], status: "active" },
      { id: "academic-student-2", revision: 1, name: "Bagas Riyadi", email: "bagas@example.test", roles: ["student"], status: "suspended" },
      { id: "academic-student-3", revision: 1, name: "Ayu Syahputri", email: "ayu@example.test", roles: ["student"], status: "active" },
    ].filter((user, index, records) => records.findIndex((other) => other.id === user.id) === index) as User[],
    groups: [
      { id: "academic-group-1", revision: 1, name: "Kelompok Biologi A", courseIds: [administrationCourses[0].id],
        packageType: "reguler_15", total: 15, weekly: 1, used: 3, year: "2026/2027", semester: "Ganjil",
        status: "active", notes: "Pertemuan setiap Kamis.", members: [{ userId: "academic-student-1", role: "leader" }] },
      { id: "academic-group-2", revision: 1, name: "Kelompok Fisika B", courseIds: [administrationCourses[1].id],
        packageType: "intensif_30", total: 30, weekly: 2, used: 9, year: "2026/2027", semester: "Ganjil",
        status: "completed", notes: "", members: [] },
    ],
    tokens: [
      { id: "academic-token-1", revision: 1, code: "Zyx-A19F01CD-20-1", courseIds: [administrationCourses[0].id],
        capacity: 20, used: 1, packageType: "reguler_15", total: 15, weekly: 1, expires: "2027-01-31", groupId: "academic-group-1" },
    ],
    academicEvents: [
      { id: "academic-event-1", revision: 1, title: "Kuis konsep sel", type: "quiz", courseId: administrationCourses[0].id,
        startsAt: "2026-11-26T10:00:00+07:00", endsAt: "2026-11-26T11:00:00+07:00", location: "Ruang B-12",
        description: "Bawa alat tulis.", status: "published" },
      { id: "academic-event-2", revision: 1, title: "Ujian gerak lurus", type: "official_exam", courseId: administrationCourses[1].id,
        startsAt: "2026-12-03T10:00:00+07:00", endsAt: "", location: "", description: "", status: "draft" },
    ],
    slots: [
      { id: "academic-slot-1", revision: 1, tutorId: "academic-tutor-1", startsAt: "2026-11-26T13:00:00+07:00",
        endsAt: "2026-11-26T14:00:00+07:00", mode: "online", location: "" },
      { id: "academic-slot-2", revision: 1, tutorId: "academic-tutor-1", startsAt: "2026-11-28T14:00:00+07:00",
        endsAt: "2026-11-28T15:00:00+07:00", mode: "offline", location: "Ruang B-12" },
    ],
    bookings: [
      { id: "academic-booking-1", revision: 1, slotId: "academic-slot-1", groupId: "academic-group-1",
        courseId: administrationCourses[0].id, reason: "Jadwal awal kelompok.", status: "scheduled" },
    ],
    certifications: [{ id: "academic-tutor-1", revision: 1, courseIds: [administrationCourses[0].id] }],
    audits: [{ id: "academic-audit-1", action: "Sesi ditugaskan", reason: "Jadwal awal kelompok.", target: "Kelompok Biologi A" }],
    tickets: [{ id: "academic-ticket-1", title: "Penyesuaian jam tutorial", courseId: administrationCourses[0].id,
      body: "Kelompok Biologi A meminta sesi di luar jam kuliah.", status: "open" }],
    broadcasts: [
      { id: "academic-broadcast-1", revision: 1, title: "Perubahan jadwal kuis", body: "Kuis dimulai pukul 10.00 WIB.",
        link: "/dashboard", target: "course", targetId: administrationCourses[0].id, attempted: 1, succeeded: 1, failed: 0,
        createdAt: "2026-11-25T08:00:00+07:00" },
    ],
    announcements: [
      { id: "academic-announcement-1", revision: 1, title: "Persiapan tutorial PKA", body: "Bawa hasil latihan minggu ini.",
        archived: false, pinned: true, recipients: 2, sentAt: fixtureClock },
      { id: "academic-announcement-2", revision: 1, title: "Pembukaan pendaftaran", body: "Lengkapi data pendaftaran untuk mengikuti sesi.",
        archived: true, pinned: false, recipients: 2, sentAt: "2026-11-20T09:00:00+07:00" },
    ],
    sessions: [
      { id: "academic-pka-session-1", revision: 1, title: "Tutorial PKA 1", sessionAt: "2026-11-28T16:00:00+07:00",
        meetLink: "https://meet.google.com/abc-defg-hij", recipients: 2 },
      { id: "academic-pka-session-2", revision: 1, title: "Pengenalan PKA", sessionAt: "2026-11-20T16:00:00+07:00",
        meetLink: "", recipients: 0 },
    ],
    registrations: [
      { id: "academic-pka-registration-1", fullName: "Nadia Putri", faculty: "FMIPA", email: "nadia@example.test",
        instagram: "nadiaputri", announcements: true, createdAt: fixtureClock, proof: "available" },
      { id: "academic-pka-registration-2", fullName: "Ayu Syahputri", faculty: "FT", email: "ayu@example.test",
        instagram: "ayusyah", announcements: false, createdAt: fixtureClock, proof: "unavailable" },
    ],
    bundles: administrationBundleFixtures.map((bundle) => ({ ...bundle, items: bundle.items.map((item) => ({ ...item })) })),
  };
}
