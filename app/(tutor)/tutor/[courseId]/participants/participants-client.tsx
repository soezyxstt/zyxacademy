"use client";

import { useMemo, useState } from "react";
import { Users, UserCheck, Layers, Shield } from "lucide-react";
import { SearchBar } from "@/components/ui/search-bar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { useUrlTab } from "@/hooks/use-url-tab";
import { useTranslations, useAppLocale } from "@/lib/i18n/client";
import type {
  TutorCourseParticipantsPayload,
  CourseParticipantItem,
  CourseGroupItem,
} from "@/lib/tutor/participant-read-model";

interface ParticipantsClientProps {
  data: TutorCourseParticipantsPayload;
}

export function ParticipantsClient({ data }: ParticipantsClientProps) {
  const t = useTranslations("tutor.participants");
  const { locale } = useAppLocale();
  const [search, setSearch] = useState("");
  const [enrollmentFilter, setEnrollmentFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useUrlTab("tab", "participants");

  const normalizedSearch = search.trim().toLowerCase();
  const formatParticipantDate = (value: Date | string) => new Intl.DateTimeFormat(locale === "en" ? "en-US" : "id-ID", {
    dateStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));

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
    <div className="space-y-4">
      {/* ── KPI Strip ── */}
      <AdminStatStrip className="grid-cols-2 sm:grid-cols-4 gap-3 rounded-none border-x-0 bg-transparent [&>*]:bg-transparent [&>*]:px-0">
        <AdminStatStripItem icon={Users} label={t("totalParticipants")} value={data.summary.totalParticipants} caption={t("activeEnrolled")} />
        <AdminStatStripItem icon={UserCheck} label={t("directEnrollments")} value={data.summary.directEnrollmentsCount} caption={t("individualParticipants")} />
        <AdminStatStripItem icon={Layers} label={t("groupMembers")} value={data.summary.groupParticipantsCount} caption={t("groupParticipants")} />
        <AdminStatStripItem icon={Shield} label={t("activeGroups")} value={data.summary.activeGroupsCount} caption={t("studyGroups")} />
      </AdminStatStrip>

      {/* ── Tabs & Search Toolbar ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="space-y-3">
          <TabsList>
            <TabsTrigger value="participants">
              {t("participants")}
            </TabsTrigger>
            <TabsTrigger value="groups">
              {t("groups")}
            </TabsTrigger>
          </TabsList>

          {/* Search & Filter Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <SearchBar
              collapsible
              size="sm"
              aria-label={t("search")}
              placeholder={t("search")}
              value={search}
              onSearch={setSearch}
              containerClassName="max-w-64"
            />

            {activeTab === "participants" && (
              <Select value={enrollmentFilter} onValueChange={setEnrollmentFilter}>
                <SelectTrigger aria-label={t("enrollmentFilter")} variant="inline">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allTypes")}</SelectItem>
                  <SelectItem value="direct">{t("direct")}</SelectItem>
                  <SelectItem value="group">{t("group")}</SelectItem>
                  <SelectItem value="both">{t("both")}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* ── Tab 1: Participants List ── */}
        <TabsContent value="participants" className="mt-0 space-y-4">
          {filteredParticipants.length === 0 ? (
            <div className="border-t border-border">
              <AdminEmptyState icon={Users} title={t("noParticipantsFound")}
                description={search || enrollmentFilter !== "all"
                  ? t("changeFilters")
                  : t("noActiveParticipants")} className="px-4 py-5" />
            </div>
          ) : (
            <div className="border-y border-border">
              <table role="table" className="block w-full text-left text-body-sm md:table">
                <thead role="rowgroup" className="sr-only border-b border-border bg-muted/40 text-body-xs font-semibold text-muted-foreground md:not-sr-only md:table-header-group">
                  <tr role="row">
                    <th role="columnheader" scope="col" className="px-3 py-3">{t("participants")}</th>
                    <th role="columnheader" scope="col" className="px-3 py-3">{t("accessType")}</th>
                    <th role="columnheader" scope="col" className="px-3 py-3">{t("groups")}</th>
                    <th role="columnheader" scope="col" className="px-3 py-3">{t("enrolledSince")}</th>
                    <th role="columnheader" scope="col" className="px-3 py-3">{t("validity")}</th>
                  </tr>
                </thead>
                <tbody role="rowgroup" className="block divide-y divide-border md:table-row-group">
                  {filteredParticipants.map((p) => (
                    <tr role="row" key={p.userId} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-2 py-3 hover:bg-muted/20 md:table-row md:p-0">
                      <td role="cell" className="col-span-2 wrap-anywhere md:px-3 md:py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-body-xs font-bold text-primary">
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="break-words font-medium text-foreground">{p.name}</p>
                            <p className="break-all text-body-xs text-muted-foreground">{p.email}</p>
                          </div>
                        </div>
                      </td>
                      <td role="cell" className="col-span-2 wrap-anywhere md:px-3 md:py-3">
                        {p.enrollmentType === "both" && (
                          <Badge variant="outline" className="rounded-md border-brand-primary/30 bg-brand-primary/5 text-brand-primary text-body-xs font-normal">
                            {t("directAndGroup")}
                          </Badge>
                        )}
                        {p.enrollmentType === "direct" && (
                          <Badge variant="outline" className="rounded-md border-status-success/30 bg-status-success/5 text-foreground text-body-xs font-normal">
                            {t("direct")}
                          </Badge>
                        )}
                        {p.enrollmentType === "group" && (
                          <Badge variant="outline" className="rounded-md border-border bg-muted text-muted-foreground text-body-xs font-normal">
                            {t("group")}
                          </Badge>
                        )}
                      </td>
                      <td role="cell" className="col-span-2 wrap-anywhere md:px-3 md:py-3">
                        <span className="mb-1 block text-body-xs font-semibold text-muted-foreground md:hidden">{t("groups")}</span>
                        {p.groups.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {p.groups.map((g) => (
                              <span
                                key={g.id}
                                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-body-xs text-foreground"
                              >
                                <span>{g.name}</span>
                                {g.role === "leader" && (
                                  <span className="font-semibold text-primary">({t("leader")})</span>
                                )}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-body-xs text-muted-foreground">{t("none")}</span>
                        )}
                      </td>
                      <td role="cell" className="min-w-0 wrap-anywhere text-body-xs text-muted-foreground tabular-nums md:px-3 md:py-3">
                        <span className="block font-semibold md:hidden">{t("enrolledSince")}</span>
                        {p.enrolledAt ? formatParticipantDate(p.enrolledAt) : t("notRecorded")}
                      </td>
                      <td role="cell" className="min-w-0 wrap-anywhere text-body-xs text-muted-foreground tabular-nums md:px-3 md:py-3">
                        <span className="block font-semibold md:hidden">{t("validity")}</span>
                        {p.expiresAt ? formatParticipantDate(p.expiresAt) : t("activeThisSemester")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── Tab 2: Study Groups List ── */}
        <TabsContent value="groups" className="mt-0 space-y-4">
          {filteredGroups.length === 0 ? (
            <div className="border-t border-border">
              <AdminEmptyState icon={Shield} title={t("noGroupsFound")}
                description={search
                  ? t("changeFilters")
                  : t("noActiveGroups")} className="px-4 py-5" />
            </div>
          ) : (
            <div className="divide-y divide-border border-y border-border">
              {filteredGroups.map((grp) => (
                <div
                  key={grp.id}
                  className="grid gap-3 py-3 lg:grid-cols-2 lg:gap-6"
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

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-xs text-muted-foreground">
                      <span>
                        {t("quota")}: <strong className="text-foreground tabular-nums">{grp.usedQuotaSessions} / {grp.totalQuotaSessions}</strong> {t("sessions")}
                      </span>
                      <span>
                        {t("weekly")}: <strong className="text-foreground tabular-nums">{grp.weeklyQuotaSessions}</strong> {t("sessions")}
                      </span>
                    </div>

                    {grp.representative && (
                      <div className="text-body-xs">
                        <span className="text-muted-foreground">{t("representative")}: </span>
                        <strong className="text-foreground">{grp.representative.name}</strong>
                        {grp.representative.role === "leader" && (
                          <span className="ml-1 text-primary">({t("leader")})</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Members list */}
                  <div className="space-y-2">
                    <p className="text-body-xs font-semibold text-muted-foreground">
                      {t("members", { count: grp.members.length })}
                    </p>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {grp.members.map((member) => (
                        <div
                          key={member.userId}
                          className="flex items-center justify-between gap-2 py-1 text-body-xs"
                        >
                          <span className="text-foreground break-words">{member.name}</span>
                          {member.role === "leader" ? (
                            <Badge variant="outline" className="rounded-md border-primary/30 bg-primary/5 text-primary text-[10px] shrink-0 font-medium">
                              {t("leader")}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-[10px] shrink-0">{t("member")}</span>
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
