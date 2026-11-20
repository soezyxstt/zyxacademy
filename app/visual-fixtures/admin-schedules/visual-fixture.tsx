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
              courses: [
                { id: "ma1101", title: "Matematika I", category: "tpb" },
                { id: "fi1101", title: "Fisika Dasar I", category: "tpb" },
              ],
              tutors: [
                { id: "t-1", name: "Adi Haditya Nursyam", email: "adi@zyx.id" },
                { id: "t-2", name: "Heidi Schan Andriana", email: "heidi@zyx.id" },
              ],
              groups: [
                { id: "g-1", name: "TPB-A1", packageName: "TPB Premium", remainingQuota: 4 },
              ],
              slots: [],
              bookings: [],
              tickets: [],
              auditLogs: [],
              academicSchedules: [
                {
                  id: "ac-1",
                  title: "UTS Matematika I",
                  category: "uts",
                  courseId: "ma1101",
                  startAt: "2026-11-18T09:00:00+07:00",
                  endAt: "2026-11-18T11:00:00+07:00",
                  location: "Sabuga",
                  description: null,
                  createdBy: "admin",
                },
              ],
              weekRange: { startIso: "2026-11-16", endIso: "2026-11-22" },
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
