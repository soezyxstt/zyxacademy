"use client";

import { useState, useEffect, useRef } from "react";
import {
  Users,
  Plus,
  RefreshCw,
  BookOpen,
  GraduationCap,
  CheckCircle2,
  Trash2,
  Edit3,
  Eye,
  UserPlus,
  UserMinus,
  KeyRound,
  Copy,
  Check,
  Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { AdminTable, AdminTableHead } from "@/components/admin/table";
import { AdminErrorState } from "@/components/admin/state-panels";
import { adminListRequestState, scheduleAdminListRequest } from "@/lib/admin/list-request";
import { StatusBadge } from "@/components/admin/status-badges";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { SearchBar } from "@/components/ui/search-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  getAdminStudyGroups,
  getAdminGroupDetail,
  createStudyGroup,
  updateStudyGroup,
  deleteStudyGroup,
  addGroupMember,
  removeGroupMember,
  searchStudents,
} from "@/app/(admin)/admin/(academic)/groups/actions";
import { PACKAGE_PRESETS, type PackageType } from "@/lib/group-constants";
import { formatIsoDate } from "@/lib/date-utils";
import { useTranslations } from "@/lib/i18n/client";

type GroupItem = {
  id: string;
  name: string;
  packageType: string;
  packageName: string;
  totalQuotaSessions: number;
  weeklyQuotaSessions: number;
  usedQuotaSessions: number;
  remainingQuota: number;
  weeklyUsedSessions?: number;
  weeklyStats?: Array<{
    weekStartIso: string;
    label: string;
    booked: number;
    attended: number;
    missed: number;
    cancelled: number;
  }>;
  academicYear: string;
  semester: string;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  courses: {
    id: string;
    title: string;
    category?: string | null;
  }[];
  members: {
    id: string;
    userId: string;
    role: string;
    joinedAt: Date;
    user: {
      id: string;
      name: string;
      email: string;
      image: string | null;
      role: string | null;
    };
  }[];
  memberCount: number;
  bookingsCount: number;
};

type CourseOption = {
  id: string;
  title: string;
  category?: string | null;
};

type Props = {
  initialGroups: GroupItem[];
  coursesList: CourseOption[];
  initialTotal: number;
  initialStats: { totalGroups: number; activeGroups: number; totalMembers: number; avgQuotaUsed: number };
};

