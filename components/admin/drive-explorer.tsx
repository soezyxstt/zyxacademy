"use client";

import { useMemo, useState } from "react";
import {
  FileIcon,
  FileText,
  Folder,
  ImageIcon,
  LayoutGrid,
  List,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export type DriveRow = {
  id: string;
  kind: "folder" | "file";
  domain: string;
  name: string;
  ufsUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  updatedAt: string;
};

type DriveExplorerProps = {
  rows: DriveRow[];
};

const DOMAIN_LABELS: Record<string, string> = {
  courses: "Course materials",
  blog: "Blog media",
  pka: "PKA follow proofs",
  forms: "Form uploads",
  overhaul: "Bundle & authoring artifacts",
  uploads: "Generic uploads",
  legacy: "Legacy drive files",
};

function formatBytes(bytes: number | null) {
  if (bytes == null || Number.isNaN(bytes)) return "-";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v < 10 && u > 0 ? v.toFixed(1) : Math.round(v)} ${units[u]}`;
}

function fileKindIcon(mime: string | null) {
  if (!mime) return FileIcon;
  if (mime.startsWith("image/")) return ImageIcon;
  return FileText;
}

function GridThumb({ ufsUrl, name, mimeType }: { ufsUrl: string; name: string; mimeType: string | null }) {
  const isSvg = mimeType === "image/svg+xml";
  const showImage = mimeType?.startsWith("image/") && ufsUrl && !isSvg;

  let fallbackIcon;
  if (mimeType?.startsWith("image/")) {
    fallbackIcon = <ImageIcon className="text-muted-foreground size-10 opacity-60" aria-hidden />;
  } else if (mimeType) {
    fallbackIcon = <FileText className="text-muted-foreground size-10 opacity-60" aria-hidden />;
  } else {
    fallbackIcon = <FileIcon className="text-muted-foreground size-10 opacity-60" aria-hidden />;
  }

  return (
    <div className="bg-muted relative flex aspect-photo-card w-full items-center justify-center overflow-hidden rounded-lg border border-border/80">
      {showImage ? (
        <Image
          src={ufsUrl}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 768px) 50vw, 25vw"
          unoptimized
        />
      ) : (
        fallbackIcon
      )}
      <span className="sr-only">{name}</span>
    </div>
  );
}

export function DriveExplorer({ rows }: DriveExplorerProps) {
  const [view, setView] = useState<"list" | "grid">("list");

  const grouped = useMemo(() => {
    const order = ["courses", "blog", "pka", "forms", "overhaul", "uploads", "legacy"];
    const map = new Map<string, DriveRow[]>();
    for (const row of rows) {
      const bucket = map.get(row.domain);
      if (bucket) bucket.push(row);
      else map.set(row.domain, [row]);
    }
    return order.filter((d) => map.has(d)).map((d) => ({ domain: d, rows: map.get(d)! }));
  }, [rows]);

  function openFile(row: DriveRow) {
    if (row.kind === "file" && row.ufsUrl) {
      window.open(row.ufsUrl, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="border-border flex min-h-[calc(100dvh-10rem)] flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <header className="border-border bg-background/90 flex flex-col gap-2 border-b px-3 py-2.5 backdrop-blur-sm sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-body-sm text-muted-foreground">
            Read-only browser over R2 object prefixes. No uploads.
          </p>
          <div className="ml-auto flex shrink-0 flex-wrap items-center gap-1.5">
            <div className="border-border flex rounded-lg border p-0.5">
              <button
                type="button"
                className={cn(
                  "cursor-pointer rounded-md p-1.5 outline-none transition-colors",
                  view === "list" ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={view === "list"}
                aria-label="List view"
                onClick={() => setView("list")}
              >
                <List className="size-4" />
              </button>
              <button
                type="button"
                className={cn(
                  "cursor-pointer rounded-md p-1.5 outline-none transition-colors",
                  view === "grid" ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={view === "grid"}
                aria-label="Grid view"
                onClick={() => setView("grid")}
              >
                <LayoutGrid className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="min-h-[240px] flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-24 text-center">
            <Folder className="text-muted-foreground size-14 opacity-50" aria-hidden />
            <p className="font-heading text-h6 text-foreground">No stored files</p>
            <p className="text-muted-foreground text-body-sm max-w-xs">
              Uploaded materials, diktats, blog media, and PKA proofs will appear here.
            </p>
          </div>
        ) : view === "list" ? (
          <table className="w-full min-w-[640px] border-collapse text-left text-body-sm">
            <thead>
              <tr className="bg-muted/40 text-muted-foreground border-b">
                <th className="font-medium px-2 py-2.5 w-[8%]" scope="col">
                  Domain
                </th>
                <th className="font-medium px-2 py-2.5 w-[46%]" scope="col">
                  Name
                </th>
                <th className="font-medium px-4 py-2.5 whitespace-nowrap" scope="col">
                  Modified
                </th>
                <th className="font-medium px-4 py-2.5 whitespace-nowrap" scope="col">
                  Size
                </th>
              </tr>
            </thead>
            <tbody>
              {grouped.flatMap((group) =>
                group.rows.map((row, index) => {
                  const FileIco = fileKindIcon(row.mimeType);
                  return (
                    <tr
                      key={row.id}
                      className="border-border border-b last:border-b-0 transition-colors"
                      onClick={() => openFile(row)}
                    >
                      <td className="text-muted-foreground px-2 py-2 align-middle">
                        {group.rows.length > 0 && index === 0
                          ? DOMAIN_LABELS[group.domain] ?? group.domain
                          : ""}
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <div className="inline-flex max-w-full cursor-pointer items-center gap-2 rounded-md px-1 py-0.5">
                          <FileIco className="text-brand-primary size-5 shrink-0" aria-hidden />
                          <span className="truncate font-medium">{row.name}</span>
                        </div>
                      </td>
                      <td className="text-muted-foreground px-4 py-2 align-middle whitespace-nowrap">
                        {new Date(row.updatedAt).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="text-muted-foreground px-4 py-2 align-middle whitespace-nowrap">
                        {formatBytes(row.sizeBytes)}
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        ) : (
          <div className="p-4">
            {grouped.map((group) => (
              <section key={group.domain} className="mb-8">
                <h2 className="font-heading text-h6 mb-3 border-b border-border pb-2 font-semibold text-foreground">
                  {DOMAIN_LABELS[group.domain] ?? group.domain}
                </h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
                  {group.rows.map((row) => (
                    <div
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openFile(row)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") openFile(row);
                      }}
                      className="border-border group relative cursor-pointer rounded-xl border bg-card p-2 text-left shadow-sm transition-colors hover:border-border"
                    >
                      <GridThumb ufsUrl={row.ufsUrl ?? ""} name={row.name} mimeType={row.mimeType} />
                      <p className="mt-2 line-clamp-2 text-body-sm font-medium leading-snug">{row.name}</p>
                      <p className="text-muted-foreground mt-1 text-[11px]">{formatBytes(row.sizeBytes)}</p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
