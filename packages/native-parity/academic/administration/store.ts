import {
  administrationCourses, fixtureClock, packagePresets, productCriteria, seedAdministration,
  type AcademicEventFields, type AdministrationActor, type AdministrationRecords, type AdministrationScenario,
  type AnnouncementFields, type BookingFields, type BroadcastFields, type BundleDecision, type GroupFields,
  type ItemDecision, type PkaSessionFields, type RecordIdentity, type TokenFields, type TutorSlotFields, type UserRole,
} from "./fixtures";

type CreateOrEdit = { id?: string; revision?: number };
type Existing = RecordIdentity;

export type AdministrationCommand =
  | (Existing & { type: "user.roles"; roles: UserRole[] })
  | (Existing & { type: "user.status"; status: "active" | "suspended" })
  | (CreateOrEdit & { type: "group.save"; fields: GroupFields })
  | (Existing & { type: "group.delete" })
  | (Existing & { type: "group.member"; userId: string; action: "add" | "remove" })
  | { type: "token.create"; fields: TokenFields }
  | (Existing & { type: "token.delete" })
  | (CreateOrEdit & { type: "event.save"; fields: AcademicEventFields })
  | (Existing & { type: "event.delete" })
  | { type: "slot.create"; fields: TutorSlotFields }
  | (Existing & { type: "slot.delete" })
  | { type: "booking.assign"; fields: BookingFields }
  | (Existing & { type: "booking.move"; slotId: string; reason: string })
  | (Existing & { type: "booking.cancel"; reason: string })
  | (Existing & { type: "tutor.courses"; courseIds: string[] })
  | { type: "broadcast.send"; fields: BroadcastFields }
  | (CreateOrEdit & { type: "pka.announcement.save"; fields: AnnouncementFields })
  | (Existing & { type: "pka.announcement.pin" | "pka.announcement.archive" })
  | (CreateOrEdit & { type: "pka.session.save"; fields: PkaSessionFields })
  | (Existing & { type: "pka.session.delete" })
  | (Existing & { type: "bundle.item"; itemId: string; status: ItemDecision; note: string })
  | (Existing & { type: "bundle.content"; itemId: string; title: string; content: string })
  | (Existing & { type: "bundle.decide"; status: BundleDecision; reason: string; criteria: string[] })
  | (Existing & { type: "bundle.publish" | "bundle.withdraw" | "bundle.delete" | "bundle.pdf.request" | "bundle.pdf.poll" });

export type AdministrationReceipt = { status: "saved"; id: string };
export type AdministrationResult =
  | AdministrationReceipt
  | { status: "invalid" | "denied" | "missing" | "uncertain"; message: string }
  | { status: "conflict"; message: string; revision: number };

type Collection = Exclude<keyof AdministrationRecords, "tickets" | "audits" | "registrations">;
const collections: Record<Exclude<AdministrationCommand["type"], "token.create" | "slot.create" | "booking.assign" | "broadcast.send">, Collection> = {
  "user.roles": "users", "user.status": "users", "group.save": "groups", "group.delete": "groups",
  "group.member": "groups", "token.delete": "tokens", "event.save": "academicEvents", "event.delete": "academicEvents",
  "slot.delete": "slots", "booking.move": "bookings", "booking.cancel": "bookings", "tutor.courses": "certifications",
  "pka.announcement.save": "announcements", "pka.announcement.pin": "announcements", "pka.announcement.archive": "announcements",
  "pka.session.save": "sessions", "pka.session.delete": "sessions", "bundle.item": "bundles", "bundle.content": "bundles",
  "bundle.decide": "bundles", "bundle.publish": "bundles", "bundle.withdraw": "bundles", "bundle.delete": "bundles",
  "bundle.pdf.request": "bundles", "bundle.pdf.poll": "bundles",
};
const validCourses = (ids: string[]) => new Set(ids).size === ids.length && ids.every((id) => administrationCourses.some((course) => course.id === id));
const validInteger = (value: number, min: number, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const invalid = (message: string): AdministrationResult => ({ status: "invalid", message });
const missing = (): AdministrationResult => ({ status: "missing", message: "Data tidak ditemukan." });
const saved = (id: string): AdministrationReceipt => ({ status: "saved", id });
const hasText = (value: string) => value.trim().length > 0;
const validDateTime = (value: string) => {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2}|Z)$/.exec(value);
  if (!parts || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day, hours, minutes, seconds] = parts;
  const reconstructed = new Date(Date.UTC(+year, +month - 1, +day, +hours, +minutes, +seconds));
  return reconstructed.toISOString().slice(0, 19) === value.slice(0, 19);
};
const later = (end: string, start: string) => Date.parse(end) > Date.parse(start);
const overlaps = (a: string, b: string, start: string, end: string) => Date.parse(a) < Date.parse(end) && Date.parse(start) < Date.parse(b);
const unresolvedConflict = (revision: number): AdministrationResult => ({
  status: "conflict", revision, message: "Data telah berubah. Tinjau revisi terbaru sebelum menerapkan perubahan Anda.",
});

