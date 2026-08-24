"use client";

import { useMemo, useState } from "react";
import { Search, Users, UserCheck, Layers, Shield } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatIsoDate } from "@/lib/date-utils";
import type {
  TutorCourseParticipantsPayload,
  CourseParticipantItem,
  CourseGroupItem,
} from "@/lib/tutor/participant-read-model";

interface ParticipantsClientProps {
  data: TutorCourseParticipantsPayload;
}

export function ParticipantsClient({ data }: ParticipantsClientProps) {
  const [search, setSearch] = useState("");
  const [enrollmentFilter, setEnrollmentFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("participants");

  const normalizedSearch = search.trim().toLowerCase();

  const filteredParticipants = useMemo(() => {
    return data.participants.filter((p: CourseParticipantItem) => {
      if (enrollmentFilter !== "all" && p.enrollmentType !== enrollmentFilter) {
        return false;
      }
      if (!normalizedSearch) return true;
      const matchName = p.name.toLowerCase().includes(normalizedSearch);
      const matchEmail = p.email.toLowerCase().includes(normalizedSearch);
      const matchGroup = p.groups.some((g) => g.name.toLowerCase().includes(normalizedSearch));
      return matchName || matchEmail || matchGroup;
    });
  }, [data.participants, enrollmentFilter, normalizedSearch]);

  const filteredGroups = useMemo(() => {
    return data.groups.filter((g: CourseGroupItem) => {
      if (!normalizedSearch) return true;
      const matchName = g.name.toLowerCase().includes(normalizedSearch);
      const matchPackage = g.packageName.toLowerCase().includes(normalizedSearch);
      const matchMember = g.members.some(
        (m) =>
          m.name.toLowerCase().includes(normalizedSearch) ||
          m.email.toLowerCase().includes(normalizedSearch),
      );
      return matchName || matchPackage || matchMember;
    });
  }, [data.groups, normalizedSearch]);

  return (
    <div className="space-y-6">
      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4" />
            <span className="text-body-sm">Total peserta</span>
          </div>
          <p className="mt-2 font-heading text-h4 font-bold tabular-nums text-foreground">
            {data.summary.totalParticipants}
          </p>
          <p className="text-body-xs text-muted-foreground">Aktif terdaftar</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <UserCheck className="size-4" />
            <span className="text-body-sm">Pendaftaran langsung</span>
          </div>
          <p className="mt-2 font-heading text-h4 font-bold tabular-nums text-foreground">
            {data.summary.directEnrollmentsCount}
          </p>
          <p className="text-body-xs text-muted-foreground">Peserta individu</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Layers className="size-4" />
            <span className="text-body-sm">Anggota kelompok</span>
          </div>
          <p className="mt-2 font-heading text-h4 font-bold tabular-nums text-foreground">
            {data.summary.groupParticipantsCount}
          </p>
          <p className="text-body-xs text-muted-foreground">Peserta grup</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Shield className="size-4" />
            <span className="text-body-sm">Kelompok aktif</span>
          </div>
          <p className="mt-2 font-heading text-h4 font-bold tabular-nums text-foreground">
            {data.summary.activeGroupsCount}
          </p>
          <p className="text-body-xs text-muted-foreground">Grup belajar</p>
        </div>
      </div>

      {/* ── Tabs & Search Toolbar ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <TabsList className="h-9 rounded-lg bg-muted p-1">
            <TabsTrigger value="participants" className="rounded-md text-body-sm">
              Peserta ({data.participants.length})
            </TabsTrigger>
            <TabsTrigger value="groups" className="rounded-md text-body-sm">
              Kelompok Belajar ({data.groups.length})
            </TabsTrigger>
          </TabsList>

          {/* Search & Filter Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[140px] sm:w-64">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Cari nama, email, kelompok..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 rounded-lg pl-8 text-body-sm"
              />
            </div>

            {activeTab === "participants" && (
              <select
                aria-label="Filter tipe pendaftaran"
                value={enrollmentFilter}
                onChange={(e) => setEnrollmentFilter(e.target.value)}
                className="h-9 shrink-0 rounded-lg border border-border bg-background px-2.5 text-body-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">Semua Tipe</option>
                <option value="direct">Langsung</option>
                <option value="group">Kelompok</option>
                <option value="both">Keduanya</option>
              </select>
            )}
          </div>
        </div>

        {/* ── Tab 1: Participants List ── */}
        <TabsContent value="participants" className="mt-0 space-y-4">
          {filteredParticipants.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center">
              <Users className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-2 font-heading text-body-base font-semibold text-foreground">
                Tidak ada peserta ditemukan
              </p>
              <p className="mt-1 text-body-xs text-muted-foreground">
                {search || enrollmentFilter !== "all"
                  ? "Coba ubah filter pencarian Anda."
                  : "Belum ada peserta aktif untuk kelas ini."}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-body-sm">
                  <thead className="border-b border-border bg-muted/40 text-body-xs font-semibold text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Peserta</th>
                      <th className="px-4 py-3">Tipe Akses</th>
                      <th className="px-4 py-3">Kelompok</th>
                      <th className="px-4 py-3">Terdaftar Sejak</th>
                      <th className="px-4 py-3">Masa Berlaku</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredParticipants.map((p) => (
                      <tr key={p.userId} className="hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-body-xs font-bold text-primary">
                              {p.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-foreground truncate">{p.name}</p>
                              <p className="text-body-xs text-muted-foreground truncate">{p.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {p.enrollmentType === "both" && (
                            <Badge variant="outline" className="rounded-md border-brand-primary/30 bg-brand-primary/5 text-brand-primary text-body-xs font-normal">
                              Langsung + Kelompok
                            </Badge>
                          )}
                          {p.enrollmentType === "direct" && (
                            <Badge variant="outline" className="rounded-md border-status-success/30 bg-status-success/5 text-status-success text-body-xs font-normal">
                              Langsung
                            </Badge>
                          )}
                          {p.enrollmentType === "group" && (
                            <Badge variant="outline" className="rounded-md border-border bg-muted text-muted-foreground text-body-xs font-normal">
                              Kelompok
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {p.groups.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {p.groups.map((g) => (
                                <span
                                  key={g.id}
                                  className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-body-xs text-foreground"
                                >
                                  <span>{g.name}</span>
                                  {g.role === "leader" && (
                                    <span className="font-semibold text-primary">(Ketua)</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-body-xs text-muted-foreground">Tidak ada</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-body-xs text-muted-foreground tabular-nums">
                          {p.enrolledAt ? formatIsoDate(p.enrolledAt) : "Tidak tercatat"}
                        </td>
                        <td className="px-4 py-3 text-body-xs text-muted-foreground tabular-nums">
                          {p.expiresAt ? formatIsoDate(p.expiresAt) : "Aktif semester"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Tab 2: Study Groups List ── */}
        <TabsContent value="groups" className="mt-0 space-y-4">
          {filteredGroups.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center">
              <Shield className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-2 font-heading text-body-base font-semibold text-foreground">
                Tidak ada kelompok ditemukan
              </p>
              <p className="mt-1 text-body-xs text-muted-foreground">
                {search
                  ? "Coba ubah filter pencarian Anda."
                  : "Belum ada kelompok belajar aktif untuk kelas ini."}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {filteredGroups.map((grp) => (
                <div
                  key={grp.id}
                  className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="font-heading text-body-base font-bold text-foreground">
                          {grp.name}
                        </h2>
                        <p className="text-body-xs text-muted-foreground">{grp.packageName}</p>
                      </div>
                      <Badge variant="outline" className="rounded-md text-body-xs font-normal shrink-0">
                        {grp.academicYear} · {grp.semester}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-4 text-body-xs text-muted-foreground">
                      <span>
                        Kuota: <strong className="text-foreground tabular-nums">{grp.usedQuotaSessions} / {grp.totalQuotaSessions}</strong> sesi
                      </span>
                      <span>
                        Mingguan: <strong className="text-foreground tabular-nums">{grp.weeklyQuotaSessions}</strong> sesi
                      </span>
                    </div>

                    {grp.representative && (
                      <div className="rounded-lg bg-muted/40 p-2 text-body-xs">
                        <span className="text-muted-foreground">Perwakilan: </span>
                        <strong className="text-foreground">{grp.representative.name}</strong>
                        {grp.representative.role === "leader" && (
                          <span className="ml-1 text-primary">(Ketua)</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Members list */}
                  <div className="border-t border-border pt-3 space-y-2">
                    <p className="text-body-xs font-semibold text-muted-foreground">
                      Anggota ({grp.members.length})
                    </p>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {grp.members.map((member) => (
                        <div
                          key={member.userId}
                          className="flex items-center justify-between gap-2 rounded-md bg-muted/20 px-2 py-1 text-body-xs"
                        >
                          <span className="text-foreground truncate">{member.name}</span>
                          {member.role === "leader" ? (
                            <Badge variant="outline" className="rounded-md border-primary/30 bg-primary/5 text-primary text-[10px] shrink-0 font-medium">
                              Ketua
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-[10px] shrink-0">Anggota</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
