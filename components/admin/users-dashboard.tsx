"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  ShieldCheck,
  GraduationCap,
  BookOpen,
  UserCheck,
  Search,
  RotateCcw,
  UserCog,
  ShieldAlert,
  Mail,
  Calendar,
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
import { Input } from "@/components/ui/input";
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
import { FormattedDate } from "@/components/ui/formatted-date";
import {
  type AdminUserItem,
  type AdminUserStats,
  updateUserRolesAction,
  updateUserStatusAction,
} from "@/app/(admin)/admin/(academic)/users/actions";
import { type PeranCode } from "@/lib/auth/peran";

interface UsersDashboardProps {
  initialUsers: AdminUserItem[];
  initialStats: AdminUserStats;
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

export function UsersDashboard({
  initialUsers,
  initialStats,
  currentUserId,
}: UsersDashboardProps) {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserItem[]>(initialUsers);
  const [stats, setStats] = useState<AdminUserStats>(initialStats);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Edit Roles State
  const [editingUser, setEditingUser] = useState<AdminUserItem | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<PeranCode[]>([]);
  const [isSavingRoles, startSaveRoles] = useTransition();

  // Status Change Confirmation State
  const [statusTargetUser, setStatusTargetUser] = useState<AdminUserItem | null>(null);
  const [isUpdatingStatus, startUpdateStatus] = useTransition();

  // Filtered Users
  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (query) {
        const matchName = u.name.toLowerCase().includes(query);
        const matchEmail = u.email.toLowerCase().includes(query);
        if (!matchName && !matchEmail) return false;
      }

      if (roleFilter !== "all") {
        if (!u.roles.includes(roleFilter as PeranCode)) return false;
      }

      if (statusFilter !== "all") {
        if (u.status !== statusFilter) return false;
      }

      return true;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

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
      toast.error("Pilih minimal satu peran.");
      return;
    }

    if (editingUser.id === currentUserId && !selectedRoles.includes("admin")) {
      toast.error("Tidak dapat mencabut peran admin dari akun Anda sendiri.");
      return;
    }

