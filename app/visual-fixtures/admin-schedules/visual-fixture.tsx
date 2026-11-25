"use client";

import {
  CalendarDays,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  Library,
  Newspaper,
  Settings,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { AcademicSchedulesDashboard } from "@/components/admin/academic-schedules-dashboard";
import { NavCollapsible, NavItem } from "@/components/sidebar-shell";
import { Logo } from "@/components/logo";

const calculus = { id: "ma1101", title: "Matematika I", category: "tpb" };
const physics = { id: "fi1101", title: "Fisika Dasar I", category: "tpb" };
const tutor = {
  id: "t-1",
  name: "Adi Haditya Nursyam",
  email: "adi@zyx.id",
  tutorCourses: [{ courseId: calculus.id, course: calculus }],
};
const group = { id: "g-1", name: "TPB-A1", packageName: "TPB Premium", remainingQuota: 4 };
const bookingContext = { group, course: calculus };

export function AdminSchedulesVisualFixture() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card/40 px-3 py-4 md:flex">
        <div className="mb-4 px-2">
          <Logo />
        </div>
        <div className="space-y-1 text-body-sm">
          <NavItem href="#dashboard" icon={LayoutDashboard} label="Panel admin" collapsed={false} />
          <NavItem href="#blog" icon={Newspaper} label="Kelola blog" collapsed={false} />
          <NavCollapsible icon={GraduationCap} label="Akademik" defaultOpen collapsed={false}>
            <NavItem href="#courses" icon={GraduationCap} label="Mata kuliah" collapsed={false} />
            <NavItem href="#schedules" icon={CalendarDays} label="Jadwal" active collapsed={false} />
            <NavItem href="#questions" icon={Library} label="Bank soal" collapsed={false} />
          </NavCollapsible>
          <NavItem href="#tools" icon={Wrench} label="Alat & pesan" collapsed={false} />
          <NavCollapsible icon={Users} label="Pengguna dan akses" defaultOpen collapsed={false}>
            <NavItem href="#users" icon={UserCog} label="Pengguna" collapsed={false} />
            <NavItem href="#groups" icon={Users} label="Kelompok belajar" collapsed={false} />
            <NavItem href="#tokens" icon={KeyRound} label="Token" collapsed={false} />
          </NavCollapsible>
          <NavItem href="#ops" icon={Settings} label="Sistem & ops" collapsed={false} />
        </div>
      </aside>

      <main id="main-content" className="min-w-0 flex-1">
        <ApplicationPage>
          <PageHeader title="Jadwal bersama" />
          <AcademicSchedulesDashboard
            initialData={{
              courses: [calculus, physics],
              tutors: [
                tutor,
                { id: "t-2", name: "Heidi Schan Andriana", email: "heidi@zyx.id" },
              ],
              groups: [group],
              slots: [],
              bookings: [],
              tickets: [
                {
                  id: "req-1",
                  type: "reschedule",
                  status: "pending",
                  reason: "Sebagian anggota kelompok mengikuti praktikum pada waktu yang sama.",
                  createdAt: "2026-11-23T11:00:00+07:00",
                  booking: bookingContext,
                  tutor,
                },
                {
                  id: "req-2",
                  type: "cancellation",
                  status: "approved",
                  reason: "Sesi digabung dengan kelas latihan pekan ini.",
                  createdAt: "2026-11-23T09:00:00+07:00",
                  booking: bookingContext,
                  tutor,
                },
              ],
              auditLogs: [
                {
                  id: "log-1",
                  summary: "Jadwal tutorial dipindahkan ke Rabu pukul 13.00 WIB.",
                  createdAt: "2026-11-23T12:00:00+07:00",
                  booking: bookingContext,
                  actor: { name: "Admin Demo" },
                },
                {
                  id: "log-2",
                  summary: "Undangan tutorial dikirim ke peserta.",
                  createdAt: "2026-11-23T12:30:00+07:00",
                  booking: bookingContext,
                  actor: null,
                },
              ],
              academicSchedules: [
                {
                  id: "ac-1",
                  title: "UTS Matematika I",
                  type: "official_exam",
                  status: "published",
                  courseId: calculus.id,
                  course: calculus,
                  startDate: "2026-11-24T09:00:00+07:00",
                  endDate: "2026-11-24T11:00:00+07:00",
                  location: "Sabuga",
                  description: null,
                  createdBy: "admin",
                },
                {
                  id: "ac-2",
                  title: "Tryout Fisika Dasar I dan pembahasan soal",
                  type: "tryout",
                  status: "published",
                  courseId: physics.id,
                  course: physics,
                  startDate: "2026-11-24T13:00:00+07:00",
                  endDate: null,
                  location: "Ruang 203",
                  description: "Bawa alat tulis untuk mengerjakan latihan dan mencatat pembahasan.",
                  createdBy: "admin",
                },
              ],
              weekRange: { startIso: "2026-11-23", endIso: "2026-11-29" },
              legacyNullDateSlotCount: 0,
              coverage: [
                { tutorId: "t-1", tutorName: "Adi Haditya Nursyam", available: 0 },
                { tutorId: "t-2", tutorName: "Heidi Schan Andriana", available: 0 },
              ],
            }}
          />
        </ApplicationPage>
      </main>
    </div>
  );
}
