"use client";

import Image from "next/image";

import { useState, useEffect, useRef, useTransition } from "react";
import {
  Users,
  ShieldCheck,
  GraduationCap,
  BookOpen,
  UserCheck,
  RotateCcw,
  UserCog,
  ShieldAlert,
  Mail,
} from "lucide-react";
import {
  AdminStatStrip,
  AdminStatStripItem,
} from "@/components/admin/stat-card";
import { AdminTable, AdminTableHead } from "@/components/admin/table";
import { StatusBadge } from "@/components/admin/status-badges";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { SearchBar } from "@/components/ui/search-bar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useTranslations } from "@/lib/i18n/client";
import { FormattedDate } from "@/components/ui/formatted-date";
import {
  type AdminUserItem,
  type AdminUserStats,
  getAdminUsersData,
  updateUserRolesAction,
  updateUserStatusAction,
} from "@/app/(admin)/admin/(academic)/users/actions";
import { type PeranCode } from "@/lib/auth/peran";

interface UsersDashboardProps {
  initialUsers: AdminUserItem[];
  initialStats: AdminUserStats;
  initialTotal: number;
  currentUserId: string;
}

const ROLE_OPTIONS: Array<{ code: PeranCode; label: string; description: string }> = [
  {
    code: "admin",
    label: "Admin",
    description: "Akses penuh manajemen sistem, akademik, dan konten",
  },
  {
    code: "tutor",
    label: "Tutor",
    description: "Akses panel pengajaran, materi, kuis, dan grading",
  },
  {
    code: "murid",
    label: "Murid",
    description: "Akses modul belajar, kuis, dan jadwal mahasiswa",
  },
];

function UserAvatar({ name, image }: { name: string; image: string | null }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  if (image && failedImage !== image) {
    return <Image unoptimized loading="eager" width={32} height={32} src={image} alt="" onError={() => setFailedImage(image)} className="size-8 rounded-full object-cover shrink-0 border border-border" />;
  }
  return (
    <div aria-hidden className="size-8 rounded-full bg-muted text-foreground font-bold text-body-xs flex items-center justify-center shrink-0 border border-border">
      {name.charAt(0).toUpperCase() || "?"}
    </div>
  );
}

