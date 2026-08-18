"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { Copy, Trash2, KeyRound, Check, RefreshCw, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>(
    coursesList[0] ? [coursesList[0].id] : []
  );
  const [capacity, setCapacity] = useState<number>(3); // Default capacity is 3 people
  const [loading, setLoading] = useState(false);
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; token: string } | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedCourseIds.length === 0) {
      toast.error("Silakan pilih setidaknya satu course");
      return;
    }

    setLoading(true);
    try {
      const res = await generateEnrollmentToken(selectedCourseIds, capacity);
      if (res.success) {
        toast.success(`Token berhasil dibuat: ${res.token}`);
        setSelectedCourseIds(coursesList[0] ? [coursesList[0].id] : []);
        setCapacity(3);
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
    <div className="space-y-8">
      {/* Generate Form */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
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
                <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto p-1.5 border border-border/80 rounded-2xl bg-muted/10">
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

            {/* Group Size Selection */}
            <div className="space-y-4">
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

              {/* Token Preview */}
              <div className="rounded-xl border border-border/80 bg-muted/10 p-4">
                <span className="text-body-xs font-semibold text-muted-foreground block mb-1">
                  Pratinjau Format Token:
                </span>
                <div className="font-mono text-body-sm font-bold text-foreground bg-card px-3 py-2 rounded-lg border border-border select-none">
                  Zyx-XXXXXXXX-{capacity}-{selectedCourseIds.length}
                </div>
                <p className="text-body-xs text-muted-foreground mt-2">
                  Token ini dapat digunakan hingga <strong className="text-foreground">{capacity} orang</strong> berbeda, dan mengaktifkan <strong className="text-foreground">{selectedCourseIds.length} kelas</strong> sekaligus.
                </p>
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
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-6 py-4">
          <h2 className="font-heading text-body-base font-bold text-foreground">
            Daftar Token ({initialTokens.length})
          </h2>
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

        {initialTokens.length === 0 ? (
          <div className="p-8 text-center text-body-sm text-muted-foreground">
            Belum ada token pendaftaran kelas yang dibuat.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-3xl text-left text-body-sm">
              <thead>
                <tr className="border-b border-border bg-muted/10">
                  <th scope="col" className="px-6 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Token String
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Kapasitas Kelompok
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Mata Kuliah
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Tanggal Kedaluwarsa
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Anggota Terdaftar
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-body-xs font-semibold uppercase tracking-wide text-muted-foreground text-center">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {initialTokens.map((t) => {
                  const now = new Date();
                  const membersCount = t.group?.members.length || 0;
                  const isFull = membersCount >= t.capacity;
                  const isExpired = !isFull && new Date(t.expiresAt) < now;

                  let statusBadge = (
                    <span className="inline-flex rounded-md bg-brand-primary/10 px-2.5 py-0.5 text-body-xs font-semibold text-brand-primary">
                      Aktif
                    </span>
                  );

                  if (isFull) {
                    statusBadge = (
                      <span className="inline-flex rounded-md bg-status-success/10 px-2.5 py-0.5 text-body-xs font-semibold text-status-success">
                        Penuh
                      </span>
                    );
                  } else if (isExpired) {
                    statusBadge = (
                      <span className="inline-flex rounded-md bg-muted px-2.5 py-0.5 text-body-xs font-semibold text-muted-foreground ring-1 ring-border">
                        Kedaluwarsa
                      </span>
                    );
                  }

                  return (
                    <tr key={t.id} className="border-b border-border/60 last:border-0 hover:bg-muted/10">
                      <td className="px-6 py-4 font-mono font-bold text-foreground">
                        <div className="flex items-center gap-2">
                          <span>{t.token}</span>
                          <button
                            onClick={() => handleCopy(t.token, t.id)}
                            className="text-muted-foreground hover:text-foreground focus:outline-none transition-colors"
                            title="Salin token"
                          >
                            {copiedTokenId === t.id ? (
                              <Check className="size-3.5 text-status-success" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 text-body-sm font-semibold">
                            <span className="text-foreground">{membersCount}</span>
                            <span className="text-muted-foreground font-normal">/</span>
                            <span className="text-muted-foreground font-normal">{t.capacity}</span>
                          </div>
                          {/* Visual slots representation */}
                          <div className="flex gap-1.5">
                            {Array.from({ length: t.capacity }).map((_, idx) => {
                              const isFilled = idx < membersCount;
                              return (
                                <div
                                  key={idx}
                                  className={`size-2.5 rounded-full border transition-all ${
                                    isFilled
                                      ? "bg-status-success border-status-success/30 shadow-sm shadow-status-success/10"
                                      : "bg-muted border-border"
                                  }`}
                                  title={isFilled ? "Slot Terisi" : "Slot Kosong"}
                                />
                              );
                            })}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5 max-w-xs">
                          {t.courses.map((c) => (
                            <span
                              key={c.id}
                              className="inline-flex rounded-md bg-brand-primary/5 dark:bg-brand-primary/10 px-2 py-0.5 text-body-xs font-semibold text-brand-primary border border-brand-primary/20"
                              title={c.id}
                            >
                              {c.title}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 tabular-nums text-muted-foreground">
                        {new Date(t.expiresAt).toLocaleDateString("id-ID", {
                          dateStyle: "medium",
                        })}
                      </td>
                      <td className="px-6 py-4">{statusBadge}</td>
                      <td className="px-6 py-4">
                        {t.group && t.group.members.length > 0 ? (
                          <div className="space-y-2 max-w-xs max-h-24 overflow-y-auto pr-1">
                            {t.group.members.map((m) => (
                              <div key={m.userId} className="border-b border-border/40 pb-1 last:border-0 last:pb-0">
                                <p className="font-semibold text-foreground text-body-xs truncate">
                                  {m.user.name}
                                </p>
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {m.user.email}
                                </p>
                                <p className="text-[10px] text-muted-foreground/80 tabular-nums">
                                  {new Date(m.joinedAt).toLocaleDateString("id-ID", {
                                    dateStyle: "short",
                                  })}{" "}
                                  {new Date(m.joinedAt).toLocaleTimeString("id-ID", {
                                    timeStyle: "short",
                                  })}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-body-xs italic">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPendingDelete({ id: t.id, token: t.token })}
                          className="size-8 rounded-full text-status-error hover:bg-status-error/10 hover:text-status-error focus:outline-none"
                          title="Hapus token"
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Token</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus token <strong className="font-mono">{pendingDelete?.token}</strong>? Siswa yang sudah terdaftar tetap memiliki akses.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Batal</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
