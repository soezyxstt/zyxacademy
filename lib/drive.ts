import { asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { driveItem } from "@/db/schema";

export type DriveKind = "folder" | "file";

export function siblingScope(parentId: string | null) {
  return parentId === null ? isNull(driveItem.parentId) : eq(driveItem.parentId, parentId);
}

export async function listChildren(parentId: string | null) {
  const rows = await db
    .select({
      id: driveItem.id,
      parentId: driveItem.parentId,
      kind: driveItem.kind,
      name: driveItem.name,
      ufsUrl: driveItem.ufsUrl,
      mimeType: driveItem.mimeType,
      sizeBytes: driveItem.sizeBytes,
      updatedAt: driveItem.updatedAt,
      createdAt: driveItem.createdAt,
    })
    .from(driveItem)
    .where(siblingScope(parentId));

  rows.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  return rows;
}

/** All folders (for sidebar tree). */
export async function listAllFolders() {
  return db
    .select({
      id: driveItem.id,
      parentId: driveItem.parentId,
      name: driveItem.name,
    })
    .from(driveItem)
    .where(eq(driveItem.kind, "folder"))
    .orderBy(asc(driveItem.name));
}

export type FolderRow = {
  id: string;
  parentId: string | null;
  name: string;
};

export type FolderNode = {
  id: string;
  name: string;
  children: FolderNode[];
};

export function buildFolderTree(flat: FolderRow[]): FolderNode[] {
  const byParent = new Map<string | null, FolderRow[]>();
  for (const row of flat) {
    const k = row.parentId;
    const bucket = byParent.get(k);
    if (bucket) bucket.push(row);
    else byParent.set(k, [row]);
  }
  const build = (parentId: string | null): FolderNode[] =>
    (byParent.get(parentId) ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      children: build(r.id),
    }));
  return build(null);
}

/** True if `targetParentId` is `folderId` or a descendant folder of `folderId` (invalid move target for `folderId`). */
export async function folderWouldMoveIntoSelfOrChild(folderId: string, targetParentId: string | null) {
  if (targetParentId === null) return false;
  let cur: string | null = targetParentId;
  while (cur) {
    if (cur === folderId) return true;
    const [row] = await db
      .select({ parentId: driveItem.parentId })
      .from(driveItem)
      .where(eq(driveItem.id, cur))
      .limit(1);
    cur = row?.parentId ?? null;
  }
  return false;
}

export async function getBreadcrumbs(folderId: string | null) {
  const trail: { id: string; name: string }[] = [];

  let cur = folderId;
  while (cur) {
    const [row] = await db
      .select({ id: driveItem.id, parentId: driveItem.parentId, name: driveItem.name, kind: driveItem.kind })
      .from(driveItem)
      .where(eq(driveItem.id, cur))
      .limit(1);
    if (!row || row.kind !== "folder") break;
    trail.unshift({ id: row.id, name: row.name });
    cur = row.parentId;
  }

  return [{ id: null as string | null, name: "My Drive" }, ...trail.map((t) => ({ id: t.id, name: t.name }))];
}
