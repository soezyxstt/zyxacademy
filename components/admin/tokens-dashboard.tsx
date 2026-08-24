"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Copy, Trash2, KeyRound, Check, RefreshCw, User, Users, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/ui/search-bar";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import { generateEnrollmentToken, deleteEnrollmentToken } from "@/app/(admin)/admin/(academic)/tokens/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

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

export function TokensDashboard({ initialTokens, coursesList }: Props) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>(
    coursesList[0] ? [coursesList[0].id] : []
  );
  const [capacity, setCapacity] = useState<number>(3);
  const [packageType, setPackageType] = useState<"reguler_15" | "intensif_30" | "super_intensif_45">("reguler_15");
  const [loading, setLoading] = useState(false);
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; token: string } | null>(null);

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
      toast.error("Silakan pilih setidaknya satu course");
      return;
    }

    setLoading(true);
    try {
      const res = await generateEnrollmentToken(selectedCourseIds, capacity, packageType);
      if (res.success) {
        toast.success(`Token berhasil dibuat: ${res.token}`);
        setSelectedCourseIds(coursesList[0] ? [coursesList[0].id] : []);
        setCapacity(3);
        setPackageType("reguler_15");
        router.refresh();
      } else {
        toast.error(res.error || "Gagal membuat token");
      }
    } catch (err) {
      console.error(err);
      toast.error("Terjadi kesalahan koneksi");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDelete) return;

    try {
      const res = await deleteEnrollmentToken(pendingDelete.id);
      setPendingDelete(null);
      if (res.success) {
        toast.success("Token berhasil dihapus");
        router.refresh();
      } else {
        toast.error(res.error || "Gagal menghapus token");
      }
    } catch (err) {
      console.error(err);
      toast.error("Terjadi kesalahan koneksi");
    }
  };

  const handleCopy = (tokenStr: string, tokenId: string) => {
    navigator.clipboard.writeText(tokenStr);
    setCopiedTokenId(tokenId);
    toast.success("Token disalin ke papan klip!");
    setTimeout(() => setCopiedTokenId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* KPI Stats Strip */}
      <AdminStatStrip className="grid-cols-2 lg:grid-cols-4">
        <AdminStatStripItem
          label="Total Token"
          value={stats.total}
          icon={KeyRound}
          tone="brand"
        />
        <AdminStatStripItem
          label="Token Aktif"
          value={stats.active}
          icon={CheckCircle2}
          tone="success"
        />
        <AdminStatStripItem
          label="Kapasitas Total"
          value={stats.totalCapacity}
          icon={Users}
          tone="info"
        />
        <AdminStatStripItem
          label="Murid Terdaftar"
          value={stats.registeredMembers}
          icon={ShieldCheck}
          tone="default"
        />
      </AdminStatStrip>

      {/* Generate Form */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="font-heading text-body-base font-bold text-foreground flex items-center gap-2 mb-4">
          <KeyRound className="size-5 text-brand-primary" />
          Buat Token Baru
        </h2>
        
        <form onSubmit={handleGenerate} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Course Selection */}
            <div className="space-y-2">
              <label className="text-body-xs font-semibold text-muted-foreground block">
                Pilih Course / Kelas (Bisa pilih lebih dari satu)
              </label>
              {coursesList.length === 0 ? (
                <p className="text-body-sm text-muted-foreground italic">Tidak ada course tersedia.</p>
              ) : (
                  <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto p-1.5 border border-border/80 rounded-xl bg-muted/10">
                  {coursesList.map((c) => {
                    const isChecked = selectedCourseIds.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all hover:bg-muted/40 ${
                          isChecked
                            ? "border-brand-primary bg-brand-primary/5 dark:bg-brand-primary/10"
                            : "border-border bg-card"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setSelectedCourseIds((prev) =>
                              prev.includes(c.id)
                                ? prev.filter((id) => id !== c.id)
                                : [...prev, c.id]
                            );
                          }}
                          className="mt-0.5 size-4 accent-brand-primary rounded border-border focus:ring-brand-primary focus:ring-offset-0 focus:ring-1"
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

            {/* Group Size & Package Selection */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-body-xs font-semibold text-muted-foreground block">
                  Paket Kuota Pertemuan Semester
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "reguler_15" as const, label: "15 Sesi", sub: "1x / minggu" },
                    { id: "intensif_30" as const, label: "30 Sesi", sub: "2x / minggu" },
                    { id: "super_intensif_45" as const, label: "45 Sesi", sub: "3x / minggu" },
                  ].map((p) => {
                    const isActive = packageType === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPackageType(p.id)}
                        className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-left transition-all ${
                          isActive
                            ? "border-brand-primary bg-brand-primary/10 text-brand-primary font-semibold"
                            : "border-border bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                        }`}
                      >
                        <span className="text-body-sm font-bold">{p.label}</span>
                        <span className="text-[10px] text-muted-foreground">{p.sub}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-body-xs font-semibold text-muted-foreground block">
                  Kapasitas Kelompok (Jumlah Orang)
                </label>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5].map((num) => {
                    const isActive = capacity === num;
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setCapacity(num)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 rounded-md border text-body-sm font-semibold transition-all ${
                          isActive
                            ? "border-brand-primary bg-brand-primary text-white shadow-sm shadow-brand-primary/20"
                            : "border-border bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                        }`}
                      >
                        {num === 1 ? <User className="size-4" /> : <Users className="size-4" />}
                        <span>{num} Orang</span>
                      </button>
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
              className="h-11 rounded-lg px-8 bg-brand-primary text-white hover:bg-brand-primary/95 transition-all shadow-md shadow-brand-primary/10"
            >
              {loading ? "Membuat..." : "Generate Token"}
            </Button>
          </div>
        </form>
      </div>

      {/* Tokens List */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-6 py-4">
          <div className="flex flex-1 items-center gap-3 min-w-[200px] max-w-md">
            <SearchBar
              size="sm"
              value={searchQuery}
              onSearch={setSearchQuery}
              onClear={() => setSearchQuery("")}
              placeholder="Cari token, kelas, atau murid..."
              containerClassName="w-full"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-body-xs font-semibold text-muted-foreground">
              {filteredTokens.length} dari {initialTokens.length} token
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                router.refresh();
                toast.success("Daftar token diperbarui");
              }}
              className="rounded-md gap-1 text-muted-foreground"
            >
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
          </div>
        </div>

        {filteredTokens.length === 0 ? (
          <div className="p-8 text-center text-body-sm text-muted-foreground">
            {searchQuery ? "Tidak ada token yang cocok dengan pencarian." : "Belum ada token pendaftaran kelas yang dibuat."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-3xl text-left text-body-sm">
              <thead>
                <tr className="border-b border-border bg-muted/10">
                    <th scope="col" className="px-6 py-3.5 text-body-xs font-semibold text-muted-foreground">
                      Token string
                  </th>
                    <th scope="col" className="px-6 py-3.5 text-body-xs font-semibold text-muted-foreground">
                      Kapasitas kelompok
                  </th>
                    <th scope="col" className="px-6 py-3.5 text-body-xs font-semibold text-muted-foreground">
                      Mata kuliah
                  </th>
                    <th scope="col" className="px-6 py-3.5 text-body-xs font-semibold text-muted-foreground">
                      Tanggal kedaluwarsa
                  </th>
                    <th scope="col" className="px-6 py-3.5 text-body-xs font-semibold text-muted-foreground">
                    Status
                  </th>
                    <th scope="col" className="px-6 py-3.5 text-body-xs font-semibold text-muted-foreground">
                      Anggota terdaftar
                  </th>
                    <th scope="col" className="px-6 py-3.5 text-body-xs font-semibold text-muted-foreground text-center">
                    Aksi
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
                      <td className="px-6 py-4 font-mono font-bold text-foreground">
                        <div className="flex items-center gap-2">
                          <span>{t.token}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(t.token, t.id)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Salin token"
                          >
                            {copiedTokenId === t.id ? (
                              <Check className="size-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 text-body-xs font-medium text-foreground bg-muted/60 px-2.5 py-1 rounded-md border border-border">
                          <Users className="size-3 text-muted-foreground" />
                          {t.capacity} Orang
                        </span>
                      </td>
                      <td className="px-6 py-4">
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
                      <td className="px-6 py-4 text-body-xs text-muted-foreground">
                        {new Date(t.expiresAt).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-6 py-4">
                        {isExpired ? (
                          <span className="text-[10px] uppercase font-bold text-red-600 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
                            Kedaluwarsa
                          </span>
                        ) : isFull ? (
                          <span className="text-[10px] uppercase font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                            Penuh
                          </span>
                        ) : (
                          <span className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                            Aktif
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-body-xs">
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-foreground">
                            {membersCount} / {t.capacity} Mahasiswa
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
                      <td className="px-6 py-4 text-center">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setPendingDelete({ id: t.id, token: t.token })}
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded-md"
                          title="Hapus / Cabut Token"
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
      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus Token Aktivasi</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus token <strong className="text-foreground">{pendingDelete?.token}</strong>? Kelompok dan akses yang terkait akan dicabut.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button variant="outline">Batal</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Hapus Token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
