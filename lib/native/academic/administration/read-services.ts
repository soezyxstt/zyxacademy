import "server-only";
import { getAdminStudyGroups } from "@/app/(admin)/admin/(academic)/groups/actions";
import { getNotificationHistoryAction } from "@/app/(admin)/admin/(academic)/notifications/actions";
import { getAdminScheduleData } from "@/app/(admin)/admin/(academic)/schedules/actions";
import { getEnrollmentTokens } from "@/app/(admin)/admin/(academic)/tokens/actions";
import { getPkaAnnouncementsAction, getPkaRegistrationsAction, getPkaSchedulesAction } from "@/app/(admin)/admin/(academic)/tutorial-pka/actions";
import { getAdminUsersData } from "@/app/(admin)/admin/(academic)/users/actions";
import { getCanonicalCourseSlug, matchesCourseIdentity, resolveBundleCourseIdentity, resolveCourseIdentity } from "@/lib/admin/course-identity";
import { getAuthSession } from "@/lib/auth-session";
import { ensureLegacyIdentity } from "@/lib/auth/legacy-identity";
import { hasPeran } from "@/lib/auth/request-cache";
import { getDiktatPdfContext } from "@/lib/bundle/product-diktat-evidence";
import { getProductBundleImport } from "@/lib/bundle/product-staging";
import { getIdeaBundleImport } from "@/lib/bundle/staging";
import { formatJakartaDatetimeLocal, toIsoTimestamp } from "@/lib/date-utils";
import type { ReviewKind } from "@/packages/native-parity/academic/administration/fixtures";
import type { LiveField, LivePage, LiveRow } from "@/packages/native-parity/academic/administration/live";
import { announcementRevision } from "./announcement-edit-transaction";
import type { AdministrationQuery, AdministrationReadServices } from "./handle-read";

const listPageSize = 20;
const field = (label: string, value: string | number | null | undefined): LiveField => ({
  label, value: (typeof value === "string" ? value.trim() : value?.toString()) || "Belum tersedia",
});
function rowsPage(rows: LiveRow[], nextPage = false, summary?: LiveField[]): LivePage {
  return { type: "page", rows, nextPage, ...(summary?.length ? { summary } : {}) };
}
function paginate(rows: LiveRow[], page: number, summary?: LiveField[]) {
  return rowsPage(rows.slice((page - 1) * listPageSize, page * listPageSize), rows.length > page * listPageSize, summary);
}
function matches(term: string, values: (string | null | undefined)[]) {
  const query = term.toLocaleLowerCase("id-ID");
  return !query || values.some((value) => value?.toLocaleLowerCase("id-ID").includes(query));
}
const roleLabels = { admin: "Admin", tutor: "Tutor", murid: "Peserta" };
const groupStatus: Record<string, string> = { active: "Aktif", inactive: "Nonaktif", completed: "Selesai", archived: "Diarsipkan" };
const bundleStatus: Record<string, string> = {
  received: "Diterima", validated: "Tervalidasi", rejected: "Ditolak", approved: "Disetujui",
  draft: "Draf", published: "Terbit", withdrawn: "Ditarik", discarding: "Sedang dihapus",
};
const itemType: Record<string, string> = {
  idea: "Ide", ko: "Ide", concept: "Konsep", source_pack: "Paket sumber", article: "Artikel", diktat: "Diktat",
  flashcard: "Flashcard", flashcard_set: "Set flashcard", question: "Soal", solution: "Pembahasan", assessment_blueprint: "Kisi-kisi",
};
const eventType: Record<string, string> = { official_exam: "Ujian resmi", tryout: "Tryout", quiz: "Kuis", general: "Umum" };

function jakDateTime(value: unknown) {
  const timestamp = toIsoTimestamp(value);
  return timestamp ? `${formatJakartaDatetimeLocal(new Date(timestamp)).replace("T", " ")} WIB` : undefined;
}