function deleteGroup(records: AdministrationRecords, id: string) {
  records.groups = records.groups.filter((group) => group.id !== id);
  records.tokens = records.tokens.filter((token) => token.groupId !== id);
  records.bookings = records.bookings.filter((booking) => booking.groupId !== id);
}

function isDelivery(command: AdministrationCommand, records: AdministrationRecords) {
  if (command.type === "broadcast.send" || (command.type === "pka.announcement.save" && !command.id)) return true;
  if (command.type !== "pka.session.save" || !later(command.fields.sessionAt, fixtureClock)) return false;
  if (!command.id) return true;
  const previous = records.sessions.find((entry) => entry.id === command.id);
  return Boolean(command.fields.meetLink.trim() && command.fields.meetLink.trim() !== previous?.meetLink);
}

export function validateBroadcast(records: AdministrationRecords, fields: BroadcastFields) {
  if (!hasText(fields.title) || !hasText(fields.body)) return "Isi judul dan pesan notifikasi.";
  if (fields.title.length > 100 || fields.body.length > 500) return "Judul maksimal 100 karakter dan pesan maksimal 500 karakter.";
  const link = fields.link.trim() || "/dashboard";
  if (!/^\/(?!\/)[^\s\\]*$/.test(link)) return "Gunakan tautan internal yang diawali /.";
  if ((fields.target === "user" && !records.users.some((user) => user.id === fields.targetId))
    || (fields.target === "course" && !validCourses([fields.targetId]))) return "Pilih target yang tersedia.";
}

export function getBroadcastAudience(records: AdministrationRecords, fields: BroadcastFields) {
  if (fields.target === "all") return records.users.length;
  if (fields.target === "user") return records.users.some((user) => user.id === fields.targetId) ? 1 : 0;
  return new Set(records.groups.filter((group) => group.courseIds.includes(fields.targetId))
    .flatMap((group) => group.members.map((member) => member.userId))).size;
}