export function GroupsDashboard({ initialGroups, coursesList, initialTotal, initialStats }: Props) {
  const translate = useTranslations("adminOps");

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [packageFilter, setPackageFilter] = useState<string>("all");
  const [courseFilter, setCourseFilter] = useState<string>("all");

  // Modal States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupItem | null>(null);
  const [detailGroup, setDetailGroup] = useState<NonNullable<Awaited<ReturnType<typeof getAdminGroupDetail>>> | null>(null);
  const detailRequest = useRef(0);
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<GroupItem | null>(null);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Form State for Create
  const [formName, setFormName] = useState("");
  const [formPackageType, setFormPackageType] = useState<PackageType>("reguler_15");
  const [formCustomQuota, setFormCustomQuota] = useState(15);
  const [formWeeklyQuota, setFormWeeklyQuota] = useState(1);
  const [formSemester, setFormSemester] = useState("Ganjil");
  const [formAcademicYear, setFormAcademicYear] = useState("2026/2027");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formCourseIds, setFormCourseIds] = useState<string[]>([]);
  const [formNotes, setFormNotes] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  // Add Member search inside Detail Modal
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [searchedUsers, setSearchedUsers] = useState<any[]>([]);
  const [memberSearchFailed, setMemberSearchFailed] = useState(false);
  const cancelMemberSearch = useRef<(() => void) | null>(null);
  const [addingMemberId, setAddingMemberId] = useState<string | null>(null);

  const [groups, setGroups] = useState(initialGroups);
  const [stats, setStats] = useState(initialStats);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [fetching, setFetching] = useState(false);
  const [loadedKey, setLoadedKey] = useState(() => JSON.stringify([1, "", "all", "all", "all", 0]));
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const requestKey = JSON.stringify([page, searchQuery, statusFilter, packageFilter, courseFilter, revision]);
  const { failed, stale, loading } = adminListRequestState(loadedKey, requestKey, failedKey, fetching);
  const initial = useRef(true);
  useEffect(() => {
    if (initial.current) { initial.current = false; return; }
    setFetching(true);
    setFailedKey(null);
    return scheduleAdminListRequest(
      () => getAdminStudyGroups({ page, search: searchQuery, status: statusFilter, packageType: packageFilter, courseId: courseFilter }),
      {
        onSuccess: (result) => {
          if (page > 1 && result.groups.length === 0 && result.total > 0) {
            setPage(Math.ceil(result.total / 25));
            return;
          }
          setGroups(result.groups);
          setStats(result.stats);
          setTotal(result.total);
          setLoadedKey(requestKey);
        },
        onError: () => setFailedKey(requestKey),
        onSettled: () => setFetching(false),
      },
    );
  }, [page, searchQuery, statusFilter, packageFilter, courseFilter, revision, requestKey]);
  useEffect(() => {
    detailRequest.current += 1;
  }, [requestKey]);
  const filteredGroups = groups;
  const { totalGroups, activeGroups, totalMembers, avgQuotaUsed } = stats;
  const refreshGroups = () => setRevision((value) => value + 1);
  const handleOpenDetail = async (group: GroupItem) => {
    const request = ++detailRequest.current;
    try {
      const detail = await getAdminGroupDetail(group.id);
      if (request !== detailRequest.current) return;
      if (detail) setDetailGroup(detail);
      else toast.error(translate("groupsUI.systemError"));
    } catch {
      if (request === detailRequest.current) toast.error(translate("groupsUI.systemError"));
    }
  };

  // Handlers
  const handleOpenCreate = () => {
    setFormName("");
    setFormPackageType("reguler_15");
    setFormCustomQuota(15);
    setFormWeeklyQuota(PACKAGE_PRESETS.reguler_15.weeklySessions);
    setFormSemester("Ganjil");
    setFormAcademicYear("2026/2027");
    setFormStartDate("");
    setFormEndDate("");
    setFormCourseIds(coursesList[0] ? [coursesList[0].id] : []);
    setFormNotes("");
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.error(translate("groupsUI.missingName"));
      return;
    }

    setFormLoading(true);
    const quota =
      formPackageType === "custom"
        ? formCustomQuota
        : PACKAGE_PRESETS[formPackageType]?.quota || 15;

    try {
      const res = await createStudyGroup({
        name: formName.trim(),
        packageType: formPackageType,
        totalQuotaSessions: quota,
        weeklyQuotaSessions: Math.max(1, formWeeklyQuota),
        academicYear: formAcademicYear,
        semester: formSemester,
        startDate: formStartDate || null,
        endDate: formEndDate || null,
        status: "active",
        courseIds: formCourseIds,
        notes: formNotes || undefined,
      });

      if (res.success) {
        toast.success(translate("groupsUI.created"));
        setIsCreateOpen(false);
        refreshGroups();
      } else {
        toast.error(translate("groupsUI.createFailure"));
      }
    } catch {
      toast.error(translate("groupsUI.systemError"));
    } finally {
      setFormLoading(false);
    }
  };

  const handleOpenEdit = (group: GroupItem) => {
    setEditingGroup(group);
    setFormName(group.name);
    setFormPackageType(
      (group.packageType as PackageType) || "reguler_15"
    );
    setFormCustomQuota(group.totalQuotaSessions);
    setFormWeeklyQuota(group.weeklyQuotaSessions ?? 2);
    setFormSemester(group.semester);
    setFormAcademicYear(group.academicYear);
    setFormStartDate(group.startDate ? formatIsoDate(new Date(group.startDate)) : "");
    setFormEndDate(group.endDate ? formatIsoDate(new Date(group.endDate)) : "");
    setFormCourseIds(group.courses.map((c) => c.id));
    setFormNotes(group.notes || "");
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup) return;

    setFormLoading(true);
    const quota =
      formPackageType === "custom"
        ? formCustomQuota
        : PACKAGE_PRESETS[formPackageType]?.quota || 15;

    try {
      const res = await updateStudyGroup(editingGroup.id, {
        name: formName.trim(),
        packageType: formPackageType,
        totalQuotaSessions: quota,
        weeklyQuotaSessions: Math.max(1, formWeeklyQuota),
        academicYear: formAcademicYear,
        semester: formSemester,
        startDate: formStartDate || null,
        endDate: formEndDate || null,
        courseIds: formCourseIds,
        notes: formNotes,
      });

      if (res.success) {
        toast.success(translate("groupsUI.updated"));
        setEditingGroup(null);
        refreshGroups();
      } else {
        toast.error(translate("groupsUI.updateFailure"));
      }
    } catch {
      toast.error(translate("groupsUI.systemError"));
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDeleteGroup) return;

    setIsDeletingGroup(true);
    try {
      const res = await deleteStudyGroup(pendingDeleteGroup.id);
      if (res.success) {
        toast.success(translate("groupsUI.deleted"));
        setPendingDeleteGroup(null);
        if (detailGroup?.id === pendingDeleteGroup.id) {
          setDetailGroup(null);
        }
        refreshGroups();
      } else {
        toast.error(translate("groupsUI.deleteFailure"));
      }
    } catch {
      toast.error(translate("groupsUI.systemError"));
    } finally {
      setIsDeletingGroup(false);
    }
  };

  useEffect(() => () => cancelMemberSearch.current?.(), []);

  const handleSearchUsers = (q: string) => {
    cancelMemberSearch.current?.();
    setMemberSearchQuery(q);
    setSearchedUsers([]);
    setMemberSearchFailed(false);
    if (!q.trim()) {
      return;
    }
    cancelMemberSearch.current = scheduleAdminListRequest(() => searchStudents(q), {
      onSuccess: setSearchedUsers,
      onError: () => setMemberSearchFailed(true),
      onSettled: () => {},
    });
  };

  const handleAddMemberToGroup = async (userObj: any) => {
    if (!detailGroup) return;
    const groupId = detailGroup.id;

    setAddingMemberId(userObj.id);
    try {
      const res = await addGroupMember(groupId, userObj.id, "member");
      if (res.success) {
        toast.success(`${userObj.name} berhasil ditambahkan`);
        refreshGroups();
        // Update local detailGroup state
        setDetailGroup((prev) =>
          prev?.id === groupId
            ? {
                ...prev,
                members: [
                  ...prev.members,
                  {
                    id: `temp-${Date.now()}`,
                    userId: userObj.id,
                    role: "member" as const,
                    joinedAt: new Date(),
                    user: userObj,
                  },
                ],
              }
            : prev
        );
      } else {
        toast.error(translate("groupsUI.addMemberFailure"));
      }
    } catch {
      toast.error(translate("groupsUI.systemError"));
    } finally {
      setAddingMemberId(null);
    }
  };

  const handleRemoveMemberFromGroup = async (userId: string, userName: string) => {
    if (!detailGroup) return;
    const groupId = detailGroup.id;

    try {
      const res = await removeGroupMember(groupId, userId);
      if (res.success) {
        toast.success(`${userName} telah dikeluarkan dari kelompok`);
        refreshGroups();
        setDetailGroup((prev) =>
          prev?.id === groupId
            ? {
                ...prev,
                members: prev.members.filter((m) => m.userId !== userId),
              }
            : prev
        );
      } else {
        toast.error(translate("groupsUI.removeMemberFailure"));
      }
    } catch {
      toast.error(translate("groupsUI.systemError"));
    }
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(text);
    toast.success(translate("groupsUI.tokenCopied"));
    setTimeout(() => setCopiedToken(null), 2000);
  };

  return (
    <div className="space-y-4">
      {/* 1. KPI Strip */}
      <AdminStatStrip className="lg:grid-cols-4">
        <AdminStatStripItem
          label={translate("groupsUI.totalGroups")}
          value={totalGroups}
          caption={translate("groupsUI.registeredGroups")}
          icon={Users}
          tone="brand"
        />
        <AdminStatStripItem
          label={translate("groupsUI.activeGroups")}
          value={activeGroups}
          caption={translate("groupsUI.thisSemester")}
          icon={CheckCircle2}
          tone="success"
        />
        <AdminStatStripItem
          label={translate("groupsUI.joinedStudents")}
          value={totalMembers}
          caption={translate("groupsUI.activeMembers")}
          icon={GraduationCap}
          tone="info"
        />
        <AdminStatStripItem
          label={translate("groupsUI.quotaUsage")}
          value={`${avgQuotaUsed}%`}
          caption={translate("groupsUI.semesterAverage")}
          icon={Percent}
          tone="warning"
        />
      </AdminStatStrip>

      {/* 2. Search, Filter, and Action Bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search Input */}
        <div className="flex-1 min-w-[140px]">
          <SearchBar
            size="sm"
            isLoading={loading}
            placeholder={translate("groupsUI.search")}
            value={searchQuery}
            onSearch={(value) => { setPage(1); setSearchQuery(value); }}
            onClear={() => { setPage(1); setSearchQuery(""); }}
          />
        </div>

        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={(value) => { setPage(1); setStatusFilter(value); }}>
          <SelectTrigger className="h-9 w-[130px] shrink-0 rounded-lg text-body-sm bg-card border-border">
            <SelectValue placeholder={translate("groupsUI.allStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{translate("groupsUI.allStatus")}</SelectItem>
            <SelectItem value="active">{translate("groupsUI.active")}</SelectItem>
            <SelectItem value="completed">{translate("groupsUI.completed")}</SelectItem>
            <SelectItem value="inactive">{translate("groupsUI.inactive")}</SelectItem>
          </SelectContent>
        </Select>

        {/* Package Filter */}
        <Select value={packageFilter} onValueChange={(value) => { setPage(1); setPackageFilter(value); }}>
          <SelectTrigger className="h-9 w-[140px] shrink-0 rounded-lg text-body-sm bg-card border-border">
            <SelectValue placeholder={translate("groupsUI.allPackages")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{translate("groupsUI.allPackages")}</SelectItem>
            <SelectItem value="reguler_15">{translate("groupsUI.regularPackage")}</SelectItem>
            <SelectItem value="intensif_30">{translate("groupsUI.intensivePackage")}</SelectItem>
            <SelectItem value="super_intensif_45">{translate("groupsUI.superIntensivePackage")}</SelectItem>
            <SelectItem value="custom">{translate("groupsUI.custom")}</SelectItem>
          </SelectContent>
        </Select>

        {/* Course Filter */}
        <Select value={courseFilter} onValueChange={(value) => { setPage(1); setCourseFilter(value); }}>
          <SelectTrigger className="h-9 w-[160px] sm:w-[180px] shrink-0 rounded-lg text-body-sm bg-card border-border truncate">
            <SelectValue placeholder={translate("groupsUI.allCourses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{translate("groupsUI.allCourses")}</SelectItem>
            {coursesList.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Action Controls */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={refreshGroups}
                className="size-9 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
                aria-label={translate("groupsUI.refresh")}
              >
                <RefreshCw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{translate("groupsUI.refresh")}</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                onClick={handleOpenCreate}
                className="size-9 shrink-0 rounded-lg bg-brand-primary text-primary-foreground hover:bg-brand-primary/95 shadow-sm shadow-brand-primary/20"
                aria-label={translate("groupsUI.createGroup")}
              >
                <Plus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{translate("groupsUI.createGroup")}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* 3. Table of Study Groups */}
      {failed ? (
        <AdminErrorState message={translate("groupsUI.systemError")} onRetry={refreshGroups} />
      ) : (
      <AdminTable className={stale ? "opacity-60" : undefined}>
        <table aria-busy={loading} className="w-full min-w-4xl text-left text-body-sm">
          <AdminTableHead>
            <tr>
              <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold text-muted-foreground">
                {translate("groupsUI.tableGroupPackage")}
              </th>
              <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold text-muted-foreground">
                {translate("groupsUI.semesterQuota")}
              </th>
              <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold text-muted-foreground">
                {translate("groupsUI.course")}
              </th>
              <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold text-muted-foreground">
                {translate("groupsUI.members")} ({totalMembers})
              </th>
              <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold text-muted-foreground">
                {translate("groupsUI.semesterPeriod")}
              </th>
              <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold text-muted-foreground">
                {translate("groupsUI.status")}
              </th>
              <th scope="col" className="px-5 py-3.5 text-body-xs font-semibold text-muted-foreground text-center">
                {translate("groupsUI.actions")}
              </th>
            </tr>
          </AdminTableHead>
          <tbody className="divide-y divide-border">
            {filteredGroups.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground text-body-sm">
                  {stale ? translate("shortLinksUI.loading") : translate("groupsUI.noGroups")}
                </td>
              </tr>
            ) : (
              filteredGroups.map((g) => {
                const usedPct = Math.min(
                  100,
                  Math.round((g.usedQuotaSessions / Math.max(1, g.totalQuotaSessions)) * 100)
                );

                const statusTone =
                  g.status === "active"
                    ? "success"
                    : g.status === "completed"
                    ? "info"
                    : g.status === "inactive"
                    ? "warning"
                    : "muted";

                const statusText =
                  g.status === "active"
                    ? translate("groupsUI.active")
                    : g.status === "completed"
                    ? translate("groupsUI.completed")
                    : g.status === "inactive"
                    ? translate("groupsUI.inactive")
                    : translate("groupsUI.archived");

                return (
                  <tr key={g.id} className="hover:bg-muted/30 transition-colors">
                    {/* Kelompok & Paket */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <Button variant="ghost"
                          type="button"
                          onClick={() => void handleOpenDetail(g)}
                          disabled={stale}
                          className="h-auto justify-start whitespace-normal px-0 py-0 font-heading font-bold text-foreground hover:text-primary text-left text-body-sm"
                        >
                          {g.name}
                        </Button>
                        <div className="flex items-center gap-1.5 mt-0.5 text-body-xs text-muted-foreground">
                          <span>{g.packageName}</span>
                          <span>•</span>
                          <span className="font-mono text-[11px] text-muted-foreground/80">
                            {g.academicYear} ({g.semester})
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Kuota Sesi */}
                    <td className="px-4 py-3 min-w-[160px]">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-body-xs font-semibold">
                          <span className="text-foreground">
                            {g.usedQuotaSessions} / {g.totalQuotaSessions} {translate("groupsUI.sessions")}
                          </span>
                          <span className="text-muted-foreground text-[11px]">
                            {g.remainingQuota} {translate("groupsUI.remaining")}
                          </span>
                        </div>
                        <div className="w-full bg-muted rounded-md h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-md transition-all ${
                              usedPct >= 90
                                ? "bg-status-error"
                                : usedPct >= 60
                                ? "bg-status-warning"
                                : "bg-brand-primary"
                            }`}
                            style={{ width: `${usedPct}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Mata Kuliah */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {g.courses.length === 0 ? (
                          <span className="text-body-xs text-muted-foreground italic">{translate("groupsUI.none")}</span>
                        ) : (
                          g.courses.map((c) => (
                            <span
                              key={c.id}
                              className="text-[10px] font-medium bg-brand-primary/10 text-brand-primary border border-brand-primary/20 px-2 py-0.5 rounded-md"
                            >
                              {c.title}
                            </span>
                          ))
                        )}
                      </div>
                    </td>

                    {/* Anggota */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <span className="font-semibold text-foreground text-body-xs">
                            {translate("groupsUI.studentCount", { count: g.memberCount })}
                          </span>
                        </div>
                        {g.members.length > 0 && (
                          <div className="flex -space-x-1.5 overflow-hidden">
                            {g.members.slice(0, 4).map((m) => (
                              <div
                                key={m.userId}
                                title={`${m.user.name} (${m.role})`}
                                className="size-6 rounded-full bg-muted border-2 border-card flex items-center justify-center text-[10px] font-bold text-foreground shrink-0 uppercase"
                              >
                                {m.user.name.charAt(0)}
                              </div>
                            ))}
                            {g.memberCount > 4 && (
                              <div className="size-6 rounded-full bg-muted/80 border-2 border-card flex items-center justify-center text-[9px] font-semibold text-muted-foreground shrink-0">
                                +{g.memberCount - 4}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Periode */}
                    <td className="px-4 py-3 text-body-xs text-muted-foreground whitespace-nowrap">
                      {g.startDate && g.endDate ? (
                        <span>
                          {formatIsoDate(new Date(g.startDate))} {translate("groupsUI.until")}{" "}
                          {formatIsoDate(new Date(g.endDate))}
                        </span>
                      ) : g.endDate ? (
                        <span>{translate("groupsUI.until")} {formatIsoDate(new Date(g.endDate))}</span>
                      ) : (
                        <span>{translate("groupsUI.oneSemester")}</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge tone={statusTone}>{statusText}</StatusBadge>
                    </td>

                    {/* Aksi */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => void handleOpenDetail(g)}
                          disabled={stale}
                          className="h-8 w-8 p-0 rounded-md text-muted-foreground hover:text-foreground"
                          title={translate("groupsUI.viewDetails")}
                        >
                          <Eye className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleOpenEdit(g)}
                          disabled={stale}
                          className="h-8 w-8 p-0 rounded-md text-muted-foreground hover:text-foreground"
                          title={translate("groupsUI.editGroup")}
                        >
                          <Edit3 className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setPendingDeleteGroup(g)}
                          disabled={stale}
                          className="h-8 w-8 p-0 rounded-md text-red-500 hover:text-red-600 hover:bg-red-500/10"
                          title={translate("groupsUI.deleteGroup")}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </AdminTable>
      )}

      {/* 4. Dialog: Buat Kelompok Baru */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-xl rounded-xl border border-border p-6 shadow-xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold flex items-center gap-2">
              <Users className="size-5 text-brand-primary" />
              {translate("groupsUI.newGroup")}
            </DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              {translate("groupsUI.createDescription")}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 mt-2">
            {/* Nama Kelompok */}
            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-foreground block">
                {translate("groupsUI.groupName")}
              </label>
              <Input
                placeholder={translate("groupsUI.namePlaceholder")}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                className="h-10 rounded-lg text-body-sm"
              />
            </div>

            {/* Pilihan Paket Kuota */}
            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-foreground block">
                {translate("groupsUI.packageQuota")}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "reguler_15" as const, title: translate("groupsUI.sessions15"), sub: translate("groupsUI.weekly1") },
                  { id: "intensif_30" as const, title: translate("groupsUI.sessions30"), sub: translate("groupsUI.weekly2") },
                  { id: "super_intensif_45" as const, title: translate("groupsUI.sessions45"), sub: translate("groupsUI.weekly3") },
                  { id: "custom" as const, title: translate("groupsUI.custom"), sub: translate("groupsUI.manual") },
                ].map((p) => {
                  const active = formPackageType === p.id;
                  return (
                    <Button variant="ghost"
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setFormPackageType(p.id);
                        const preset = PACKAGE_PRESETS[p.id];
                        if (preset) setFormWeeklyQuota(preset.weeklySessions);
                      }}
                      className={`h-auto flex flex-col items-center justify-center gap-0.5 p-2 rounded-lg border text-center text-body-sm font-medium transition-colors ${
                        active
                          ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                          : "bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      }`}
                    >
                      <span className="text-body-sm font-bold">{p.title}</span>
                      <span className="text-[10px] text-muted-foreground">{p.sub}</span>
                    </Button>
                  );
                })}
              </div>

              {formPackageType === "custom" && (
                <div className="mt-2 flex items-center gap-3">
                  <label className="text-body-xs text-muted-foreground shrink-0">
                    {translate("groupsUI.customQuota")}
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={formCustomQuota}
                    onChange={(e) => setFormCustomQuota(parseInt(e.target.value, 10) || 1)}
                    className="w-28 h-9 rounded-lg text-body-sm"
                  />
                </div>
              )}

              <div className="mt-2 flex items-center gap-3">
                <label className="text-body-xs text-muted-foreground shrink-0">
                  {translate("groupsUI.weeklyQuota")}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={formWeeklyQuota}
                  onChange={(e) => setFormWeeklyQuota(parseInt(e.target.value, 10) || 1)}
                  aria-label={translate("groupsUI.weeklyQuotaAria")}
                  className="w-20 h-9 rounded-lg text-body-sm"
                />
              </div>
            </div>

            {/* Semester & Tahun Akademik */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold text-foreground block">
                  {translate("groupsUI.semester")}
                </label>
                <Select value={formSemester} onValueChange={setFormSemester}>
                  <SelectTrigger aria-label={translate("groupsUI.semester")} className="w-full h-10 text-body-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ganjil">{translate("groupsUI.oddSemester")}</SelectItem>
                    <SelectItem value="Genap">{translate("groupsUI.evenSemester")}</SelectItem>
                    <SelectItem value="Pendek">{translate("groupsUI.shortSemester")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold text-foreground block">
                  {translate("groupsUI.academicYear")}
                </label>
                <Input
                  value={formAcademicYear}
                  onChange={(e) => setFormAcademicYear(e.target.value)}
                  placeholder="2026/2027"
                  className="h-10 rounded-lg text-body-sm"
                />
              </div>
            </div>

            {/* Tanggal Mulai & Selesai */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold text-foreground block">
                  {translate("groupsUI.startDateOptional")}
                </label>
                <Input
                  type="date"
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                  className="h-10 rounded-lg text-body-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold text-foreground block">
                  {translate("groupsUI.endDateOptional")}
                </label>
                <Input
                  type="date"
                  value={formEndDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                  className="h-10 rounded-lg text-body-sm"
                />
              </div>
            </div>

            {/* Mata Kuliah Kelompok */}
            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-foreground block">
                {translate("groupsUI.coursesTaken")}
              </label>
              <div className="max-h-36 overflow-y-auto divide-y divide-border rounded-lg border border-border">
                {coursesList.map((c) => {
                  const checked = formCourseIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className={`flex items-center gap-2 px-3 py-2 text-body-sm cursor-pointer transition-colors ${
                        checked
                          ? "bg-primary/5 text-foreground"
                          : "bg-card text-muted-foreground"
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => {
                          setFormCourseIds((prev) =>
                            prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                          );
                        }}
                        className="shrink-0"
                      />
                      <span className="truncate">{c.title}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Catatan */}
            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-muted-foreground block">
                {translate("groupsUI.notes")}
              </label>
              <Input
                placeholder={translate("groupsUI.notesPlaceholder")}
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                className="h-10 rounded-lg text-body-sm"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <DialogClose asChild>
                <Button variant="outline" type="button" disabled={formLoading}>
                  {translate("groupsUI.cancel")}
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={formLoading}
                isLoading={formLoading}
                className="bg-brand-primary text-primary-foreground hover:bg-brand-primary/90 rounded-lg"
              >
                {translate("groupsUI.saveGroup")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 5. Dialog: Edit Kelompok */}
      <Dialog open={!!editingGroup} onOpenChange={(open) => !open && setEditingGroup(null)}>
        <DialogContent className="max-w-xl rounded-xl border border-border p-6 shadow-xl">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold flex items-center gap-2">
              <Edit3 className="size-5 text-brand-primary" />
              {translate("groupsUI.editGroup")}
            </DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              {translate("groupsUI.editDescription")}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEditSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-foreground block">
                {translate("groupsUI.groupName")}
              </label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                className="h-10 rounded-lg text-body-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-foreground block">
                {translate("groupsUI.packageQuota")}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "reguler_15" as const, title: translate("groupsUI.sessions15"), sub: translate("groupsUI.weekly1") },
                  { id: "intensif_30" as const, title: translate("groupsUI.sessions30"), sub: translate("groupsUI.weekly2") },
                  { id: "super_intensif_45" as const, title: translate("groupsUI.sessions45"), sub: translate("groupsUI.weekly3") },
                  { id: "custom" as const, title: translate("groupsUI.custom"), sub: translate("groupsUI.manual") },
                ].map((p) => {
                  const active = formPackageType === p.id;
                  return (
                    <Button variant="ghost"
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setFormPackageType(p.id);
                        const preset = PACKAGE_PRESETS[p.id];
                        if (preset) setFormWeeklyQuota(preset.weeklySessions);
                      }}
                      className={`h-auto flex flex-col items-center justify-center gap-0.5 p-2 rounded-lg border text-center text-body-sm font-medium transition-colors ${
                        active
                          ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                          : "bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      }`}
                    >
                      <span className="text-body-sm font-bold">{p.title}</span>
                      <span className="text-[10px] text-muted-foreground">{p.sub}</span>
                    </Button>
                  );
                })}
              </div>

              {formPackageType === "custom" && (
                <div className="mt-2 flex items-center gap-3">
                  <label className="text-body-xs text-muted-foreground shrink-0">
                    {translate("groupsUI.customQuota")}
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={formCustomQuota}
                    onChange={(e) => setFormCustomQuota(parseInt(e.target.value, 10) || 1)}
                    className="w-28 h-9 rounded-lg text-body-sm"
                  />
                </div>
              )}

              <div className="mt-2 flex items-center gap-3">
                <label className="text-body-xs text-muted-foreground shrink-0">
                  {translate("groupsUI.weeklyQuota")}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={formWeeklyQuota}
                  onChange={(e) => setFormWeeklyQuota(parseInt(e.target.value, 10) || 1)}
                  aria-label={translate("groupsUI.weeklyQuotaAria")}
                  className="w-20 h-9 rounded-lg text-body-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold text-foreground block">
                  {translate("groupsUI.semester")}
                </label>
                <Select value={formSemester} onValueChange={setFormSemester}>
                  <SelectTrigger aria-label={translate("groupsUI.semester")} className="w-full h-10 text-body-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ganjil">{translate("groupsUI.oddSemester")}</SelectItem>
                    <SelectItem value="Genap">{translate("groupsUI.evenSemester")}</SelectItem>
                    <SelectItem value="Pendek">{translate("groupsUI.shortSemester")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold text-foreground block">
                  {translate("groupsUI.academicYear")}
                </label>
                <Input
                  value={formAcademicYear}
                  onChange={(e) => setFormAcademicYear(e.target.value)}
                  className="h-10 rounded-lg text-body-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold text-foreground block">
                  {translate("groupsUI.startDate")}
                </label>
                <Input
                  type="date"
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                  className="h-10 rounded-lg text-body-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-body-xs font-semibold text-foreground block">
                  {translate("groupsUI.endDate")}
                </label>
                <Input
                  type="date"
                  value={formEndDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                  className="h-10 rounded-lg text-body-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-body-xs font-semibold text-foreground block">
                {translate("groupsUI.coursesTaken")}
              </label>
              <div className="max-h-36 overflow-y-auto divide-y divide-border rounded-lg border border-border">
                {coursesList.map((c) => {
                  const checked = formCourseIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className={`flex items-center gap-2 px-3 py-2 text-body-sm cursor-pointer transition-colors ${
                        checked
                          ? "bg-primary/5 text-foreground"
                          : "bg-card text-muted-foreground"
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => {
                          setFormCourseIds((prev) =>
                            prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                          );
                        }}
                        className="shrink-0"
                      />
                      <span className="truncate">{c.title}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <DialogClose asChild>
                <Button variant="outline" type="button" disabled={formLoading}>
                  {translate("groupsUI.cancel")}
                </Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={formLoading}
                isLoading={formLoading}
                className="bg-brand-primary text-primary-foreground hover:bg-brand-primary/90 rounded-lg"
              >
                {translate("groupsUI.saveChanges")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 6. Modal Detail & Kelola Anggota */}
      <Dialog open={!!detailGroup} onOpenChange={(open) => { if (!open) { detailRequest.current++; handleSearchUsers(""); setDetailGroup(null); } }}>
        <DialogContent className="max-w-2xl rounded-xl border border-border p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
          {detailGroup && (
            <div className="space-y-4">
              <DialogHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <DialogTitle className="font-heading text-body-base font-bold text-foreground">
                      {detailGroup.name}
                    </DialogTitle>
                    <DialogDescription className="text-body-xs text-muted-foreground mt-1">
                      {detailGroup.packageName} • {detailGroup.academicYear} ({detailGroup.semester})
                    </DialogDescription>
                  </div>
                  <Badge variant="outline" className="font-semibold capitalize">
                    {detailGroup.status === "active" ? translate("groupsUI.active") : detailGroup.status === "completed" ? translate("groupsUI.completed") : detailGroup.status === "inactive" ? translate("groupsUI.inactive") : translate("groupsUI.archived")}
                  </Badge>
                </div>
              </DialogHeader>

              {/* Quota Summary Box */}
              <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
                <div className="flex items-center justify-between text-body-sm font-semibold">
                  <span className="text-foreground">{translate("groupsUI.activityThisWeek")}</span>
                  <span className="text-brand-primary font-bold">
                    {detailGroup.weeklyUsedSessions ?? 0} {translate("groupsUI.sessions")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-body-xs text-muted-foreground">
                  <span>{translate("groupsUI.totalHeld", { used: detailGroup.usedQuotaSessions, total: detailGroup.totalQuotaSessions })}</span>
                  <span>{translate("groupsUI.frequency", { frequency: translate("groupsUI.flexible") })}</span>
                </div>
                {detailGroup.weeklyStats && detailGroup.weeklyStats.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-border/60">
                    {detailGroup.weeklyStats.map((w) => (
                      <div key={w.weekStartIso} className="px-2 py-1 text-center">
                        <span className="text-[11px] font-semibold text-foreground block">{w.label}</span>
                        <div className="flex items-center justify-center gap-2 text-[11px] mt-0.5">
                          <span className="text-emerald-600 dark:text-emerald-400">{w.attended} {translate("groupsUI.attended")}</span>
                          <span className="text-red-500">{w.missed + w.cancelled} {translate("groupsUI.missed")}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Mata Kuliah */}
              <div className="space-y-2">
                <h3 className="font-heading text-body-sm font-bold text-foreground flex items-center gap-2">
                  <BookOpen className="size-4 text-brand-primary" />
                  {translate("groupsUI.course")} ({detailGroup.courses.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {detailGroup.courses.length === 0 ? (
                    <p className="text-body-xs text-muted-foreground italic">{translate("groupsUI.noCoursesLinked")}</p>
                  ) : (
                    detailGroup.courses.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-2 py-1 text-body-xs text-foreground"
                      >
                        <GraduationCap className="size-3.5 text-brand-primary" />
                        <span>{c.title}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Anggota Kelompok */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-heading text-body-sm font-bold text-foreground flex items-center gap-2">
                    <Users className="size-4 text-brand-primary" />
                    {translate("groupsUI.detailMembers")} ({detailGroup.members.length})
                  </h3>
                </div>

                {/* Member List */}
                <div className="divide-y divide-border border border-border rounded-xl bg-card overflow-hidden">
                  {detailGroup.members.length === 0 ? (
                    <div className="p-4 text-center text-body-xs text-muted-foreground">
                      {translate("groupsUI.noMembers")}
                    </div>
                  ) : (
                    detailGroup.members.map((m) => (
                      <div key={m.userId} className="flex items-center justify-between p-3 hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-body-xs shrink-0 uppercase">
                            {m.user.name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-body-sm font-semibold text-foreground leading-tight">
                              {m.user.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground">{m.user.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={m.role === "leader" ? "default" : "outline"} className="text-[10px] uppercase">
                            {m.role === "leader" ? translate("groupsUI.leader") : translate("groupsUI.member")}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => handleRemoveMemberFromGroup(m.userId, m.user.name)}
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded"
                            title={translate("groupsUI.removeFromGroup")}
                          >
                            <UserMinus className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Add Member Search */}
                <div className="space-y-2 pt-1">
                  <label htmlFor="group-member-search" className="text-body-sm font-semibold text-foreground block">
                    {translate("groupsUI.searchStudents")}
                  </label>
                  <SearchBar
                    size="sm"
                    id="group-member-search"
                    placeholder={translate("groupsUI.studentSearchPlaceholder")}
                    value={memberSearchQuery}
                    onSearch={handleSearchUsers}
                  />

                  {memberSearchFailed && <AdminErrorState message={translate("groupsUI.systemError")} onRetry={() => handleSearchUsers(memberSearchQuery)} />}

                  {searchedUsers.length > 0 && (
                    <div className="divide-y divide-border border border-border rounded-lg bg-card max-h-40 overflow-y-auto">
                      {searchedUsers.map((u) => {
                        const isAlready = detailGroup.members.some((m) => m.userId === u.id);
                        return (
                          <div
                            key={u.id}
                            className="flex items-center justify-between p-2.5 text-body-xs hover:bg-muted/30"
                          >
                            <div>
                              <p className="font-semibold text-foreground">{u.name}</p>
                              <p className="text-[10px] text-muted-foreground">{u.email}</p>
                            </div>
                            {isAlready ? (
                              <span className="text-[10px] text-muted-foreground font-medium">{translate("groupsUI.alreadyJoined")}</span>
                            ) : (
                              <Button
                                size="xs"
                                disabled={addingMemberId === u.id}
                                onClick={() => handleAddMemberToGroup(u)}
                                className="h-7 rounded bg-brand-primary text-primary-foreground text-[11px] gap-1"
                              >
                                <UserPlus className="size-3" />
                                {addingMemberId === u.id ? translate("groupsUI.adding") : translate("groupsUI.add")}
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Related activation tokens */}
              {detailGroup.tokens && detailGroup.tokens.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-heading text-body-sm font-bold text-foreground flex items-center gap-2">
                    <KeyRound className="size-4 text-brand-primary" />
                    {translate("groupsUI.tokens")}
                  </h3>
                  <div className="space-y-1.5">
                    {detailGroup.tokens.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between border-b border-border py-2 font-mono text-body-xs"
                      >
                        <span className="font-bold text-foreground">{t.token}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-[11px]">
                            {translate("groupsUI.groupCapacityLabel", { capacity: t.capacity })}
                          </span>
                          <Button variant="ghost"
                            type="button"
                            onClick={() => handleCopyText(t.token)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                            aria-label={translate("groupsUI.copyToken")}
                            size="icon"
                          >
                            {copiedToken === t.token ? (
                              <Check className="size-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <DialogFooter className="pt-2">
                <DialogClose asChild>
                  <Button variant="outline" type="button">
                    {translate("groupsUI.cancel")}
                  </Button>
                </DialogClose>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {!failed && total > 25 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>{translate("notificationUI.previous")}</Button>
          <span className={`text-body-xs ${stale ? "invisible" : ""}`}>{page} / {Math.ceil(total / 25)}</span>
          <Button variant="outline" size="sm" disabled={page * 25 >= total || loading} onClick={() => setPage(page + 1)}>{translate("notificationUI.next")}</Button>
        </div>
      )}

      {/* 7. Confirm Delete Dialog */}
      <AdminConfirmDialog
        open={!!pendingDeleteGroup}
        onOpenChange={(open) => !open && setPendingDeleteGroup(null)}
        title={translate("groupsUI.deleteTitle")}
        description={translate("groupsUI.deletePrompt", { name: pendingDeleteGroup?.name ?? "" })}
        confirmLabel={translate("groupsUI.confirmDelete")}
        loading={isDeletingGroup}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
