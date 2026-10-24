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
import { AdminEmptyState } from "@/components/admin/state-panels";
import { AdminTable } from "@/components/admin/table";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
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
import { useTranslations, useAppLocale } from "@/lib/i18n/client";


function formatDate(value: Date, locale: "id" | "en"): string {
  return normalizeDate(value).toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ProofThumbnail({ src, alt, onClick, t }: { src: string; alt: string; onClick: () => void; t: ReturnType<typeof useTranslations<"adminOps">> }) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !src) {
    return (
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground" title={t("pkaRegistrationUI.proofUnavailable")}>
        <FileText className="size-4" />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative size-10 shrink-0 overflow-hidden rounded-md border border-border transition-opacity hover:opacity-80 cursor-pointer"
    >
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover"
        unoptimized
        onError={() => setHasError(true)}
      />
      <span className="sr-only">{t("pkaRegistrationUI.viewProof")}</span>
    </button>
  );
}

function ProofPreviewImage({ src, alt, t }: { src: string; alt: string; t: ReturnType<typeof useTranslations<"adminOps">> }) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !src) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/20 p-10 text-center text-muted-foreground">
        <FileText className="size-10 text-muted-foreground/60" />
        <p className="mt-2 text-body-sm font-medium text-foreground">{t("pkaRegistrationUI.proofLoadFailure")}</p>
        <p className="mt-1 text-body-xs text-muted-foreground">{t("pkaRegistrationUI.proofLoadHelp")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-border bg-muted/20">
        <Image
          src={src}
          alt={alt}
          width={600}
          height={800}
          className="mx-auto max-h-[70vh] w-auto object-contain"
          unoptimized
          onError={() => setHasError(true)}
        />
      </div>
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-body-sm font-medium text-brand-primary transition-colors duration-150 hover:text-brand-primary/80"
      >
        {t("pkaRegistrationUI.fullImage")}
        <ExternalLink className="size-3.5" />
      </a>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function toCsv(rows: PkaRegistrationRow[], t: ReturnType<typeof useTranslations<"adminOps">>): string {
  const header = ["name", "faculty", "email", "instagram", "announcements", "date", "proof"].map((key) => t(`pkaRegistrationUI.${key}`));
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.fullName,
      r.faculty,
      r.email,
      `@${r.instagramUsername}`,
      r.receiveAnnouncements ? t("pkaRegistrationUI.yes") : t("pkaRegistrationUI.no"),
      normalizeDate(r.createdAt).toISOString(),
      typeof window !== "undefined" ? new URL(r.proofUrl, window.location.origin).toString() : r.proofUrl,
    ]
      .map(esc)
      .join(","),
  );
  return [header.map(esc).join(","), ...lines].join("\n");
}

