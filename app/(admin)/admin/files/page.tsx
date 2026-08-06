import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { eq, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import {
  blogArticles,
  courseMaterials,
  diktats,
  driveItem,
  pkaRegistrations,
} from "@/db/schema";
import { DriveExplorer, type DriveRow } from "@/components/admin/drive-explorer";
import { leafFilename } from "@/lib/storage/keys";
import { pageTitle } from "@/lib/site";
import { assertAdmin } from "@/lib/uploadthing-admin";
import { AdminPageHeader } from "@/components/admin/page-header";
import { HardDrive } from "lucide-react";
import { storage } from "@/lib/storage";

export const metadata: Metadata = {
  title: pageTitle("Files"),
  description: "Browse uploaded files by storage domain (admin).",
};

export default async function AdminFilesPage() {
  try {
    await assertAdmin();
  } catch {
    redirect("/");
  }

  const [materials, diktatRows, blogRows, pkaRows, legacyRows] = await Promise.all([
    db
      .select({
        id: courseMaterials.id,
        name: courseMaterials.title,
        key: courseMaterials.fileUrl,
        updatedAt: courseMaterials.updatedAt,
      })
      .from(courseMaterials),
    db
      .select({
        id: diktats.id,
        name: diktats.title,
        key: diktats.fileUrl,
        updatedAt: diktats.updatedAt,
      })
      .from(diktats)
      .where(isNotNull(diktats.fileUrl)),
    db
      .select({
        id: blogArticles.id,
        name: blogArticles.title,
        key: blogArticles.thumbnailUrl,
        updatedAt: blogArticles.updatedAt,
      })
      .from(blogArticles)
      .where(isNotNull(blogArticles.thumbnailUrl)),
    db
      .select({
        id: pkaRegistrations.id,
        name: pkaRegistrations.fullName,
        key: pkaRegistrations.proofKey,
        updatedAt: pkaRegistrations.createdAt,
      })
      .from(pkaRegistrations),
    db
      .select({
        id: driveItem.id,
        name: driveItem.name,
        key: driveItem.ufsUrl,
        mimeType: driveItem.mimeType,
        sizeBytes: driveItem.sizeBytes,
        updatedAt: driveItem.updatedAt,
      })
      .from(driveItem)
      .where(eq(driveItem.kind, "file")),
  ]);

  const toRow = (
    domain: string,
    item: { id: string; name: string; key: string | null; updatedAt: Date },
    mimeType: string,
    sizeBytes: number | null = null,
  ): DriveRow => ({
    id: item.id,
    kind: "file",
    domain,
    name: item.name || (item.key ? leafFilename(item.key) : "untitled"),
    ufsUrl: item.key ? storage.getUrl(item.key) : null,
    mimeType,
    sizeBytes,
    updatedAt: item.updatedAt.toISOString(),
  });

  const rows: DriveRow[] = [
    ...materials.map((m) => toRow("courses", m, "application/pdf")),
    ...diktatRows.map((d) => toRow("courses", d, "application/pdf")),
    ...blogRows.map((b) => toRow("blog", b, "image")),
    ...pkaRows.map((p) => toRow("pka", p, "image")),
    ...legacyRows.map((l) =>
      toRow("legacy", { id: l.id, name: l.name, key: l.key, updatedAt: l.updatedAt }, l.mimeType ?? "application/octet-stream", l.sizeBytes),
    ),
  ];

  rows.sort((a, b) => (a.domain === b.domain ? a.name.localeCompare(b.name) : a.domain.localeCompare(b.domain)));

  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={HardDrive}
        title="Penyimpanan File"
        description="Jelajahi file yang diunggah di setiap domain penyimpanan."
        backHref="/admin"
      />
      <DriveExplorer rows={rows} />
    </div>
  );
}
