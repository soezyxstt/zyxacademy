import { NextResponse } from "next/server";

import { assertAdmin } from "@/lib/uploadthing-admin";
import { env } from "@/lib/env";
import { storage } from "@/lib/storage";
import { assertSafeKey, buildMediaKey, leafFilename, slugifySegment } from "@/lib/storage/keys";
import {
  baseFolderName,
  buildFolderTree,
  folderPathOfKey,
  isFolderMarkerKey,
  kindFromKey,
  MEDIA_MAX_UPLOAD_BYTES,
  normalizeFolderPath,
  parentFolderPath,
  type MediaFile,
  type MediaFolder,
} from "@/lib/media";

export const dynamic = "force-dynamic";

const MEDIA_DOMAIN = "media";

function slugifyFolderPath(path?: string | null): string {
  const raw = (path || "").trim();
  if (raw) assertSafeKey(raw);
  const cleaned = normalizeFolderPath(raw);
  return cleaned
    .split("/")
    .map((seg) => slugifySegment(seg, ""))
    .filter(Boolean)
    .join("/");
}

function assertMediaPath(folderPath: string): void {
  assertSafeKey(folderPath ? `${MEDIA_DOMAIN}/${folderPath}` : MEDIA_DOMAIN);
}

function markerKeyFor(folderPath: string): string {
  const key = `${MEDIA_DOMAIN}/${folderPath}/.keep`;
  assertSafeKey(key);
  return key;
}

export async function GET(req: Request) {
  try {
    await assertAdmin();
    if (env.FEATURE_MEDIA_LIBRARY !== "1") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const folder = slugifyFolderPath(url.searchParams.get("folder"));
    assertMediaPath(folder);

    if (typeof storage.list !== "function") {
      return NextResponse.json({ error: "Penyimpanan tidak mendukung daftar objek" }, { status: 501 });
    }
    const objs = await storage.list(`${MEDIA_DOMAIN}/`);

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
      const key = obj.key;
      if (isFolderMarkerKey(key)) {
        addAncestors(folderPathOfKey(key));
        continue;
      }
      const f = folderPathOfKey(key);
      addAncestors(f);
      if (f === folder) {
        files.push({
          key,
          name: leafFilename(key),
          folderPath: folder,
          size: obj.size,
          lastModified: obj.lastModified.toISOString(),
          kind: kindFromKey(key),
          url: storage.getUrl(key),
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
    console.error("Media list error:", err);
    return NextResponse.json({ error: err?.message || "Gagal memuat media" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await assertAdmin();
    if (env.FEATURE_MEDIA_LIBRARY !== "1") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const contentType = req.headers.get("content-type") || "";
    let action: string | null = null;
    let file: File | null = null;
    let folderPath: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      action = form.get("action") ? String(form.get("action")) : null;
      file = form.get("file") instanceof File ? (form.get("file") as File) : null;
      folderPath = form.get("folderPath") ? String(form.get("folderPath")) : null;
    } else {
      const body = await req.json();
      action = typeof body?.action === "string" ? body.action : null;
      folderPath = typeof body?.folderPath === "string" ? body.folderPath : null;
    }

    if (action === "mkdir") {
      const folder = slugifyFolderPath(folderPath);
      if (!folder) {
        return NextResponse.json({ error: "Nama folder wajib diisi" }, { status: 400 });
      }
      assertMediaPath(folder);
      const key = markerKeyFor(folder);
      await storage.upload(new Uint8Array(0), ".keep", "application/octet-stream", { key });
      return NextResponse.json({ success: true, folderPath: folder, key });
    }

    if (!file) {
      return NextResponse.json({ error: "File tidak ditemukan" }, { status: 400 });
    }
    if (file.size > MEDIA_MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `Ukuran file melebihi batas ${Math.round(MEDIA_MAX_UPLOAD_BYTES / 1024 / 1024)}MB` },
        { status: 400 }
      );
    }

    const folder = slugifyFolderPath(folderPath);
    assertMediaPath(folder);
    const key = buildMediaKey({ folderPath: folder, filename: file.name });
    const uploadRes = await storage.upload(file, file.name, file.type, { key });

    return NextResponse.json({
      success: true,
      key: uploadRes.key,
      url: storage.getUrl(uploadRes.key),
      size: uploadRes.size,
      folderPath: folder,
    });
  } catch (err: any) {
    console.error("Media upload error:", err);
    return NextResponse.json({ error: err?.message || "Gagal mengunggah media" }, { status: 500 });
  }
}
