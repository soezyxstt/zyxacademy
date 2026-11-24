"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  AtSign,
  BellRing,
  BellOff,
  Users,
  CalendarDays,
  ExternalLink,
  FileText,
} from "lucide-react";
import { SearchBar } from "@/components/ui/search-bar";
import { AdminEmptyState } from "@/components/admin/state-panels";
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

  const { sheetControls, confirmDialog, resultPanel, runExport } = useSpreadsheetExport({
    scope: "tutorial-pka", entityType: "pka",
    onError: (message) => {
      toast.error(message);
    },
  });

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
    }, Boolean(query.trim()));
  };

  if (registrations.length === 0) {
    return (
      <AdminEmptyState icon={Users} title={t("pkaRegistrationUI.empty")} />
    );
  }

  return (
    <div className="space-y-(--related-gap)">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 [&>[data-search-expanded=true]]:min-w-36">
        <SearchBar
          collapsible
          size="sm"
          value={query}
          onSearch={setQuery}
          onClear={() => setQuery("")}
          placeholder={t("pkaRegistrationUI.search")}
        />
        {sheetControls(handleExportGoogleSheets, !filtered.length)}
      </div>

      {resultPanel}

      {/* Table */}
      <AdminTable>
        <div className="hidden grid-cols-[minmax(0,1fr)_5rem_7rem_6rem] items-center gap-4 border-b border-border/60 py-2 lg:grid">
          <span className="text-body-xs font-semibold text-muted-foreground">{t("pkaRegistrationUI.registrant")}</span>
          <span className="text-body-xs font-semibold text-muted-foreground">{t("pkaRegistrationUI.proof")}</span>
          <span className="text-body-xs font-semibold text-muted-foreground">{t("pkaRegistrationUI.subscription")}</span>
          <span className="text-body-xs font-semibold text-muted-foreground text-right">{t("pkaRegistrationUI.date")}</span>
        </div>

        {filtered.length === 0 ? (
          <AdminEmptyState compact icon={Users} title={t("pkaRegistrationUI.noMatch")} />
        ) : (
          <ul className="divide-y divide-border/60">
            {filtered.map((r) => (
              <li
                key={r.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 py-(--row-padding) transition-colors hover:bg-muted/25 lg:grid-cols-[minmax(0,1fr)_5rem_7rem_6rem] lg:items-center lg:gap-x-4"
              >
                {/* Identity */}
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-body-xs font-semibold text-muted-foreground">
                    {initials(r.fullName)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="wrap-anywhere text-body-sm font-semibold text-foreground">{r.fullName}</span>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-body-xs font-medium text-muted-foreground">
                        {r.faculty}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-body-xs text-muted-foreground">
                      <span className="wrap-anywhere">{r.email}</span>
                      <a
                        href={`https://instagram.com/${r.instagramUsername}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-w-0 items-center gap-0.5 wrap-anywhere underline underline-offset-2 hover:text-foreground"
                      >
                        <AtSign className="size-3 shrink-0" aria-hidden />
                        {r.instagramUsername}
                      </a>
                    </div>
                  </div>
                </div>

                {/* Proof */}
                <div className="justify-self-end lg:justify-self-start">
                  <ProofThumbnail
                    src={r.proofUrl}
                    alt={t("pkaRegistrationUI.proofFollow", { name: r.fullName })}
                    onClick={() => setPreview(r)}
                    t={t}
                  />
                </div>

                {/* Opt-in */}
                <div className="flex items-center pl-[2.625rem] lg:pl-0">
                  <span className="sr-only">{t("pkaRegistrationUI.subscription")}</span>
                  {r.receiveAnnouncements ? (
                    <span className="inline-flex items-center gap-1 text-body-xs text-status-success">
                      <BellRing className="size-3" />
                      {t("pkaRegistrationUI.yes")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-body-xs text-muted-foreground">
                      <BellOff className="size-3" />
                      {t("pkaRegistrationUI.no")}
                    </span>
                  )}
                </div>

                {/* Date */}
                <div className="flex items-center justify-end gap-1.5 text-body-xs text-muted-foreground lg:whitespace-nowrap">
                  <CalendarDays className="size-3.5 shrink-0 lg:hidden" aria-hidden />
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
