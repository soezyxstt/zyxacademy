"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  Download,
  AtSign,
  BellRing,
  BellOff,
  Users,
  GraduationCap,
  CalendarDays,
  ExternalLink,
  RefreshCw,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchBar } from "@/components/ui/search-bar";
import { AdminTable } from "@/components/admin/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { normalizeDate } from "@/lib/date-utils";
import { toast } from "@/components/ui/toast";
import { useSpreadsheetExport } from "@/components/admin/spreadsheet-export";
import type { PkaRegistrationRow } from "../actions";


function formatDate(value: Date): string {
  return normalizeDate(value).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function toCsv(rows: PkaRegistrationRow[]): string {
  const header = ["Nama", "Fakultas", "Email", "Instagram", "Pengumuman", "Tanggal", "Bukti"];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.fullName,
      r.faculty,
      r.email,
      `@${r.instagramUsername}`,
      r.receiveAnnouncements ? "Ya" : "Tidak",
      normalizeDate(r.createdAt).toISOString(),
      typeof window !== "undefined" ? new URL(r.proofUrl, window.location.origin).toString() : r.proofUrl,
    ]
      .map(esc)
      .join(","),
  );
  return [header.map(esc).join(","), ...lines].join("\n");
}

function Stat({
  icon: Icon,
  value,
  label,
  accent,
}: {
  icon: typeof Users;
  value: number;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={
          accent
            ? "flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary"
            : "flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
        }
      >
        <Icon className="size-4" />
      </span>
      <div>
        <p className="font-heading text-h6 font-bold leading-none text-foreground">{value}</p>
        <p className="mt-1 text-body-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function RegistrationsTab({ registrations }: { registrations: PkaRegistrationRow[] }) {
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<PkaRegistrationRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return registrations;
    return registrations.filter((r) =>
      [r.fullName, r.faculty, r.email, r.instagramUsername, r.accountEmail ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [query, registrations]);

  const handleExport = () => {
    const csv = toCsv(filtered);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pendaftar-tutorial-pka-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const { exporting: exportingSheets, confirmDialog, runExport } = useSpreadsheetExport({
    onSuccess: ({ spreadsheetUrl }) => {
      window.open(spreadsheetUrl, "_blank");
      toast.success("Google Spreadsheet berhasil dibuat!");
    },
    onError: (message) => {
      toast.error(message);
      handleExport();
    },
  });

  const optedIn = registrations.filter((r) => r.receiveAnnouncements).length;
  const facultyCount = new Set(registrations.map((r) => r.faculty.trim().toLowerCase())).size;

  const handleExportGoogleSheets = () => {
    const headersRow = [
      "Nama Lengkap",
      "Fakultas",
      "Email Siswa",
      "Instagram",
      "Waktu Pendaftaran",
      "Notifikasi Pengumuman",
      "Link Bukti",
    ];
    const rowsMatrix = filtered.map((r) => [
      r.fullName,
      r.faculty,
      r.email,
      `@${r.instagramUsername}`,
      r.createdAt ? formatDate(r.createdAt) : "-",
      r.receiveAnnouncements ? "Ya" : "Tidak",
      r.proofUrl,
    ]);

    runExport({
      entityType: "pka",
      entityId: "tutorial-pka",
      title: "Pendaftar Tutorial PKA",
      headers: headersRow,
      rows: rowsMatrix,
    });
  };

  if (registrations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 py-16 text-center">
        <Users className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 text-body-sm text-muted-foreground">
          Belum ada pendaftar. Data akan muncul di sini saat siswa mengisi formulir pendaftaran.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact summary strip */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
        <Stat icon={Users} value={registrations.length} label="Total pendaftar" />
        <span className="hidden h-9 w-px bg-border sm:block" />
        <Stat icon={BellRing} value={optedIn} label="Berlangganan pengumuman" accent />
        <span className="hidden h-9 w-px bg-border sm:block" />
        <Stat icon={GraduationCap} value={facultyCount} label="Fakultas berbeda" />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <SearchBar
          size="sm"
          value={query}
          onSearch={setQuery}
          onClear={() => setQuery("")}
          placeholder="Cari nama, fakultas, email, atau Instagram..."
          containerClassName="flex-1 min-w-0"
        />
        <Button onClick={handleExportGoogleSheets} disabled={exportingSheets} variant="outline" size="sm" className="gap-2 rounded-lg text-brand-primary border-brand-primary/30 bg-brand-primary/5 hover:bg-brand-primary/10 h-9 shrink-0">
          <RefreshCw className={`size-3.5 ${exportingSheets ? "animate-spin" : "hidden"}`} />
          <FileText className="size-3.5" />
          {exportingSheets ? "Mengekspor..." : "Ekspor Sheets"}
        </Button>

        <Button onClick={handleExport} variant="outline" size="sm" className="gap-2 rounded-lg h-9 shrink-0">
          <Download className="size-3.5" />
          Ekspor CSV
        </Button>
      </div>

      {/* Table */}
      <AdminTable>
        <div className="hidden grid-cols-[minmax(0,1fr)_5rem_7rem_6rem] items-center gap-6 border-b border-border bg-muted/30 px-5 py-2.5 md:grid">
          <span className="text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">Pendaftar</span>
          <span className="text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">Bukti</span>
          <span className="text-body-xs font-semibold uppercase tracking-wide text-muted-foreground">Langganan</span>
          <span className="text-body-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">Tanggal</span>
        </div>

        {filtered.length === 0 ? (
          <p className="px-5 py-10 text-center text-body-sm text-muted-foreground">
            Tidak ada pendaftar yang cocok dengan pencarian.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {filtered.map((r) => (
              <li
                key={r.id}
                className="grid grid-cols-1 items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/20 md:grid-cols-[minmax(0,1fr)_5rem_7rem_6rem] md:gap-6"
              >
                {/* Identity */}
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-body-xs font-bold text-brand-primary">
                    {initials(r.fullName)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-body-sm font-semibold text-foreground">{r.fullName}</span>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-body-xs font-medium text-muted-foreground">
                        {r.faculty}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-body-xs text-muted-foreground">
                      <span className="truncate">{r.email}</span>
                      <span className="text-border">&bull;</span>
                      <a
                        href={`https://instagram.com/${r.instagramUsername}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-0.5 font-medium text-brand-primary transition-colors duration-150 hover:text-brand-primary/80"
                      >
                        <AtSign className="size-3" />
                        {r.instagramUsername}
                      </a>
                    </div>
                  </div>
                </div>

                {/* Proof */}
                <div className="flex items-center md:block">
                  <span className="mr-2 text-body-xs text-muted-foreground md:hidden">Bukti:</span>
                  <button
                    type="button"
                    onClick={() => setPreview(r)}
                    className="relative size-10 shrink-0 overflow-hidden rounded-md border border-border transition-opacity hover:opacity-80"
                  >
                    <Image src={r.proofUrl} alt={`Bukti follow ${r.fullName}`} fill className="object-cover" unoptimized />
                    <span className="sr-only">Lihat bukti follow</span>
                  </button>
                </div>

                {/* Opt-in */}
                <div className="flex items-center">
                  {r.receiveAnnouncements ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-status-success/10 px-2 py-0.5 text-body-xs font-medium text-status-success">
                      <BellRing className="size-3" />
                      Ya
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-body-xs font-medium text-muted-foreground">
                      <BellOff className="size-3" />
                      Tidak
                    </span>
                  )}
                </div>

                {/* Date */}
                <div className="flex items-center gap-1.5 text-body-xs text-muted-foreground md:justify-end md:whitespace-nowrap">
                  <CalendarDays className="size-3.5 shrink-0 md:hidden" />
                  {formatDate(r.createdAt)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminTable>

      {/* Proof lightbox */}
      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Bukti follow @{preview?.instagramUsername}</DialogTitle>
            <DialogDescription>
              {preview?.fullName} &middot; {preview?.faculty}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-lg border border-border bg-muted/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview.proofUrl}
                  alt={`Bukti follow ${preview.fullName}`}
                  className="mx-auto max-h-[70vh] w-auto object-contain"
                />
              </div>
              <a
                href={preview.proofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-body-sm font-medium text-brand-primary transition-colors duration-150 hover:text-brand-primary/80"
              >
                Buka gambar ukuran penuh
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </div>
  );
}