function updateRecords(records: AdministrationRecords, command: AdministrationCommand, actorId: string, id: string): AdministrationResult {
  switch (command.type) {
    case "user.roles":
    case "user.status": {
      const user = records.users.find((entry) => entry.id === id)!;
      if (command.type === "user.roles") {
        if (!command.roles.length) return invalid("Pilih setidaknya satu peran.");
        if (id === actorId && !command.roles.includes("admin")) return invalid("Pertahankan peran admin pada akun Anda.");
        user.roles = [...new Set(command.roles)];
      } else {
        if (id === actorId && command.status === "suspended") return invalid("Akun Anda sendiri tidak dapat ditangguhkan.");
        user.status = command.status;
      }
      user.revision++;
      break;
    }
    case "group.save": {
      const { fields } = command;
      if (!hasText(fields.name)) return invalid("Isi nama kelompok.");
      if (!validCourses(fields.courseIds)) return invalid("Pilih mata kuliah yang tersedia.");
      if (!validInteger(fields.total, 1) || !validInteger(fields.weekly, 1, fields.total)) return invalid("Isi total dan batas mingguan yang valid.");
      if (!/^\d{4}\/\d{4}$/.test(fields.year) || +fields.year.slice(5) !== +fields.year.slice(0, 4) + 1) return invalid("Gunakan format tahun ajaran 2026/2027.");
      const group = records.groups.find((entry) => entry.id === id);
      if (group && fields.total < group.used) return invalid("Total kuota harus mencakup sesi yang telah dipakai.");
      const relatedToken = records.tokens.find((token) => token.groupId === id);
      if (relatedToken && (fields.courseIds.length !== relatedToken.courseIds.length || fields.courseIds.some((courseId) => !relatedToken.courseIds.includes(courseId)))) {
        return invalid("Mata kuliah kelompok token mengikuti token pendaftaran.");
      }
      if (group) Object.assign(group, fields, { name: fields.name.trim(), revision: group.revision + 1 });
      else records.groups.unshift({ ...fields, name: fields.name.trim(), id, used: 0, members: [], revision: 1 });
      break;
    }
    case "group.delete":
      deleteGroup(records, id);
      break;
    case "group.member": {
      const group = records.groups.find((entry) => entry.id === id)!;
      const member = group.members.find((entry) => entry.userId === command.userId);
      if (command.action === "add") {
        if (!records.users.some((user) => user.id === command.userId && user.status === "active" && user.roles.includes("student"))) return invalid("Pilih peserta aktif.");
        if (member) return invalid("Peserta sudah menjadi anggota.");
        group.members.push({ userId: command.userId, role: "member" });
      } else {
        if (!member) return missing();
        group.members = group.members.filter((entry) => entry.userId !== command.userId);
      }
      group.revision++;
      break;
    }
    case "token.create": {
      const { fields } = command;
      if (!fields.courseIds.length || !validCourses(fields.courseIds)) return invalid("Pilih setidaknya satu mata kuliah.");
      if (!validInteger(fields.capacity, 1, 1000)) return invalid("Kapasitas harus bilangan bulat antara 1 dan 1.000.");
      if (!validInteger(fields.total, 0) || !validInteger(fields.weekly, 0)) return invalid("Isi kuota pertemuan dengan bilangan bulat minimal 0.");
      const packageType = (Object.keys(packagePresets) as (keyof typeof packagePresets)[]).find((key) =>
        key !== "custom" && packagePresets[key].total === fields.total && [fields.total, packagePresets[key].weekly].includes(fields.weekly),
      ) ?? "custom";
      const code = `Zyx-${Number(id.slice(id.lastIndexOf("-") + 1)).toString(16).toUpperCase().padStart(8, "0")}-${fields.capacity}-${fields.courseIds.length}`;
      const groupId = `${id}-group`;
      const weekly = fields.total === 0 ? 0 : fields.weekly;
      records.tokens.unshift({ ...fields, packageType, weekly, id, groupId, code, used: 0, expires: "2027-01-31", revision: 1 });
      records.groups.unshift({
        id: groupId, revision: 1, name: `Kelompok Token ${code}`, courseIds: fields.courseIds,
        packageType, total: fields.total, weekly, year: "2026/2027", semester: "Ganjil",
        status: "active", notes: "", used: 0, members: [],
      });
      break;
    }
    case "token.delete":
      deleteGroup(records, records.tokens.find((entry) => entry.id === id)!.groupId);
      break;
    case "event.save": {
      const { fields } = command;
      if (!hasText(fields.title)) return invalid("Isi judul jadwal.");
      if (fields.courseId && !validCourses([fields.courseId])) return invalid("Pilih mata kuliah yang tersedia.");
      if (!validDateTime(fields.startsAt)) return invalid("Periksa tanggal dan jam mulai.");
      if (fields.endsAt && (!validDateTime(fields.endsAt) || !later(fields.endsAt, fields.startsAt))) return invalid("Jam selesai harus setelah jam mulai.");
      const event = records.academicEvents.find((entry) => entry.id === id);
      if (event) Object.assign(event, fields, { title: fields.title.trim(), revision: event.revision + 1 });
      else records.academicEvents.unshift({ ...fields, title: fields.title.trim(), id, revision: 1 });
      break;
    }
    case "event.delete":
      records.academicEvents = records.academicEvents.filter((entry) => entry.id !== id);
      break;
    case "slot.create": {
      const { fields } = command;
      if (!records.users.some((user) => user.id === fields.tutorId && user.roles.includes("tutor") && user.status === "active")) return invalid("Pilih tutor aktif.");
      if (!validDateTime(fields.startsAt) || !validDateTime(fields.endsAt) || !later(fields.endsAt, fields.startsAt)) return invalid("Periksa tanggal dan jam mulai serta selesai.");
      if (fields.mode === "offline" && !hasText(fields.location)) return invalid("Isi lokasi sesi tatap muka.");
      if (records.slots.some((slot) => slot.tutorId === fields.tutorId && overlaps(slot.startsAt, slot.endsAt, fields.startsAt, fields.endsAt))) return invalid("Tutor sudah memiliki slot pada waktu tersebut.");
      records.slots.unshift({ ...fields, id, revision: 1 });
      break;
    }
    case "slot.delete":
      if (records.bookings.some((booking) => booking.slotId === id && booking.status === "scheduled")) return invalid("Pindahkan atau batalkan sesi sebelum menghapus slot.");
      records.slots = records.slots.filter((slot) => slot.id !== id);
      break;
    case "booking.assign":
    case "booking.move":
    case "booking.cancel": {
      if (command.type !== "booking.assign" && records.bookings.find((booking) => booking.id === id)?.status !== "scheduled") return invalid("Sesi telah dibatalkan.");
      const booking = records.bookings.find((entry) => entry.id === id);
      const fields = command.type === "booking.assign" ? command.fields : {
        groupId: booking!.groupId, courseId: booking!.courseId,
        slotId: command.type === "booking.move" ? command.slotId : booking!.slotId, reason: command.reason,
      };
      const group = records.groups.find((entry) => entry.id === fields.groupId);
      if (!hasText(fields.reason)) return invalid("Isi alasan perubahan sesi.");
      if (command.type !== "booking.cancel") {
        const slot = records.slots.find((entry) => entry.id === fields.slotId);
        if (!group || group.status !== "active" || !group.courseIds.includes(fields.courseId)) return invalid("Pilih kelompok aktif dan mata kuliah yang sesuai.");
        if (!slot || records.bookings.some((entry) => entry.slotId === slot.id && entry.status === "scheduled")) return invalid("Pilih slot yang masih tersedia.");
        if (!records.certifications.some((entry) => entry.id === slot.tutorId && entry.courseIds.includes(fields.courseId))) return invalid("Tutor belum memiliki sertifikasi untuk mata kuliah ini.");
        if (command.type === "booking.assign" && group.used >= group.total) return invalid("Kuota pertemuan kelompok telah habis.");
      }
      const action = command.type === "booking.assign" ? "Sesi ditugaskan" : command.type === "booking.move" ? "Sesi dipindahkan" : "Sesi dibatalkan";
      if (booking) Object.assign(booking, fields, { status: command.type === "booking.cancel" ? "cancelled" : "scheduled", revision: booking.revision + 1 });
      else records.bookings.unshift({ ...fields, id, status: "scheduled", revision: 1 });
      records.audits.unshift({ id: `${id}-audit-${records.audits.length}`, action, reason: fields.reason.trim(), target: group?.name ?? "Sesi tutorial" });
      break;
    }
    case "tutor.courses": {
      if (!validCourses(command.courseIds)) return invalid("Pilih mata kuliah yang tersedia.");
      const certification = records.certifications.find((entry) => entry.id === id)!;
      certification.courseIds = command.courseIds;
      certification.revision++;
      break;
    }
    case "broadcast.send": {
      const { fields } = command;
      const error = validateBroadcast(records, fields);
      if (error) return invalid(error);
      const link = fields.link.trim() || "/dashboard";
      const attempted = getBroadcastAudience(records, fields);
      records.broadcasts.unshift({ ...fields, title: fields.title.trim(), body: fields.body.trim(), link,
        id, attempted, succeeded: attempted, failed: 0, createdAt: fixtureClock, revision: 1 });
      break;
    }
    case "pka.announcement.save": {
      const { title, body } = command.fields;
      if (!hasText(title) || !hasText(body)) return invalid("Isi judul dan isi pengumuman.");
      const announcement = records.announcements.find((entry) => entry.id === id);
      const fields = { title: title.trim(), body: body.trim() };
      if (announcement) Object.assign(announcement, fields, { revision: announcement.revision + 1 });
      else records.announcements.unshift({ ...fields, id, revision: 1, pinned: false, archived: false, sentAt: fixtureClock, recipients: records.registrations.length });
      break;
    }
    case "pka.announcement.pin":
    case "pka.announcement.archive": {
      const announcement = records.announcements.find((entry) => entry.id === id)!;
      if (command.type === "pka.announcement.pin") {
        if (announcement.archived) return invalid("Pulihkan pengumuman sebelum menyematkannya.");
        announcement.pinned = !announcement.pinned;
      } else {
        announcement.archived = !announcement.archived;
        if (announcement.archived) announcement.pinned = false;
      }
      announcement.revision++;
      break;
    }
    case "pka.session.save": {
      const { fields } = command;
      if (!hasText(fields.title) || !validDateTime(fields.sessionAt)) return invalid("Isi judul, tanggal, dan jam sesi yang valid.");
      if (fields.meetLink && !/^https:\/\/[^\s]+$/.test(fields.meetLink.trim())) return invalid("Tautan Meet harus diawali https://.");
      const session = records.sessions.find((entry) => entry.id === id);
      const normalized = { ...fields, title: fields.title.trim(), meetLink: fields.meetLink.trim() };
      const recipients = later(fields.sessionAt, fixtureClock) ? records.registrations.length : 0;
      if (session) Object.assign(session, normalized, { revision: session.revision + 1 });
      else records.sessions.unshift({ ...normalized, id, revision: 1, recipients });
      break;
    }
    case "pka.session.delete":
      records.sessions = records.sessions.filter((entry) => entry.id !== id);
      break;
    default: {
      const bundle = records.bundles.find((entry) => entry.id === id)!;
      const locked = bundle.status === "published" || bundle.status === "withdrawn";
      if (command.type === "bundle.item" || command.type === "bundle.content") {
        const item = bundle.items.find((entry) => entry.id === command.itemId);
        if (!item || locked) return invalid("Konten ini tidak dapat direvisi.");
        if (bundle.pdf === "pending") return invalid("Tunggu hasil verifikasi PDF.");
        if (command.type === "bundle.item") {
          item.status = command.status;
          item.note = command.note.trim();
          if (bundle.status === "approved") bundle.status = "validated";
        } else {
          if (!hasText(command.title) || !hasText(command.content)) return invalid("Isi judul dan konten.");
          item.title = command.title.trim();
          item.content = command.content.trim();
          bundle.items.forEach((entry) => { entry.status = "pending"; entry.note = ""; });
          bundle.status = "validated";
          bundle.reason = "";
          bundle.criteria = [];
          bundle.pdf = "none";
        }
      } else if (command.type === "bundle.decide") {
        if (locked || bundle.pdf === "pending") return invalid("Keputusan belum bisa disimpan.");
        if (bundle.kind === "idea") {
          if (command.status === "changes_requested") return invalid("Pilih setujui atau tolak untuk Idea Bundle.");
          if (bundle.items.some((item) => item.status === "pending")) return invalid("Tinjau setiap ide terlebih dahulu.");
        }
        if (command.status === "approved" && bundle.items.some((item) => item.status !== "approved")) return invalid("Setujui setiap bagian terlebih dahulu.");
        if (command.status === "approved" && bundle.kind === "product" &&
          (!productCriteria.every((criterion) => command.criteria.includes(criterion)) || bundle.pdf !== "ready")) return invalid("Lengkapi kriteria pedagogis dan verifikasi PDF.");
        if (command.status !== "approved" && !hasText(command.reason)) return invalid("Isi alasan keputusan review.");
        bundle.status = command.status;
        bundle.reason = command.reason.trim();
        bundle.criteria = command.criteria;
      } else if (command.type === "bundle.publish") {
        if (bundle.status !== "approved") return invalid("Simpan persetujuan sebelum menerbitkan bundle.");
        bundle.status = "published";
      } else if (command.type === "bundle.withdraw") {
        if (bundle.status !== "published") return invalid("Publikasi belum tersedia untuk ditarik.");
        bundle.status = "withdrawn";
      } else if (command.type === "bundle.delete") {
        if (locked || bundle.pdf === "pending") return invalid("Bundle terkunci.");
        records.bundles = records.bundles.filter((entry) => entry.id !== id);
      } else if (command.type === "bundle.pdf.request") {
        if (bundle.kind !== "product" || locked || bundle.pdf !== "none") return invalid("Verifikasi PDF belum dapat dimulai.");
        bundle.pdf = "pending";
      } else if (command.type === "bundle.pdf.poll") {
        if (bundle.pdf !== "pending") return invalid("Tidak ada verifikasi PDF yang antre.");
        bundle.pdf = "ready";
      }
      bundle.revision++;
    }
  }
  return saved(id);
}