    startSaveRoles(async () => {
      const res = await updateUserRolesAction(editingUser.id, selectedRoles);
      if (res.success) {
        toast.success(`Peran untuk ${editingUser.name} berhasil diperbarui.`);
        setUsers((prev) =>
          prev.map((u) =>
            u.id === editingUser.id ? { ...u, roles: selectedRoles } : u
          )
        );
        // Update stats
        recomputeStats(
          users.map((u) =>
            u.id === editingUser.id ? { ...u, roles: selectedRoles } : u
          )
        );
        setEditingUser(null);
        router.refresh();
      } else {
        toast.error(res.error || "Gagal memperbarui peran.");
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
        const label = nextStatus === "active" ? "diaktifkan" : "ditangguhkan";
        toast.success(`Akun ${statusTargetUser.name} berhasil ${label}.`);
        setUsers((prev) =>
          prev.map((u) =>
            u.id === statusTargetUser.id ? { ...u, status: nextStatus } : u
          )
        );
        recomputeStats(
          users.map((u) =>
            u.id === statusTargetUser.id ? { ...u, status: nextStatus } : u
          )
        );
        setStatusTargetUser(null);
        router.refresh();
      } else {
        toast.error(res.error || "Gagal memperbarui status akun.");
      }
    });
  };

  const recomputeStats = (updatedList: AdminUserItem[]) => {
    let adminCount = 0;
    let tutorCount = 0;
    let muridCount = 0;
    let activeCount = 0;
    let suspendedCount = 0;

    for (const u of updatedList) {
      if (u.roles.includes("admin")) adminCount++;
      if (u.roles.includes("tutor")) tutorCount++;
      if (u.roles.includes("murid")) muridCount++;
      if (u.status === "active") activeCount++;
      else suspendedCount++;
    }

    setStats({
      totalUsers: updatedList.length,
      adminCount,
      tutorCount,
      muridCount,
      activeCount,
      suspendedCount,
    });
  };

  const isFilterActive =
    searchQuery.trim().length > 0 || roleFilter !== "all" || statusFilter !== "all";

  const handleResetFilters = () => {
    setSearchQuery("");
    setRoleFilter("all");
    setStatusFilter("all");
  };

  return (
    <div className="space-y-4 font-sans text-left">
      {/* Grouped KPI Strip */}
      <AdminStatStrip className="grid-cols-2 md:grid-cols-5">
        <AdminStatStripItem
          label="Total Pengguna"
          value={stats.totalUsers}
          icon={Users}
          tone="default"
        />
        <AdminStatStripItem
          label="Admin"
          value={stats.adminCount}
          icon={ShieldCheck}
          tone="brand"
        />
        <AdminStatStripItem
          label="Tutor"
          value={stats.tutorCount}
          icon={GraduationCap}
          tone="info"
        />
        <AdminStatStripItem
          label="Murid"
          value={stats.muridCount}
          icon={BookOpen}
          tone="default"
        />
        <AdminStatStripItem
          label="Pengguna Aktif"
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
            onSearch={setSearchQuery}
            onClear={() => setSearchQuery("")}
            placeholder="Cari nama atau email..."
          />
        </div>

        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-9 w-[130px] shrink-0 text-body-sm bg-card rounded-lg border-border">
            <SelectValue placeholder="Semua Peran" />
          </SelectTrigger>
          <SelectContent className="rounded-lg text-body-sm">
            <SelectItem value="all">Semua Peran</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="tutor">Tutor</SelectItem>
            <SelectItem value="murid">Murid</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[140px] shrink-0 text-body-sm bg-card rounded-lg border-border">
            <SelectValue placeholder="Semua Status" />
          </SelectTrigger>
          <SelectContent className="rounded-lg text-body-sm">
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="active">Aktif</SelectItem>
            <SelectItem value="suspended">Ditangguhkan</SelectItem>
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
            <span>Reset</span>
          </Button>
        )}

        <div className="ml-auto text-body-xs text-muted-foreground self-center">
          Menampilkan {filteredUsers.length} dari {users.length} pengguna
        </div>
      </div>

      {/* Users Table */}
      {filteredUsers.length === 0 ? (
        <AdminEmptyState
          title="Tidak ada pengguna ditemukan"
          description={
            isFilterActive
              ? "Coba sesuaikan kata kunci pencarian atau filter yang dipilih."
              : "Belum ada data pengguna terdaftar dalam sistem."
          }
        />
      ) : (
        <AdminTable>
          <table className="w-full text-left text-body-sm border-collapse">
            <AdminTableHead>
              <tr>
                <th className="px-4 py-3 font-semibold text-foreground">Pengguna</th>
                <th className="px-4 py-3 font-semibold text-foreground">Peran</th>
                <th className="px-4 py-3 font-semibold text-foreground">Status</th>
                <th className="px-4 py-3 font-semibold text-foreground">Bergabung</th>
                <th className="px-4 py-3 font-semibold text-foreground text-right">Aksi</th>
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
                        {userItem.image ? (
                          <img
                            src={userItem.image}
                            alt={userItem.name}
                            className="size-8 rounded-full object-cover shrink-0 border border-border"
                          />
                        ) : (
                          <div className="size-8 rounded-full bg-brand-primary/10 text-brand-primary font-bold text-body-xs flex items-center justify-center shrink-0 border border-brand-primary/20">
                            {userItem.name.charAt(0).toUpperCase() || "?"}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-foreground truncate">
                              {userItem.name}
                            </span>
                            {isSelf && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-muted text-muted-foreground font-medium">
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
                            {role === "admin"
                              ? "Admin"
                              : role === "tutor"
                              ? "Tutor"
                              : "Murid"}
                          </StatusBadge>
                        ))}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge
                        tone={userItem.status === "active" ? "success" : "error"}
                      >
                        {userItem.status === "active" ? "Aktif" : "Ditangguhkan"}
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
                          <span>Atur Peran</span>
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
                              ? "Tidak dapat menangguhkan akun sendiri"
                              : userItem.status === "active"
                              ? "Tangguhkan akun"
                              : "Aktifkan akun"
                          }
                        >
                          {userItem.status === "active" ? (
                            <>
                              <ShieldAlert className="size-3.5" />
                              <span className="hidden sm:inline">Tangguhkan</span>
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="size-3.5" />
                              <span className="hidden sm:inline">Aktifkan</span>
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

      {/* Edit Roles Dialog */}
      <Dialog open={Boolean(editingUser)} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="max-w-md rounded-xl border border-border p-6 shadow-xl text-left">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold flex items-center gap-2">
              <UserCog className="size-5 text-brand-primary" />
              Kelola Peran Pengguna
            </DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              Atur satu atau beberapa peran untuk {editingUser?.name} ({editingUser?.email}).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 my-3">
            {ROLE_OPTIONS.map((opt) => {
              const checked = selectedRoles.includes(opt.code);
              const isSelfAdmin =
                editingUser?.id === currentUserId && opt.code === "admin";

              return (
                <div
                  key={opt.code}
                  onClick={() => !isSelfAdmin && handleToggleRole(opt.code)}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                    checked
                      ? "border-brand-primary/30 bg-brand-primary/5"
                      : "border-border bg-card hover:bg-muted/30"
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
                        {opt.label}
                      </span>
                      {opt.code === "admin" && (
                        <StatusBadge tone="brand">Admin</StatusBadge>
                      )}
                      {opt.code === "tutor" && (
                        <StatusBadge tone="info">Tutor</StatusBadge>
                      )}
                      {opt.code === "murid" && (
                        <StatusBadge tone="muted">Murid</StatusBadge>
                      )}
                    </div>
                    <p className="text-body-xs text-muted-foreground">
                      {opt.description}
                    </p>
                    {isSelfAdmin && (
                      <p className="text-[10px] text-status-warning font-medium">
                        Akun aktif sendiri harus tetap memiliki peran admin.
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
              className="h-9 px-4 rounded-lg text-body-sm font-semibold"
            >
              Batal
            </Button>
            <Button
              size="sm"
              onClick={handleSaveRoles}
              disabled={isSavingRoles}
              className="h-9 px-5 rounded-lg text-body-sm font-semibold"
            >
              {isSavingRoles ? "Menyimpan..." : "Simpan Peran"}
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
            ? "Tangguhkan Akun Pengguna"
            : "Aktifkan Akun Pengguna"
        }
        description={
          statusTargetUser?.status === "active"
            ? `Apakah Anda yakin ingin menangguhkan akun ${statusTargetUser?.name}? Pengguna ini tidak akan dapat mengakses sesi atau fitur platform selama ditangguhkan.`
            : `Apakah Anda yakin ingin mengaktifkan kembali akun ${statusTargetUser?.name}?`
        }
        confirmLabel={
          statusTargetUser?.status === "active"
            ? "Ya, Tangguhkan"
            : "Ya, Aktifkan"
        }
        cancelLabel="Batal"
        destructive={statusTargetUser?.status === "active"}
        loading={isUpdatingStatus}
        onConfirm={handleConfirmStatusChange}
      />
    </div>
  );
}
