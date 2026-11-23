"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "@/lib/i18n/client";
import { useAppLocale } from "@/lib/i18n/client";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Copy, Trash2, KeyRound, Check, RefreshCw, User, Users, ShieldCheck, CheckCircle2, Plus, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminIconAction } from "@/components/admin/icon-action";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SearchBar } from "@/components/ui/search-bar";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { AdminTable, AdminTableHead } from "@/components/admin/table";
import { StatusBadge } from "@/components/admin/status-badges";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { generateEnrollmentToken, deleteEnrollmentToken } from "@/app/(admin)/admin/(academic)/tokens/actions";

type TokenRow = {
  id: string;
  token: string;
  capacity: number;
  createdAt: Date;
  expiresAt: Date;
  courses: {
    id: string;
    title: string;
  }[];
  group: {
    id: string;
    name: string;
    packageType?: string;
    packageName?: string;
    totalQuotaSessions?: number;
    weeklyQuotaSessions?: number;
    members: {
      userId: string;
      joinedAt: Date;
      user: {
        name: string;
        email: string;
      };
    }[];
  } | null;
};

type CourseOption = {
  id: string;
  title: string;
};

type Props = {
  initialTokens: TokenRow[];
  coursesList: CourseOption[];
};

/**
 * Dashboard for administrative management of class enrollment tokens,
 * supporting flexible session quota and custom group capacity.
 */