export function UsersDashboard({
  initialUsers,
  initialStats,
  initialTotal,
  currentUserId,
}: UsersDashboardProps) {
  const t = useTranslations("adminOps");
  const [users, setUsers] = useState<AdminUserItem[]>(initialUsers);
  const [stats, setStats] = useState<AdminUserStats>(initialStats);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(initialTotal);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const initial = useRef(true);
  useEffect(() => {
    if (initial.current) { initial.current = false; return; }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void getAdminUsersData({ page, search: searchQuery, role: roleFilter, status: statusFilter }).then((result) => {
        if (cancelled) return;
        if (page > 1 && result.users.length === 0 && result.total > 0) {
          setPage(Math.ceil(result.total / 30));
          return;
        }
        setUsers(result.users);
        setStats(result.stats);
        setTotal(result.total);
      }).catch(() => { if (!cancelled) toast.error(t("usersUI.updateStatusFailure")); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [page, searchQuery, roleFilter, statusFilter, revision, t]);

  // Edit Roles State
  const [editingUser, setEditingUser] = useState<AdminUserItem | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<PeranCode[]>([]);
  const [isSavingRoles, startSaveRoles] = useTransition();

  // Status Change Confirmation State
  const [statusTargetUser, setStatusTargetUser] = useState<AdminUserItem | null>(null);
  const [isUpdatingStatus, startUpdateStatus] = useTransition();

  const filteredUsers = users;

  const handleOpenRoleModal = (userItem: AdminUserItem) => {
    setEditingUser(userItem);
    setSelectedRoles([...userItem.roles]);
  };

  const handleToggleRole = (code: PeranCode) => {
    setSelectedRoles((prev) =>
      prev.includes(code) ? prev.filter((r) => r !== code) : [...prev, code]
    );
  };

  const handleSaveRoles = () => {
    if (!editingUser) return;

    if (selectedRoles.length === 0) {
      toast.error(t("usersUI.chooseRole"));
      return;
    }

    if (editingUser.id === currentUserId && !selectedRoles.includes("admin")) {
      toast.error(t("usersUI.cannotRemoveOwnAdmin"));
      return;
    }

    startSaveRoles(async () => {
      const res = await updateUserRolesAction(editingUser.id, selectedRoles);
      if (res.success) {
        toast.success(t("usersUI.rolesSaved", { name: editingUser.name }));
        setEditingUser(null);
        setRevision((value) => value + 1);
      } else {
        toast.error(t("usersUI.updateRoleFailure"));
      }
    });
  };

  const handleConfirmStatusChange = () => {
    if (!statusTargetUser) return;
    const nextStatus: "active" | "suspended" =
      statusTargetUser.status === "active" ? "suspended" : "active";

    startUpdateStatus(async () => {
      const res = await updateUserStatusAction(statusTargetUser.id, nextStatus);
      if (res.success) {
        const label = nextStatus === "active" ? t("usersUI.accountActivated") : t("usersUI.accountSuspended");
        toast.success(t("usersUI.statusUpdated", { name: statusTargetUser.name, status: label }));
        setStatusTargetUser(null);
        setRevision((value) => value + 1);
      } else {
        toast.error(t("usersUI.updateStatusFailure"));
      }
    });
  };

  const isFilterActive =
    searchQuery.trim().length > 0 || roleFilter !== "all" || statusFilter !== "all";

  const handleResetFilters = () => {
    setPage(1);
    setSearchQuery("");
    setRoleFilter("all");
    setStatusFilter("all");
  };

  return (
    <div className="space-y-4 font-sans text-left">
      {/* Grouped KPI Strip */}
      <AdminStatStrip className="grid-cols-2 md:grid-cols-5">
        <AdminStatStripItem
          label={t("usersUI.total")}
          value={stats.totalUsers}
          icon={Users}
          tone="default"
        />
        <AdminStatStripItem
          label={t("usersUI.admins")}
          value={stats.adminCount}
          icon={ShieldCheck}
          tone="brand"
        />
        <AdminStatStripItem
          label={t("usersUI.tutors")}
          value={stats.tutorCount}
          icon={GraduationCap}
          tone="info"
        />
        <AdminStatStripItem
          label={t("usersUI.students")}
          value={stats.muridCount}
          icon={BookOpen}
          tone="default"
        />
        <AdminStatStripItem
          label={t("usersUI.activeUsers")}
          value={stats.activeCount}
          icon={UserCheck}
          tone="success"
        />
      </AdminStatStrip>

      {/* Inline Responsive Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[140px] max-w-sm">
          <SearchBar
            size="sm"
            value={searchQuery}
            onSearch={(value) => { setPage(1); setSearchQuery(value); }}
            onClear={() => { setPage(1); setSearchQuery(""); }}
            isLoading={loading}
            placeholder={t("usersUI.search")}
          />
        </div>

        <Select value={roleFilter} onValueChange={(value) => { setPage(1); setRoleFilter(value); }}>
          <SelectTrigger className="h-9 w-[130px] shrink-0 text-body-sm bg-card rounded-lg border-border">
            <SelectValue placeholder={t("usersUI.allRoles")} />
          </SelectTrigger>
          <SelectContent className="rounded-lg text-body-sm">
            <SelectItem value="all">{t("usersUI.allRoles")}</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="tutor">Tutor</SelectItem>
            <SelectItem value="murid">{t("usersUI.students")}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(value) => { setPage(1); setStatusFilter(value); }}>
          <SelectTrigger className="h-9 w-[140px] shrink-0 text-body-sm bg-card rounded-lg border-border">
            <SelectValue placeholder={t("usersUI.allStatuses")} />
          </SelectTrigger>
          <SelectContent className="rounded-lg text-body-sm">
            <SelectItem value="all">{t("usersUI.allStatuses")}</SelectItem>
            <SelectItem value="active">{t("usersUI.active")}</SelectItem>
            <SelectItem value="suspended">{t("usersUI.suspended")}</SelectItem>
          </SelectContent>
        </Select>

        {isFilterActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetFilters}
            className="h-9 px-2.5 rounded-lg text-body-sm gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
            <span>{t("usersUI.reset")}</span>
          </Button>
        )}

        <div className="ml-auto text-body-xs text-muted-foreground self-center">
          {t("usersUI.resultCount", { shown: filteredUsers.length, total })}
        </div>
      </div>

      {/* Users Table */}
      {filteredUsers.length === 0 ? (
        <AdminEmptyState
          title={t("usersUI.emptyTitle")}
          description={
            isFilterActive
              ? t("usersUI.emptyFiltered")
              : t("usersUI.empty")
          }
        />
      ) : (
        <AdminTable>
          <table className="w-full min-w-[640px] text-left text-body-sm border-collapse">
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 font-semibold text-foreground">{t("usersUI.user")}</th>
                <th className="px-4 py-3 font-semibold text-foreground">{t("usersUI.role")}</th>
                <th className="px-4 py-3 font-semibold text-foreground">{t("usersUI.status")}</th>
                <th className="px-4 py-3 font-semibold text-foreground">{t("usersUI.joined")}</th>
                <th className="px-4 py-3 font-semibold text-foreground text-right">{t("usersUI.actions")}</th>
              </tr>
            </AdminTableHead>
            <tbody className="divide-y divide-border">
              {filteredUsers.map((userItem) => {
                const isSelf = userItem.id === currentUserId;

                return (
                  <tr
                    key={userItem.id}
                    className="hover:bg-muted/40 transition-colors"
                  >
                    {/* User info */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <UserAvatar name={userItem.name} image={userItem.image ?? null} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-foreground truncate">
                              {userItem.name}
                            </span>
                            {isSelf && (
                              <span className="text-body-2xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                                Anda
                              </span>
                            )}
                          </div>
                          <div className="text-body-xs text-muted-foreground flex items-center gap-1 truncate">
                            <Mail className="size-3 shrink-0" />
                            <span className="truncate">{userItem.email}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Roles */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {userItem.roles.map((role) => (
                          <StatusBadge
                            key={role}
                            tone={
                              role === "admin"
                                ? "brand"
                                : role === "tutor"
                                ? "info"
                                : "muted"
                            }
                          >
                            {role === "admin" ? t("usersUI.admin") : role === "tutor" ? t("usersUI.tutor") : t("usersUI.student")}
                          </StatusBadge>
                        ))}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge
                        tone={userItem.status === "active" ? "success" : "error"}
                      >
                        {userItem.status === "active" ? t("usersUI.active") : t("usersUI.suspended")}
                      </StatusBadge>
                    </td>

                    {/* Created Date */}
                    <td className="px-4 py-3 text-body-xs text-muted-foreground whitespace-nowrap">
                      {userItem.createdAt ? (
                        <FormattedDate date={userItem.createdAt} options={{ dateStyle: "medium" }} />
                      ) : (
                        "-"
                      )}
                    </td>

                    {/* Action buttons */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenRoleModal(userItem)}
                          className="h-8 px-2.5 rounded-lg text-body-sm gap-1.5"
                        >
                          <UserCog className="size-3.5" />
                          <span>{t("usersUI.setRoles")}</span>
                        </Button>

                        <Button
                          variant={userItem.status === "active" ? "ghost" : "outline"}
                          size="sm"
                          disabled={isSelf}
                          onClick={() => setStatusTargetUser(userItem)}
                          className={`h-8 px-2.5 rounded-lg text-body-sm gap-1.5 ${
                            userItem.status === "active"
                              ? "text-status-error hover:bg-status-error/10 hover:text-status-error"
                              : "text-status-success hover:bg-status-success/10 hover:text-status-success"
                          }`}
                          title={
                            isSelf
                              ? t("usersUI.cannotSuspendSelf")
                              : userItem.status === "active"
                              ? t("usersUI.suspendAccount")
                              : t("usersUI.activateAccount")
                          }
                        >
                          {userItem.status === "active" ? (
                            <>
                              <ShieldAlert className="size-3.5" />
                              <span className="hidden sm:inline">{t("usersUI.suspend")}</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="size-3.5" />
                              <span className="hidden sm:inline">{t("usersUI.activate")}</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </AdminTable>
      )}

      {total > 30 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>{t("notificationUI.previous")}</Button>
          <span className="text-body-xs">{page} / {Math.ceil(total / 30)}</span>
          <Button variant="outline" size="sm" disabled={page * 30 >= total || loading} onClick={() => setPage(page + 1)}>{t("notificationUI.next")}</Button>
        </div>
      )}

      {/* Edit Roles Dialog */}
      <Dialog
        open={Boolean(editingUser)}
        onOpenChange={(open) => {
          if (!isSavingRoles && !open) setEditingUser(null);
        }}
      >
        <DialogContent className="max-w-md rounded-xl border border-border p-6 shadow-xl text-left">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold flex items-center gap-2">
              <UserCog className="size-5 text-brand-primary" />
              {t("usersUI.manageRoles")}
            </DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              {t("usersUI.rolesDescription", { name: editingUser?.name ?? "", email: editingUser?.email ?? "" })}
            </DialogDescription>
          </DialogHeader>

          <div className="divide-y divide-border my-2">
            {ROLE_OPTIONS.map((opt) => {
              const checked = selectedRoles.includes(opt.code);
              const isSelfAdmin =
                editingUser?.id === currentUserId && opt.code === "admin";

              return (
                <div
                  key={opt.code}
                  onClick={() => !isSelfAdmin && handleToggleRole(opt.code)}
                  className={`flex items-start gap-3 px-2 py-3 transition-colors cursor-pointer ${
                    checked
                      ? "bg-primary/5"
                      : "hover:bg-muted/30"
                  } ${isSelfAdmin ? "cursor-not-allowed opacity-80" : ""}`}
                >
                  <Checkbox
                    checked={checked}
                    disabled={isSelfAdmin}
                    onCheckedChange={() => !isSelfAdmin && handleToggleRole(opt.code)}
                    className="mt-0.5 rounded-md"
                  />
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-body-sm font-semibold text-foreground">
                        {opt.code === "murid" ? t("usersUI.student") : t(`usersUI.${opt.code}`)}
                      </span>
                    </div>
                    <p className="text-body-xs text-muted-foreground">
                      {t(`usersUI.${opt.code === "murid" ? "studentRoleDesc" : `${opt.code}RoleDesc`}`)}
                    </p>
                    {isSelfAdmin && (
                      <p className="text-[10px] text-status-warning font-medium">
                        {t("usersUI.selfAdminRequired")}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="flex items-center justify-end gap-2 mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingUser(null)}
              disabled={isSavingRoles}
              className="h-9 px-4 rounded-lg text-body-sm font-semibold"
            >
              {t("usersUI.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleSaveRoles}
              disabled={isSavingRoles}
              isLoading={isSavingRoles}
              className="h-9 px-5 rounded-lg text-body-sm font-semibold"
            >
              {t("usersUI.saveRoles")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Account Status Confirmation Dialog */}
      <AdminConfirmDialog
        open={Boolean(statusTargetUser)}
        onOpenChange={(open) => !open && setStatusTargetUser(null)}
        title={
          statusTargetUser?.status === "active"
            ? t("usersUI.suspendTitle")
            : t("usersUI.activateTitle")
        }
        description={
          statusTargetUser?.status === "active"
            ? t("usersUI.suspendDescription", { name: statusTargetUser?.name ?? "" })
            : t("usersUI.activateDescription", { name: statusTargetUser?.name ?? "" })
        }
        confirmLabel={
          statusTargetUser?.status === "active"
            ? t("usersUI.confirmSuspend")
            : t("usersUI.confirmActivate")
        }
        cancelLabel={t("usersUI.cancel")}
        destructive={statusTargetUser?.status === "active"}
        loading={isUpdatingStatus}
        onConfirm={handleConfirmStatusChange}
      />
    </div>
  );
}