async function schedules(query: AdministrationQuery) {
  const schedule = await getAdminScheduleData(query.week);
  const span = [field("Periode", `${schedule.weekRange.startIso} sampai ${schedule.weekRange.endIso}`)];
  if (query.tab === "tutors") {
    return paginate(schedule.tutors.map((entry) => ({
      id: entry.id, title: entry.name, subtitle: entry.tutorCourses.map((assignment) => assignment.course.title).join(", "),
      detail: `${schedule.slots.filter((slot) => slot.tutorId === entry.id).length} slot`,
    })), query.page, span);
  }
  if (query.tab === "tickets") {
    return paginate(schedule.tickets.map((entry) => ({
      id: entry.id, title: entry.type === "cancellation" ? "Pembatalan sesi" : "Perubahan jadwal",
      subtitle: entry.booking.group?.name ?? entry.booking.course?.title,
      detail: entry.status === "approved" ? "Disetujui" : entry.status === "rejected" ? "Ditolak" : "Menunggu",
      fields: [field("Alasan", entry.reason), field("Pemohon", entry.requestedBy?.name), field("Keputusan", entry.decisionNotes)],
    })), query.page, span);
  }
  if (query.tab === "audit") {
    return paginate(schedule.auditLogs.map((entry) => ({
      id: entry.id, title: entry.summary, subtitle: entry.booking.group?.name ?? entry.booking.course?.title,
      detail: jakDateTime(entry.createdAt), fields: [field("Pelaku", entry.actor?.name)],
    })), query.page, span);
  }
  const events = schedule.academicSchedules.map((entry) => ({
    id: entry.id, title: entry.title, subtitle: entry.course?.title ?? "Semua mata kuliah",
    detail: jakDateTime(entry.startDate), sort: formatJakartaDatetimeLocal(entry.startDate),
    fields: [field("Jenis", eventType[entry.type]), field("Lokasi", entry.location), field("Keterangan", entry.description)],
  }));
  const slots = schedule.slots.map((entry) => ({
    id: entry.id, title: entry.booking?.group?.name ?? entry.tutor.name,
    subtitle: entry.booking?.course?.title ?? (entry.mode === "offline" ? "Tatap muka" : "Daring"),
    detail: `${entry.sessionDate} ${entry.startTime} WIB`, sort: `${entry.sessionDate}T${entry.startTime}`,
    fields: [field("Tutor", entry.tutor.name), field("Lokasi", entry.location), field("Jam selesai", entry.endTime),
      field("Status", entry.booking ? "Dipesan" : "Tersedia")],
  }));
  const rows = query.tab === "academic" ? events : [...events, ...slots];
  return paginate(rows.sort((left, right) => left.sort.localeCompare(right.sort)).map(({ sort: _sort, ...row }) => row), query.page, span);
}

async function readBundle(kind: ReviewKind, slug: string, bundleId: string, page: number) {
  const [identity, bundle] = await Promise.all([
    resolveCourseIdentity(slug), kind === "idea" ? getIdeaBundleImport(bundleId) : getProductBundleImport(bundleId),
  ]);
  if (!identity || !bundle || !matchesCourseIdentity(bundle.courseId, identity)) return null;
  return paginate([
    {
      id: bundle.id, title: bundle.bundleId, subtitle: identity.title, detail: bundleStatus[bundle.status],
      fields: [field("Versi", bundle.version), field("Diperbarui", jakDateTime(bundle.updatedAt)), field("Jumlah item", bundle.items.length)],
    },
    ...bundle.items.map((entry) => ({
      id: entry.id, title: entry.entityId, subtitle: itemType[entry.entityType] ?? "Item bundle",
      detail: bundleStatus[entry.status] ?? "Menunggu review", fields: [field("Versi item", entry.entityVersion)],
      ...(kind === "product" && bundle.status === "draft" && (bundle.version === 2 || bundle.version === 3) && entry.entityType === "diktat" ? {
        pdf: { importId: bundle.id, productId: entry.entityId, expectedRevision: bundle.checksum },
      } : {}),
    })),
  ], page);
}

