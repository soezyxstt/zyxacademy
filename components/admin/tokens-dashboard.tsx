"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "@/lib/i18n/client";
import { useAppLocale } from "@/lib/i18n/client";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Copy, Trash2, KeyRound, Check, RefreshCw, User, Users, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SearchBar } from "@/components/ui/search-bar";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
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
        router.refresh();
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
        router.refresh();
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
    <div className="space-y-4">
      {/* KPI Stats Strip */}
      <AdminStatStrip className="grid-cols-2 lg:grid-cols-4">
        <AdminStatStripItem
          label={translate("tokensUI.total")}
          value={stats.total}
          icon={KeyRound}
          tone="brand"
        />
        <AdminStatStripItem
          label={translate("tokensUI.active")}
          value={stats.active}
          icon={CheckCircle2}
          tone="success"
        />
        <AdminStatStripItem
          label={translate("tokensUI.capacityTotal")}
          value={stats.totalCapacity}
          icon={Users}
          tone="info"
        />
        <AdminStatStripItem
          label={translate("tokensUI.registeredStudents")}
          value={stats.registeredMembers}
          icon={ShieldCheck}
          tone="default"
        />
      </AdminStatStrip>

      {/* Generate Form */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2 mb-4">
          <KeyRound className="size-5 text-brand-primary" />
          {translate("tokensUI.create")}
        </h2>
        
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Course Selection */}
            <div className="space-y-2">
              <label className="text-body-sm font-semibold text-foreground block">
                {translate("tokensUI.courses")}
              </label>
              {coursesList.length === 0 ? (
                <p className="text-body-sm text-muted-foreground italic">{translate("tokensUI.noCourses")}</p>
              ) : (
                  <div className="max-h-64 overflow-y-auto divide-y divide-border rounded-lg border border-border">
                  {coursesList.map((c) => {
                    const isChecked = selectedCourseIds.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors hover:bg-muted/40 ${
                          isChecked
                            ? "bg-primary/5"
                            : "bg-card"
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

            {/* Group Size & Quota Configuration */}
            <div className="space-y-5">
              {/* Quota Settings */}
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

                {/* Quick Presets for Quota */}
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
                        className={`px-2.5 py-1 rounded-md border text-body-sm font-medium transition-colors ${
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

              {/* Capacity Settings */}
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

                {/* Quick Presets for Capacity */}
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
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-md border text-body-sm font-medium transition-colors ${
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

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={loading || selectedCourseIds.length === 0}
              className="h-9 rounded-lg px-4"
            >
              {loading ? translate("tokensUI.creating") : translate("tokensUI.create")}
            </Button>
          </div>
        </form>
      </div>

      {/* Tokens List */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3">
          <div className="flex flex-1 items-center gap-3 min-w-[140px] max-w-md">
            <SearchBar
              size="sm"
              value={searchQuery}
              onSearch={setSearchQuery}
              onClear={() => setSearchQuery("")}
              placeholder={translate("tokensUI.search")}
              containerClassName="w-full"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-body-xs font-semibold text-muted-foreground">
              {translate("tokensUI.count", { filtered: filteredTokens.length, total: initialTokens.length })}
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                router.refresh();
                toast.success(translate("tokensUI.updated"));
              }}
              className="rounded-md gap-1 text-muted-foreground"
            >
              <RefreshCw className="size-3.5" />
              {translate("tokensUI.refresh")}
            </Button>
          </div>
        </div>

        {filteredTokens.length === 0 ? (
          <AdminEmptyState icon={KeyRound} title={searchQuery ? translate("tokensUI.notFound") : translate("tokensUI.empty")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-3xl text-left text-body-sm">
              <thead>
                <tr className="border-b border-border bg-muted/10">
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
                    <th scope="col" className="px-4 py-3 text-body-xs font-semibold text-muted-foreground text-center">
                    {translate("tokensUI.actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                  {filteredTokens.map((t) => {
                  const isExpired = new Date(t.expiresAt) < new Date();
                  const membersCount = t.group?.members?.length || 0;
                  const isFull = membersCount >= t.capacity;

                  return (
                    <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-foreground">
                        <div className="flex items-center gap-2">
                          <span>{t.token}</span>
                          <Button
                            type="button"
                            onClick={() => handleCopy(t.token, t.id)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            aria-label={translate("tokensUI.copy")}
                            variant="ghost"
                            size="icon"
                          >
                            {copiedTokenId === t.id ? (
                              <Check className="size-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                          </Button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center gap-1 text-body-xs font-medium text-foreground bg-muted/60 px-2.5 py-1 rounded-md border border-border w-fit">
                            <Users className="size-3 text-muted-foreground" />
                            {t.capacity} {translate("tokensUI.person")}
                          </span>
                          {t.group && typeof t.group.totalQuotaSessions === "number" && (
                            <span className="text-[11px] text-muted-foreground">
                              {translate("tokensUI.quotaFormat", { total: t.group.totalQuotaSessions, weekly: t.group.weeklyQuotaSessions ?? 0 })}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5 max-w-xs">
                          {t.courses.map((c) => (
                            <span
                              key={c.id}
                              className="text-[10px] font-medium bg-brand-primary/10 text-brand-primary border border-brand-primary/20 px-2 py-0.5 rounded"
                            >
                              {c.title}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-body-xs text-muted-foreground">
                        {new Date(t.expiresAt).toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        {isExpired ? (
                          <span className="text-[10px] uppercase font-bold text-red-600 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                            {translate("tokensUI.expired")}
                          </span>
                        ) : isFull ? (
                          <span className="text-[10px] uppercase font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                            {translate("tokensUI.full")}
                          </span>
                        ) : (
                          <span className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            {translate("tokensUI.activeStatus")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-body-xs">
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-foreground">
                            {membersCount} / {t.capacity} {translate("tokensUI.students")}
                          </span>
                          {membersCount > 0 && t.group?.members && (
                            <div className="flex flex-col gap-0.5 text-muted-foreground text-[10px]">
                              {t.group.members.map((m) => (
                                <span key={m.userId} className="truncate max-w-[150px]">
                                  • {m.user.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setPendingDelete({ id: t.id, token: t.token })}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded-md"
                          title={translate("tokensUI.delete")}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
  );
}
