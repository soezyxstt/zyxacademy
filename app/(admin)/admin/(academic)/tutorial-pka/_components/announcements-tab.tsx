"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, History, Megaphone, CheckCircle2, XCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { createAndSendPkaAnnouncementAction, type PkaAnnouncementRow } from "../actions";

const TITLE_MAX = 100;
const BODY_MAX = 4000;

function formatRelative(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Baru saja";
  if (mins < 60) return `${mins}m lalu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}j lalu`;
  const days = Math.floor(hours / 24);
  return `${days}h lalu`;
}

export function AnnouncementsTab({ history }: { history: PkaAnnouncementRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast.error("Judul dan pesan wajib diisi.");
      return;
    }

    const formData = new FormData();
    formData.set("title", title);
    formData.set("body", body);

    startTransition(async () => {
      const res = await createAndSendPkaAnnouncementAction({}, formData);
      if (res.error) {
        toast.error("Gagal mengirim pengumuman", { description: res.error });
      } else {
        toast.success(`Pengumuman terkirim ke ${res.result?.recipientCount ?? 0} siswa.`, {
          description: `${res.result?.notificationsSucceeded ?? 0} push notification, ${res.result?.emailsSucceeded ?? 0} email berhasil.`,
        });
        setTitle("");
        setBody("");
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-8">
      <div className="grid items-start gap-6 lg:grid-cols-2">
        {/* Compose */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-5 py-3">
            <Megaphone className="size-4 text-brand-primary" aria-hidden />
            <h3 className="font-heading text-body-sm font-semibold text-foreground">Buat Pengumuman</h3>
          </div>
          <form onSubmit={handleSubmit} className="space-y-5 p-5">
            <div className="space-y-1.5">
              <Label htmlFor="pka-ann-title" className="text-body-sm font-medium text-foreground">
                Judul{" "}
                <span className="font-normal text-muted-foreground">
                  ({title.length}/{TITLE_MAX})
                </span>
              </Label>
              <Input
                id="pka-ann-title"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
                placeholder="Contoh: Modul baru telah rilis"
                required
                className="rounded-md"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pka-ann-body" className="text-body-sm font-medium text-foreground">
                Pesan{" "}
                <span className="font-normal text-muted-foreground">
                  (Markdown, {body.length}/{BODY_MAX})
                </span>
              </Label>
              <Textarea
                id="pka-ann-body"
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
                placeholder={"Tulis pengumuman di sini.\n\nMarkdown didukung: **tebal**, *miring*, daftar, dan [tautan](https://...)."}
                required
                className="min-h-[220px] rounded-md font-mono text-body-sm"
              />
            </div>

            <Button type="submit" disabled={isPending || !title.trim() || !body.trim()} className="w-full gap-2 rounded-lg">
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {isPending ? "Mengirim..." : "Kirim & Broadcast"}
            </Button>
            <p className="text-body-xs text-muted-foreground">
              Pengumuman langsung dikirim sebagai push notification dan email ke semua siswa yang terdaftar di
              Tutorial PKA.
            </p>
          </form>
        </div>

        {/* Live preview */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden lg:sticky lg:top-6">
          <div className="border-b border-border bg-muted/30 px-5 py-3">
            <h3 className="font-heading text-body-sm font-semibold text-foreground">Preview</h3>
          </div>
          <div className="p-5">
            {title || body ? (
              <div className="space-y-3">
                <h4 className="font-heading text-h6 text-foreground">{title || "Judul pengumuman"}</h4>
                {body ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <MarkdownRenderer content={body} />
                  </div>
                ) : (
                  <p className="text-body-sm italic text-muted-foreground/60">Isi pesan akan muncul di sini.</p>
                )}
              </div>
            ) : (
              <div className="py-10 text-center">
                <p className="text-body-sm text-muted-foreground">
                  Preview muncul saat kamu mulai mengetik. Tampilan ini sama dengan yang dilihat siswa di halaman kursus.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* History */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <History className="size-4 text-muted-foreground" aria-hidden />
          <h3 className="font-heading text-body-base font-semibold text-foreground">Riwayat Pengumuman</h3>
        </div>

        {history.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 py-12 text-center">
            <p className="text-body-sm text-muted-foreground">Belum ada pengumuman yang dikirim.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto] gap-4 border-b border-border bg-muted/30 px-5 py-3">
              <span className="text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">Pengumuman</span>
              <span className="text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</span>
              <span className="text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">Penerima</span>
              <span className="text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">Waktu</span>
            </div>
            <ul className="divide-y divide-border/60">
              {history.map((row) => (
                <li
                  key={row.id}
                  className="grid grid-cols-1 gap-2 px-5 py-3.5 transition-colors hover:bg-muted/20 md:grid-cols-[1fr_auto_auto_auto] md:items-center md:gap-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-body-sm font-medium text-foreground">{row.title}</p>
                    <p className="mt-0.5 truncate text-body-xs text-muted-foreground">{row.body}</p>
                  </div>
                  <div className="flex items-center">
                    {row.sentAt ? (
                      <span className="flex items-center gap-1 text-body-xs text-status-success">
                        <CheckCircle2 className="size-3.5" />
                        Terkirim
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-body-xs text-status-error">
                        <XCircle className="size-3.5" />
                        Gagal
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-body-xs text-muted-foreground">
                    <Users className="size-3.5" />
                    {row.recipientCount ?? 0}
                  </div>
                  <div className="flex items-center">
                    <span
                      className="text-body-xs text-muted-foreground"
                      title={new Date(row.createdAt).toLocaleString("id-ID")}
                    >
                      {formatRelative(row.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