export const administrationReadServices: AdministrationReadServices = {
  session: getAuthSession,
  async hasAdmin(id) {
    await ensureLegacyIdentity(id);
    return hasPeran(id, "admin");
  },
  bundle: readBundle,
  async pdfStatus(slug, { importId, productId, expectedRevision }, attemptId) {
    const [identity, bundle] = await Promise.all([resolveCourseIdentity(slug), getProductBundleImport(importId)]);
    if (!identity || !bundle || !matchesCourseIdentity(bundle.courseId, identity)) return null;
    if (bundle.checksum !== expectedRevision) return "stale";
    if (bundle.version !== 2 && bundle.version !== 3) return null;
    try {
      const status = await getDiktatPdfContext(importId, productId, expectedRevision);
      if (!matchesCourseIdentity(status.row.courseId, identity)) return null;
      if (!status.evidence?.id) return status.status === "stale" ? "stale" : "unavailable";
      if (status.evidence.id !== attemptId) return "stale";
      return status.status === "missing" ? "unavailable" : status.status;
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (/STALE|CONFLICT|CHECKSUM_MISMATCH/.test(code)) return "stale";
      if (code === "PRODUCT_BUNDLE_NOT_FOUND" || code === "PRODUCT_DIKTAT_NOT_FOUND") return null;
      throw error;
    }
  },
  async courseSlug(id) {
    const identity = await resolveCourseIdentity(id);
    return identity ? getCanonicalCourseSlug(identity) : null;
  },
  async bundleCourseSlug(kind, id) {
    const identity = await resolveBundleCourseIdentity(id, kind);
    return identity ? getCanonicalCourseSlug(identity) : null;
  },
  async list(section, query) {
    switch (section) {
      case "users": {
        const { users, stats, total, page, currentUserId } = await getAdminUsersData({
          page: query.page, search: query.search, role: query.role, status: query.status,
        });
        return rowsPage(users.map((entry) => ({
          id: entry.id, title: entry.name, subtitle: entry.email,
          detail: [entry.id === currentUserId ? "Anda" : "", entry.status === "suspended" ? "Ditangguhkan" : ""].filter(Boolean).join(" · "),
          fields: [field("Peran", entry.roles.map((role) => roleLabels[role]).join(", ")),
            field("Status", entry.status === "suspended" ? "Ditangguhkan" : "Aktif"), field("Terdaftar", jakDateTime(entry.createdAt))],
        })), total > page * 30, [field("Total", stats.totalUsers), field("Tutor", stats.tutorCount), field("Ditangguhkan", stats.suspendedCount)]);
      }
      case "groups": {
        const { groups, total, page, stats } = await getAdminStudyGroups(query);
        return rowsPage(groups.map((entry) => ({
          id: entry.id, title: entry.name, subtitle: entry.courses.map((course) => course.title).join(", "),
          detail: `${entry.memberCount} anggota`, fields: [field("Paket", entry.packageName),
            field("Kuota sesi", `${entry.usedQuotaSessions}/${entry.totalQuotaSessions}`), field("Status", groupStatus[entry.status]),
            field("Tahun ajaran", entry.academicYear), field("Catatan", entry.notes)],
        })), total > page * 25, [field("Kelompok aktif", stats.activeGroups), field("Anggota", stats.totalMembers)]);
      }
      case "tokens": {
        const entries = await getEnrollmentTokens();
        return paginate(entries.filter((entry) => matches(query.search, [entry.token, ...entry.courses.map((course) => course.title)])).map((entry) => ({
          id: entry.id, title: entry.token, subtitle: entry.courses.map((course) => course.title).join(", "),
          detail: `${entry.group?.members.length ?? 0}/${entry.capacity} terpakai`,
          fields: [field("Kelompok", entry.group?.name), field("Kedaluwarsa", jakDateTime(entry.expiresAt)),
            field("Kuota sesi", entry.group?.totalQuotaSessions), field("Batas per minggu", entry.group?.weeklyQuotaSessions)],
        })), query.page);
      }
      case "schedules":
        return schedules(query);
      case "notifications": {
        const { rows, total } = await getNotificationHistoryAction(query.page, listPageSize);
        return rowsPage(rows.map((entry) => ({
          id: entry.id, title: entry.title, subtitle: entry.userName ?? undefined, detail: jakDateTime(entry.createdAt),
          fields: [field("Isi", entry.body), field("Percobaan", entry.attempted), field("Berhasil", entry.succeeded), field("Gagal", entry.failedCount)],
        })), total > query.page * listPageSize);
      }
      case "registrations": {
        const entries = await getPkaRegistrationsAction();
        return paginate(entries.filter((entry) => matches(query.search, [entry.fullName, entry.email, entry.faculty, entry.instagramUsername])).map((entry) => ({
          id: entry.id, title: entry.fullName, subtitle: entry.faculty, detail: jakDateTime(entry.createdAt),
          fields: [field("Email", entry.email), field("Instagram", entry.instagramUsername),
            field("Nama akun", entry.accountName), field("Pengumuman", entry.receiveAnnouncements ? "Aktif" : "Nonaktif")],
        })), query.page);
      }
      case "announcements": {
        const entries = await getPkaAnnouncementsAction();
        return paginate(entries.filter((entry) => entry.isArchived === (query.status === "archived")).sort((left, right) => Number(right.isPinned) - Number(left.isPinned))
          .map((entry) => ({
            id: entry.id, title: entry.title, subtitle: jakDateTime(entry.sentAt),
            detail: entry.isPinned ? "Disematkan" : undefined,
            announcementEdit: announcementRevision(entry.id, entry),
            fields: [field("Isi", entry.body), field("Penerima", entry.recipientCount)],
          })), query.page);
      }
      case "sessions": {
        const entries = await getPkaSchedulesAction();
        const now = Date.now();
        return paginate(entries.filter((entry) => query.status === "upcoming" ? entry.sessionAt.getTime() > now
          : query.status === "past" ? entry.sessionAt.getTime() <= now : true).map((entry) => ({
          id: entry.id, title: entry.title, subtitle: jakDateTime(entry.sessionAt), detail: entry.sessionAt.getTime() <= now ? "Sesi lampau" : undefined,
          fields: [field("Tautan Meet", entry.meetLink), field("Penerima", entry.recipientCount)],
        })), query.page);
      }
    }
  },
};