export function createAdministrationStore(actor: AdministrationActor, scenario: AdministrationScenario) {
  const authorized = actor.role === "admin";
  let records = seedAdministration(actor, !authorized || scenario === "empty");
  if (!authorized) records.users = [];
  let sequence = 1;
  let readError = scenario === "error";
  let conflictPending = scenario === "error";
  let unknownDelivery = scenario === "error";
  let pendingDelivery: string | undefined;
  const receipts = new Map<string, { signature: string; result: AdministrationReceipt }>();
  const listeners = new Set<() => void>();
  let snapshot = { records, readError, authorized, pendingDelivery };
  const notify = () => {
    snapshot = { records, readError, authorized, pendingDelivery };
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    retryRead() {
      if (!authorized || !readError) return;
      readError = false;
      notify();
    },
    receipt(requestId: string) { return authorized ? receipts.get(requestId)?.result : undefined; },
    confirmDelivery(requestId: string) {
      const result = authorized ? receipts.get(requestId)?.result : undefined;
      if (result && pendingDelivery === requestId) {
        pendingDelivery = undefined;
        notify();
      }
      return result;
    },
    requestId() { return `academic-admin-${sequence++}`; },
    commit(requestId: string, command: AdministrationCommand): AdministrationResult {
      if (!authorized) return { status: "denied", message: "Akses admin diperlukan." };
      if (readError) return invalid("Muat ulang data sebelum menyimpan perubahan.");
      const signature = JSON.stringify(command);
      const previous = receipts.get(requestId);
      if (previous) return previous.signature === signature ? previous.result : invalid("Permintaan ini sudah digunakan.");
      const sendsDelivery = isDelivery(command, records);
      if (sendsDelivery && pendingDelivery) return invalid("Periksa hasil pengiriman sebelumnya terlebih dahulu.");
      const id = "id" in command && command.id ? command.id : requestId;
      if ("id" in command && command.id) {
        const collection = collections[command.type as keyof typeof collections];
        const record = records[collection].find((entry) => entry.id === id);
        if (!record) return missing();
        if (record.revision !== command.revision) return unresolvedConflict(record.revision);
        if (conflictPending) {
          conflictPending = false;
          records = JSON.parse(JSON.stringify(records)) as AdministrationRecords;
          records[collection].find((entry) => entry.id === id)!.revision++;
          const revision = record.revision + 1;
          notify();
          return unresolvedConflict(revision);
        }
      }
      const draft: AdministrationRecords = JSON.parse(JSON.stringify(records));
      const result = updateRecords(draft, command, actor.id, id);
      if (result.status !== "saved") return result;
      records = draft;
      receipts.set(requestId, { result, signature });
      if (unknownDelivery && sendsDelivery) {
        unknownDelivery = false;
        pendingDelivery = requestId;
        notify();
        return { status: "uncertain", message: "Status pengiriman belum diketahui. Periksa hasil sebelum mengirim ulang." };
      }
      notify();
      return result;
    },
  };
}

export type AdministrationStore = ReturnType<typeof createAdministrationStore>;