export function TokensDashboard({ initialTokens, coursesList }: Props) {
  const translate = useTranslations("adminOps");
  const { locale } = useAppLocale();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>(
    coursesList[0] ? [coursesList[0].id] : []
  );
  const [capacity, setCapacity] = useState<number>(3);
  const [totalQuota, setTotalQuota] = useState<number>(15);
  const [weeklyQuota, setWeeklyQuota] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; token: string } | null>(null);
  const [isDeletingToken, setIsDeletingToken] = useState(false);

  const stats = useMemo(() => {
    const total = initialTokens.length;
    const now = new Date();
    const active = initialTokens.filter((t) => new Date(t.expiresAt) >= now).length;
    const totalCapacity = initialTokens.reduce((acc, t) => acc + t.capacity, 0);
    const registeredMembers = initialTokens.reduce(
      (acc, t) => acc + (t.group?.members?.length || 0),
      0
    );
    return { total, active, totalCapacity, registeredMembers };
  }, [initialTokens]);

  const filteredTokens = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return initialTokens;
    return initialTokens.filter((t) => {
      const matchToken = t.token.toLowerCase().includes(q);
      const matchCourse = t.courses.some(
        (c) => c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
      );
      const matchMember = t.group?.members.some(
        (m) => m.user.name.toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q)
      );
      return matchToken || matchCourse || matchMember;
    });
  }, [initialTokens, searchQuery]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCourseIds.length === 0) {
      toast.error(translate("tokensUI.selectCourse"));
      return;
    }

    if (typeof capacity !== "number" || !Number.isInteger(capacity) || capacity < 1) {
      toast.error(translate("tokensUI.invalidCapacity"));
      return;
    }

    if (typeof totalQuota !== "number" || !Number.isInteger(totalQuota) || totalQuota < 0) {
      toast.error(translate("tokensUI.invalidQuota"));
      return;
    }

    if (typeof weeklyQuota !== "number" || !Number.isInteger(weeklyQuota) || weeklyQuota < 0) {
      toast.error(translate("tokensUI.invalidWeekly"));
      return;
    }

    setLoading(true);
    try {
      const res = await generateEnrollmentToken(selectedCourseIds, capacity, {
        totalQuotaSessions: totalQuota,
        weeklyQuotaSessions: weeklyQuota,
      });
      if (res.success) {
        toast.success(translate("tokensUI.created", { token: res.token ?? "" }));
        setSelectedCourseIds(coursesList[0] ? [coursesList[0].id] : []);
        setCapacity(3);
        setTotalQuota(15);
        setWeeklyQuota(1);
        setCreateOpen(false);
      } else {
        toast.error(translate("tokensUI.createFailure"));
      }
    } catch (err) {
      console.error(err);
      toast.error(translate("tokensUI.connectionError"));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDelete) return;

    setIsDeletingToken(true);
    try {
      const res = await deleteEnrollmentToken(pendingDelete.id);
      if (res.success) {
        toast.success(translate("tokensUI.deleteSuccess"));
        setPendingDelete(null);
      } else {
        toast.error(translate("tokensUI.deleteFailure"));
      }
    } catch (err) {
      console.error(err);
      toast.error(translate("tokensUI.connectionError"));
    } finally {
      setIsDeletingToken(false);
    }
  };

  const handleCopy = (tokenStr: string, tokenId: string) => {
    navigator.clipboard.writeText(tokenStr);
    setCopiedTokenId(tokenId);
    toast.success(translate("tokensUI.copied"));
    setTimeout(() => setCopiedTokenId(null), 2000);
  };

  return (
    <TooltipProvider>
    <div className="space-y-4">
      {/* KPI Stats Strip */}
      <AdminStatStrip className="grid-cols-2 lg:grid-cols-4">
        <AdminStatStripItem
          label={translate("tokensUI.total")}
          value={stats.total}
          icon={KeyRound}
          tone="default"
        />
        <AdminStatStripItem
          label={translate("tokensUI.active")}
          value={stats.active}
          icon={CheckCircle2}
          tone="default"
        />
        <AdminStatStripItem
          label={translate("tokensUI.capacityTotal")}
          value={stats.totalCapacity}
          icon={Users}
          tone="default"
        />
        <AdminStatStripItem
          label={translate("tokensUI.registeredStudents")}
          value={stats.registeredMembers}
          icon={ShieldCheck}
          tone="default"
        />
      </AdminStatStrip>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchBar
          collapsible
          size="sm"
          value={searchQuery}
          onSearch={setSearchQuery}
          onClear={() => setSearchQuery("")}
          placeholder={translate("tokensUI.search")}
        />
        <span className="text-body-xs text-muted-foreground">
          {translate("tokensUI.count", { filtered: filteredTokens.length, total: initialTokens.length })}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  router.refresh();
                  toast.success(translate("tokensUI.updated"));
                }}
                aria-label={translate("tokensUI.refresh")}
                className="h-9 w-9 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{translate("tokensUI.refresh")}</TooltipContent>
          </Tooltip>
          <AdminIconAction label={translate("tokensUI.create")}
            onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
          </AdminIconAction>
        </div>
      </div>

      {/* Tokens List */}
      {filteredTokens.length === 0 ? (
        <AdminEmptyState icon={KeyRound} title={searchQuery ? translate("tokensUI.notFound") : translate("tokensUI.empty")} />
      ) : (
        <AdminTable>
          <div className="md:hidden divide-y divide-border">
            {filteredTokens.map((t) => {
              const isExpired = new Date(t.expiresAt) < new Date();
              const membersCount = t.group?.members?.length || 0;
              const isFull = membersCount >= t.capacity;
              return (
                <div key={t.id} className="flex items-start justify-between gap-2.5 px-3.5 py-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-body-xs font-bold text-foreground break-all">{t.token}</span>
                      {isExpired ? (
                        <StatusBadge tone="error">{translate("tokensUI.expired")}</StatusBadge>
                      ) : isFull ? (
                        <StatusBadge tone="warning">{translate("tokensUI.full")}</StatusBadge>
                      ) : (
                        <StatusBadge tone="success">{translate("tokensUI.activeStatus")}</StatusBadge>
                      )}
                    </div>
                    <p className="text-body-xs text-muted-foreground">
                      {membersCount}/{t.capacity} {translate("tokensUI.students")}
                      {" · "}
                      {new Date(t.expiresAt).toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                    {t.courses.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {t.courses.map((c) => (
                          <span
                            key={c.id}
                            className="text-body-2xs font-medium bg-brand-primary/10 text-brand-primary border border-brand-primary/20 px-1.5 py-0.5 rounded-md"
                          >
                            {c.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={translate("tokensUI.actions")}
                        className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onSelect={() => handleCopy(t.token, t.id)}>
                        <Copy className="size-4 text-muted-foreground" />
                        <span>{translate("tokensUI.copy")}</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => setPendingDelete({ id: t.id, token: t.token })}
                        className="text-status-error focus:text-status-error"
                      >
                        <Trash2 className="size-4" />
                        <span>{translate("tokensUI.delete")}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
          <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-3xl text-left text-body-sm">
            <AdminTableHead>
              <tr>
                <th scope="col" className="px-4 py-3 text-body-xs font-semibold text-muted-foreground">
                  {translate("tokensUI.tokenString")}
                </th>
                <th scope="col" className="px-4 py-3 text-body-xs font-semibold text-muted-foreground">
                  {translate("tokensUI.capacity")}
                </th>
                <th scope="col" className="px-4 py-3 text-body-xs font-semibold text-muted-foreground">
                  {translate("tokensUI.course")}
                </th>
                <th scope="col" className="px-4 py-3 text-body-xs font-semibold text-muted-foreground">
                  {translate("tokensUI.expires")}
                </th>
                <th scope="col" className="px-4 py-3 text-body-xs font-semibold text-muted-foreground">
                  {translate("tokensUI.status")}
                </th>
                <th scope="col" className="px-4 py-3 text-body-xs font-semibold text-muted-foreground">
                  {translate("tokensUI.members")}
                </th>
                <th scope="col" className="px-4 py-3 text-body-xs font-semibold text-muted-foreground text-right">
                  {translate("tokensUI.actions")}
                </th>
              </tr>
            </AdminTableHead>
            <tbody className="divide-y divide-border">
              {filteredTokens.map((t) => {
                const isExpired = new Date(t.expiresAt) < new Date();
                const membersCount = t.group?.members?.length || 0;
                const isFull = membersCount >= t.capacity;

                return (
                  <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 font-mono font-bold text-foreground">
                      <div className="flex items-center gap-1.5">
                        <span>{t.token}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              onClick={() => handleCopy(t.token, t.id)}
                              className="size-7 rounded-md text-muted-foreground hover:text-foreground"
                              aria-label={translate("tokensUI.copy")}
                              variant="ghost"
                              size="icon"
                            >
                              {copiedTokenId === t.id ? (
                                <Check className="size-3.5 text-status-success" />
                              ) : (
                                <Copy className="size-3.5" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{translate("tokensUI.copy")}</TooltipContent>
                        </Tooltip>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="inline-flex items-center gap-1 text-body-xs font-medium text-foreground">
                          <Users className="size-3 text-muted-foreground" />
                          {t.capacity} {translate("tokensUI.person")}
                        </span>
                        {t.group && typeof t.group.totalQuotaSessions === "number" && (
                          <span className="text-body-xs text-muted-foreground">
                            {translate("tokensUI.quotaFormat", { total: t.group.totalQuotaSessions, weekly: t.group.weeklyQuotaSessions ?? 0 })}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {t.courses.map((c) => (
                          <span
                            key={c.id}
                            className="text-body-2xs font-medium bg-brand-primary/10 text-brand-primary border border-brand-primary/20 px-2 py-0.5 rounded-md"
                          >
                            {c.title}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-body-xs text-muted-foreground whitespace-nowrap">
                      {new Date(t.expiresAt).toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-2.5">
                      {isExpired ? (
                        <StatusBadge tone="error">{translate("tokensUI.expired")}</StatusBadge>
                      ) : isFull ? (
                        <StatusBadge tone="warning">{translate("tokensUI.full")}</StatusBadge>
                      ) : (
                        <StatusBadge tone="success">{translate("tokensUI.activeStatus")}</StatusBadge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-body-xs">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-foreground">
                          {membersCount} / {t.capacity} {translate("tokensUI.students")}
                        </span>
                        {membersCount > 0 && t.group?.members && (
                          <div className="flex flex-col gap-0.5 text-muted-foreground text-body-xs">
                            {t.group.members.map((m) => (
                              <span key={m.userId} className="truncate max-w-[150px]">
                                {m.user.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={translate("tokensUI.actions")}
                            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onSelect={() => handleCopy(t.token, t.id)}>
                            <Copy className="size-4 text-muted-foreground" />
                            <span>{translate("tokensUI.copy")}</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => setPendingDelete({ id: t.id, token: t.token })}
                            className="text-status-error focus:text-status-error"
                          >
                            <Trash2 className="size-4" />
                            <span>{translate("tokensUI.delete")}</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </AdminTable>
      )}

      {/* Create Token Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-brand-primary" />
              <span>{translate("tokensUI.create")}</span>
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-body-sm font-semibold text-foreground block">
                  {translate("tokensUI.courses")}
                </label>
                {coursesList.length === 0 ? (
                  <p className="text-body-sm text-muted-foreground italic">{translate("tokensUI.noCourses")}</p>
                ) : (
                  <div className="max-h-60 overflow-y-auto divide-y divide-border rounded-lg border border-border">
                    {coursesList.map((c) => {
                      const isChecked = selectedCourseIds.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors hover:bg-muted/40 ${
                            isChecked ? "bg-primary/5" : "bg-card"
                          }`}
                        >
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => {
                              setSelectedCourseIds((prev) =>
                                prev.includes(c.id)
                                  ? prev.filter((id) => id !== c.id)
                                  : [...prev, c.id]
                              );
                            }}
                            className="shrink-0"
                          />
                          <div className="flex flex-col">
                            <span className="text-body-sm font-semibold text-foreground">{c.title}</span>
                            <span className="text-body-xs text-muted-foreground">{c.id}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label htmlFor="token-total-quota" className="text-body-sm font-semibold text-foreground block">
                        {translate("tokensUI.quota")}
                      </label>
                      <div className="relative">
                        <Input
                          id="token-total-quota"
                          type="number"
                          min={0}
                          step={1}
                          value={totalQuota}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const parsed = Number(raw);
                            const hasNumber = raw !== "" && !Number.isNaN(parsed);
                            const val = hasNumber ? Math.max(0, Math.floor(parsed)) : 0;
                            setTotalQuota(val);
                            if (hasNumber) {
                              if (val === 0) {
                                setWeeklyQuota(0);
                              } else if (weeklyQuota === 0) {
                                setWeeklyQuota(1);
                              }
                            }
                          }}
                          className="h-10 text-body-sm pr-12"
                          placeholder="15"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-body-xs text-muted-foreground pointer-events-none">
                          {translate("tokensUI.session")}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="token-weekly-quota" className="text-body-sm font-semibold text-foreground block">
                        {translate("tokensUI.weeklyLimit")}
                      </label>
                      <div className="relative">
                        <Input
                          id="token-weekly-quota"
                          type="number"
                          min={0}
                          step={1}
                          value={weeklyQuota}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const parsed = Number(raw);
                            const hasNumber = raw !== "" && !Number.isNaN(parsed);
                            setWeeklyQuota(hasNumber ? Math.max(0, Math.floor(parsed)) : 0);
                          }}
                          className="h-10 text-body-sm pr-20"
                          placeholder="1"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-body-xs text-muted-foreground pointer-events-none">
                          {translate("tokensUI.perWeek")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-body-xs text-muted-foreground mr-1">{translate("tokensUI.quickOptions")}</span>
                    {[
                      { total: 0, weekly: 0 },
                      { total: 5, weekly: 1 },
                      { total: 10, weekly: 1 },
                      { total: 15, weekly: 1 },
                      { total: 30, weekly: 2 },
                      { total: 45, weekly: 3 },
                    ].map((preset) => {
                      const isSelected = totalQuota === preset.total && weeklyQuota === preset.weekly;
                      return (
                        <Button
                          key={preset.total}
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={() => {
                            setTotalQuota(preset.total);
                            setWeeklyQuota(preset.weekly);
                          }}
                          className={`h-8 px-2.5 rounded-md border text-body-sm transition-colors ${
                            isSelected
                              ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                              : "bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                          }`}
                        >
                          {preset.total} {translate("tokensUI.session")}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="space-y-1.5">
                    <label htmlFor="token-capacity" className="text-body-sm font-semibold text-foreground block">
                      {translate("tokensUI.groupCapacity")}
                    </label>
                    <div className="relative max-w-xs">
                      <Input
                        id="token-capacity"
                        type="number"
                        min={1}
                        step={1}
                        value={capacity}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const parsed = Number(raw);
                          const hasNumber = raw !== "" && !Number.isNaN(parsed);
                          setCapacity(hasNumber ? Math.max(1, Math.floor(parsed)) : 1);
                        }}
                        className="h-10 text-body-sm pr-16"
                        placeholder="1"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-body-xs text-muted-foreground pointer-events-none">
                        {translate("tokensUI.person")}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-body-xs text-muted-foreground mr-1">{translate("tokensUI.quickOptions")}</span>
                    {[1, 2, 3, 4, 5, 10].map((num) => {
                      const isSelected = capacity === num;
                      return (
                        <Button
                          key={num}
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={() => setCapacity(num)}
                          className={`flex h-8 items-center gap-1 px-2.5 rounded-md border text-body-sm transition-colors ${
                            isSelected
                              ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                              : "bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                          }`}
                        >
                          {num === 1 ? <User className="size-3" /> : <Users className="size-3" />}
                          <span>{num} {translate("tokensUI.person")}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={loading}>{translate("usersUI.cancel")}</Button>
              </DialogClose>
              <Button
                type="submit"
                disabled={loading || selectedCourseIds.length === 0}
                isLoading={loading}
                className="h-9 rounded-lg px-4"
              >
                {loading ? translate("tokensUI.creating") : translate("tokensUI.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AdminConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={translate("tokensUI.deleteTitle")}
        description={translate("tokensUI.deleteDescription", { token: pendingDelete?.token ?? "" })}
        confirmLabel={translate("tokensUI.confirmDelete")}
        loading={isDeletingToken}
        onConfirm={handleDeleteConfirm}
      />
    </div>
    </TooltipProvider>
  );
}