export function RegistrationsTab({ registrations }: { registrations: PkaRegistrationRow[] }) {
  const t = useTranslations("adminOps");
  const { locale } = useAppLocale();
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
    const csv = toCsv(filtered, t);
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
      toast.success(t("pkaRegistrationUI.googleSheetCreated"));
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
      t("pkaRegistrationUI.fullName"),
      t("pkaRegistrationUI.faculty"),
      t("pkaRegistrationUI.studentEmail"),
      t("pkaRegistrationUI.instagram"),
      t("pkaRegistrationUI.registrationTime"),
      t("pkaRegistrationUI.announcementNotifications"),
      t("pkaRegistrationUI.proofLink"),
    ];
    const rowsMatrix = filtered.map((r) => [
      r.fullName,
      r.faculty,
      r.email,
      `@${r.instagramUsername}`,
      r.createdAt ? formatDate(r.createdAt, locale) : "-",
      r.receiveAnnouncements ? t("pkaRegistrationUI.yes") : t("pkaRegistrationUI.no"),
      r.proofUrl,
    ]);

    runExport({
      entityType: "pka",
      entityId: "tutorial-pka",
      title: t("pka.title"),
      headers: headersRow,
      rows: rowsMatrix,
    });
  };

  if (registrations.length === 0) {
    return (
      <AdminEmptyState icon={Users} title={t("pkaRegistrationUI.empty")} />
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact summary strip */}
      <AdminStatStrip className="sm:grid-cols-3">
        <AdminStatStripItem icon={Users} value={registrations.length} label={t("pkaRegistrationUI.total")} />
        <AdminStatStripItem icon={BellRing} value={optedIn} label={t("pkaRegistrationUI.subscribed")} tone="brand" />
        <AdminStatStripItem icon={GraduationCap} value={facultyCount} label={t("pkaRegistrationUI.facultyCount")} />
      </AdminStatStrip>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <SearchBar
          size="sm"
          value={query}
          onSearch={setQuery}
          onClear={() => setQuery("")}
          placeholder={t("pkaRegistrationUI.search")}
          containerClassName="flex-1 min-w-0"
        />
        <Button onClick={handleExportGoogleSheets} disabled={exportingSheets} variant="outline" size="sm" className="gap-2 rounded-lg text-brand-primary border-brand-primary/30 bg-brand-primary/5 hover:bg-brand-primary/10 h-9 shrink-0">
          <RefreshCw className={`size-3.5 ${exportingSheets ? "animate-spin" : "hidden"}`} />
          <FileText className="size-3.5" />
          {exportingSheets ? t("pkaRegistrationUI.exporting") : t("pkaRegistrationUI.exportSheets")}
        </Button>

        <Button onClick={handleExport} variant="outline" size="sm" className="gap-2 rounded-lg h-9 shrink-0">
          <Download className="size-3.5" />
          {t("pkaRegistrationUI.exportCsv")}
        </Button>
      </div>

      {/* Table */}
      <AdminTable>
        <div className="hidden grid-cols-[minmax(0,1fr)_5rem_7rem_6rem] items-center gap-6 border-b border-border bg-muted/30 px-5 py-2.5 md:grid">
          <span className="text-body-xs font-semibold text-muted-foreground">{t("pkaRegistrationUI.registrant")}</span>
          <span className="text-body-xs font-semibold text-muted-foreground">{t("pkaRegistrationUI.proof")}</span>
          <span className="text-body-xs font-semibold text-muted-foreground">{t("pkaRegistrationUI.subscription")}</span>
          <span className="text-body-xs font-semibold text-muted-foreground text-right">{t("pkaRegistrationUI.date")}</span>
        </div>

        {filtered.length === 0 ? (
          <p className="px-5 py-10 text-center text-body-sm text-muted-foreground">
            {t("pkaRegistrationUI.noMatch")}
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
                  <span className="mr-2 text-body-xs text-muted-foreground md:hidden">{t("pkaRegistrationUI.proofLabel")}</span>
                  <ProofThumbnail
                    src={r.proofUrl}
                    alt={t("pkaRegistrationUI.proofFollow", { name: r.fullName })}
                    onClick={() => setPreview(r)}
                    t={t}
                  />
                </div>

                {/* Opt-in */}
                <div className="flex items-center">
                  {r.receiveAnnouncements ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-status-success/10 px-2 py-0.5 text-body-xs font-medium text-status-success">
                      <BellRing className="size-3" />
                      {t("pkaRegistrationUI.yes")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-body-xs font-medium text-muted-foreground">
                      <BellOff className="size-3" />
                      {t("pkaRegistrationUI.no")}
                    </span>
                  )}
                </div>

                {/* Date */}
                <div className="flex items-center gap-1.5 text-body-xs text-muted-foreground md:justify-end md:whitespace-nowrap">
                  <CalendarDays className="size-3.5 shrink-0 md:hidden" />
                  {formatDate(r.createdAt, locale)}
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
            <DialogTitle>{t("pkaRegistrationUI.proofFollow", { name: `@${preview?.instagramUsername ?? ""}` })}</DialogTitle>
            <DialogDescription>
              {preview?.fullName} &middot; {preview?.faculty}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <ProofPreviewImage src={preview.proofUrl} alt={t("pkaRegistrationUI.proofFollow", { name: preview.fullName })} t={t} />
          )}
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </div>
  );
}
