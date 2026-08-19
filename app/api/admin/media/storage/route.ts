import { NextResponse } from "next/server";

import { assertAdmin } from "@/lib/uploadthing-admin";
import { storage } from "@/lib/storage";
import {
  assertSafeKey,
  buildMediaKey,
  isMediaKey,
  leafFilename,
  slugifySegment,
  INVALID_OBJECT_KEY,
} from "@/lib/storage/keys";
import {
  baseFolderName,
  buildFolderTree,
  isFolderMarkerKey,
  kindFromKey,
  normalizeFolderPath,
  parentFolderPath,
  storageFolderPathOfKey,
  type MediaFile,
  type MediaFolder,
} from "@/lib/media";

export const dynamic = "force-dynamic";

const MEDIA_DOMAIN = "media";

function normalizeTargetFolder(path?: string | null): string {
  const raw = (path || "").trim();
  if (raw) assertSafeKey(raw);
  const cleaned = normalizeFolderPath(raw);
  const slugged = cleaned
    .split("/")
    .map((seg) => slugifySegment(seg, ""))
    .filter(Boolean)
    .join("/");
  assertSafeKey(slugged ? `${MEDIA_DOMAIN}/${slugged}` : MEDIA_DOMAIN);
  return slugged;
}

async function listStorageObjects(): Promise<{ key: string; size: number; lastModified: Date }[]> {
  if (typeof storage.list !== "function") {
    throw new Error("Penyimpanan tidak mendukung daftar objek");
  }
  const all = await storage.list("");
  return all.filter((o) => !isMediaKey(o.key));
}

export async function GET(req: Request) {
  try {
    await assertAdmin();

    const url = new URL(req.url);
    const folder = normalizeFolderPath(url.searchParams.get("folder"));
    if (folder) assertSafeKey(folder);

    const objs = await listStorageObjects();

    const allFolderSet = new Set<string>();
    const files: MediaFile[] = [];

    const addAncestors = (f: string) => {
      if (!f) return;
      const parts = f.split("/");
      for (let i = 1; i <= parts.length; i += 1) {
        allFolderSet.add(parts.slice(0, i).join("/"));
      }
    };

    for (const obj of objs) {
      if (isFolderMarkerKey(obj.key)) {
        addAncestors(storageFolderPathOfKey(obj.key));
        continue;
      }
      const f = storageFolderPathOfKey(obj.key);
      addAncestors(f);
      if (f === folder) {
        files.push({
          key: obj.key,
          name: leafFilename(obj.key),
          folderPath: folder,
          size: obj.size,
          lastModified: obj.lastModified.toISOString(),
          kind: kindFromKey(obj.key),
          url: storage.getUrl(obj.key),
        });
      }
    }

    const folderMap = new Map<string, MediaFolder>();
    for (const p of allFolderSet) {
      if (parentFolderPath(p) === folder) {
        folderMap.set(p, { name: baseFolderName(p), path: p });
      }
    }

    const folders = [...folderMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      path: folder,
      folders,
      files,
      tree: buildFolderTree([...allFolderSet]),
    });
  } catch (err: any) {
    console.error("Storage list error:", err);
    return NextResponse.json({ error: err?.message || "Gagal memuat storage" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await assertAdmin();

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body?.action !== "copy") {
      return NextResponse.json({ error: "Aksi tidak dikenali" }, { status: 400 });
    }
    const targetFolder = normalizeTargetFolder(typeof body?.targetFolder === "string" ? body.targetFolder : null);

    if (body?.kind === "folder") {
      const sourceFolder = normalizeFolderPath(typeof body?.folderPath === "string" ? body.folderPath : null);
      if (!sourceFolder) {
        return NextResponse.json({ error: "Folder wajib diisi" }, { status: 400 });
      }
      assertSafeKey(sourceFolder);
      const base = baseFolderName(sourceFolder);
      const newPath = targetFolder ? `${targetFolder}/${base}` : base;
      const sourcePrefix = `${sourceFolder}/`;
      if (typeof storage.list !== "function") {
        return NextResponse.json({ error: "Penyimpanan tidak mendukung daftar objek" }, { status: 501 });
      }
      const objs = await storage.list(sourcePrefix);
      let count = 0;
      for (const obj of objs) {
        const relative = obj.key.slice(sourcePrefix.length);
        const relParts = relative.split("/");
        const relFolder = relParts.slice(0, -1).join("/");
        const filename = relParts[relParts.length - 1];
        const newFolderPath = [newPath, relFolder].filter(Boolean).join("/");
        const newKey = buildMediaKey({ folderPath: newFolderPath, filename });
        assertSafeKey(newKey);
        await storage.copy(obj.key, newKey);
        count += 1;
      }
      const markerKey = `${MEDIA_DOMAIN}/${newPath}/.keep`;
      assertSafeKey(markerKey);
      await storage.upload(new Uint8Array(0), ".keep", "application/octet-stream", { key: markerKey });
      return NextResponse.json({ success: true, folderPath: newPath, copied: count });
    }

    const key = typeof body?.key === "string" ? body.key : null;
    if (!key) {
      return NextResponse.json({ error: "File wajib diisi" }, { status: 400 });
    }
    assertSafeKey(key);
    if (isMediaKey(key)) {
      return NextResponse.json({ error: "File sudah berada di dalam media" }, { status: 400 });
    }
    const newKey = buildMediaKey({ folderPath: targetFolder, filename: leafFilename(key) });
    if (await storage.exists(newKey)) {
      return NextResponse.json({ error: "File dengan nama tersebut sudah ada" }, { status: 409 });
    }
    await storage.copy(key, newKey);
    return NextResponse.json({ success: true, key: newKey, folderPath: targetFolder });
  } catch (err: any) {
    console.error("Storage copy error:", err);
    if (err?.message === INVALID_OBJECT_KEY) {
      return NextResponse.json({ error: "Path tidak valid" }, { status: 400 });
    }
    return NextResponse.json({ error: err?.message || "Operasi gagal" }, { status: 500 });
  }
}
