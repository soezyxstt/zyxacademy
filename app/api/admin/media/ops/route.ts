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
  folderPathOfKey,
  MEDIA_MAX_UPLOAD_BYTES,
  normalizeFolderPath,
  parentFolderPath,
} from "@/lib/media";

export const dynamic = "force-dynamic";

const MEDIA_DOMAIN = "media";

type OpsPayload = {
  action: string;
  kind?: string | null;
  key?: string | null;
  folderPath?: string | null;
  newName?: string | null;
  targetFolder?: string | null;
  file?: File | null;
};

async function readPayload(req: Request): Promise<OpsPayload> {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const toStr = (name: string) => {
      const v = form.get(name);
      return v === null || v instanceof File ? null : String(v);
    };
    const file = form.get("file") instanceof File ? (form.get("file") as File) : null;
    return {
      action: toStr("action") || "",
      kind: toStr("kind"),
      key: toStr("key"),
      folderPath: toStr("folderPath"),
      newName: toStr("newName"),
      targetFolder: toStr("targetFolder"),
      file,
    };
  }
  return (await req.json()) as OpsPayload;
}

function normalizeFolder(path?: string | null): string {
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

function assertFileKey(key?: string | null): string {
  if (!key) throw new Error(INVALID_OBJECT_KEY);
  assertSafeKey(key);
  if (!isMediaKey(key)) throw new Error(INVALID_OBJECT_KEY);
  return key;
}

function markerKeyFor(folderPath: string): string {
  const key = `${MEDIA_DOMAIN}/${folderPath}/.keep`;
  assertSafeKey(key);
  return key;
}

async function listFolderKeys(folderPath: string): Promise<string[]> {
  if (typeof storage.list !== "function") {
    throw new Error("Penyimpanan tidak mendukung daftar objek");
  }
  const prefix = folderPath ? `${MEDIA_DOMAIN}/${folderPath}/` : `${MEDIA_DOMAIN}/`;
  const objs = await storage.list(prefix);
  return objs.map((o) => o.key);
}

async function copyPrefix(sourceFolder: string, targetFolder: string): Promise<number> {
  const sourcePrefix = `${MEDIA_DOMAIN}/${sourceFolder}/`;
  const keys = await listFolderKeys(sourceFolder);
  let count = 0;
  for (const key of keys) {
    const relative = key.slice(sourcePrefix.length);
    const newKey = `${MEDIA_DOMAIN}/${targetFolder}/${relative}`;
    assertSafeKey(newKey);
    await storage.copy(key, newKey);
    count += 1;
  }
  await storage.upload(new Uint8Array(0), ".keep", "application/octet-stream", {
    key: markerKeyFor(targetFolder),
  });
  return count;
}

async function movePrefix(sourceFolder: string, targetFolder: string): Promise<number> {
  const sourcePrefix = `${MEDIA_DOMAIN}/${sourceFolder}/`;
  const keys = await listFolderKeys(sourceFolder);
  let count = 0;
  for (const key of keys) {
    const relative = key.slice(sourcePrefix.length);
    const newKey = `${MEDIA_DOMAIN}/${targetFolder}/${relative}`;
    assertSafeKey(newKey);
    await storage.copy(key, newKey);
    await storage.delete(key);
    count += 1;
  }
  await storage.upload(new Uint8Array(0), ".keep", "application/octet-stream", {
    key: markerKeyFor(targetFolder),
  });
  return count;
}

async function deleteFolder(folderPath: string): Promise<number> {
  const keys = await listFolderKeys(folderPath);
  for (const key of keys) {
    await storage.delete(key);
  }
  return keys.length;
}

export async function POST(req: Request) {
  try {
    await assertAdmin();

    const payload = await readPayload(req);
    const { action } = payload;
    const isFolder = payload.kind === "folder";

    switch (action) {
      case "mkdir": {
        const folderPath = normalizeFolder(payload.folderPath);
        if (!folderPath) {
          return NextResponse.json({ error: "Nama folder wajib diisi" }, { status: 400 });
        }
        await storage.upload(new Uint8Array(0), ".keep", "application/octet-stream", {
          key: markerKeyFor(folderPath),
        });
        return NextResponse.json({ success: true, folderPath, key: markerKeyFor(folderPath) });
      }

      case "rename": {
        if (isFolder) {
          const folderPath = normalizeFolder(payload.folderPath);
          const newName = slugifySegment(payload.newName, "");
          if (!folderPath || !newName) {
            return NextResponse.json({ error: "Folder dan nama baru wajib diisi" }, { status: 400 });
          }
          if (newName === baseFolderName(folderPath)) {
            return NextResponse.json({ error: "Nama baru sama dengan nama folder saat ini" }, { status: 400 });
          }
          const parent = parentFolderPath(folderPath);
          const newPath = parent ? `${parent}/${newName}` : newName;
          if (newPath === folderPath || newPath.startsWith(`${folderPath}/`)) {
            return NextResponse.json({ error: "Path tujuan tidak valid" }, { status: 400 });
          }
          await movePrefix(folderPath, newPath);
          return NextResponse.json({ success: true, folderPath: newPath });
        }

        const key = assertFileKey(payload.key);
        if (!payload.newName) {
          return NextResponse.json({ error: "Nama file baru wajib diisi" }, { status: 400 });
        }
        const folderPath = folderPathOfKey(key);
        const newKey = buildMediaKey({ folderPath, filename: payload.newName });
        if (newKey === key) {
          return NextResponse.json({ error: "Nama baru sama dengan nama file saat ini" }, { status: 400 });
        }
        if (await storage.exists(newKey)) {
          return NextResponse.json({ error: "File dengan nama tersebut sudah ada" }, { status: 409 });
        }
        await storage.copy(key, newKey);
        await storage.delete(key);
        return NextResponse.json({ success: true, key: newKey });
      }

      case "move": {
        const target = normalizeFolder(payload.targetFolder);
        if (isFolder) {
          const folderPath = normalizeFolder(payload.folderPath);
          if (!folderPath) {
            return NextResponse.json({ error: "Folder wajib diisi" }, { status: 400 });
          }
          const newPath = target ? `${target}/${baseFolderName(folderPath)}` : baseFolderName(folderPath);
          if (newPath === folderPath || newPath.startsWith(`${folderPath}/`)) {
            return NextResponse.json(
              { error: "Tidak bisa memindahkan folder ke dalam dirinya sendiri" },
              { status: 400 }
            );
          }
          await movePrefix(folderPath, newPath);
          return NextResponse.json({ success: true, folderPath: newPath });
        }

        const key = assertFileKey(payload.key);
        const newKey = buildMediaKey({ folderPath: target, filename: leafFilename(key) });
        if (newKey === key) {
          return NextResponse.json({ error: "Folder tujuan sama dengan lokasi saat ini" }, { status: 400 });
        }
        if (await storage.exists(newKey)) {
          return NextResponse.json({ error: "File dengan nama tersebut sudah ada" }, { status: 409 });
        }
        await storage.copy(key, newKey);
        await storage.delete(key);
        return NextResponse.json({ success: true, key: newKey });
      }

      case "copy": {
        const target = normalizeFolder(payload.targetFolder);
        if (isFolder) {
          const folderPath = normalizeFolder(payload.folderPath);
          if (!folderPath) {
            return NextResponse.json({ error: "Folder wajib diisi" }, { status: 400 });
          }
          const newPath = target ? `${target}/${baseFolderName(folderPath)}` : baseFolderName(folderPath);
          if (newPath === folderPath || newPath.startsWith(`${folderPath}/`)) {
            return NextResponse.json(
              { error: "Tidak bisa menyalin folder ke dalam dirinya sendiri" },
              { status: 400 }
            );
          }
          await copyPrefix(folderPath, newPath);
          return NextResponse.json({ success: true, folderPath: newPath });
        }

        const key = assertFileKey(payload.key);
        const newKey = buildMediaKey({ folderPath: target, filename: leafFilename(key) });
        if (newKey === key) {
          return NextResponse.json({ error: "Folder tujuan sama dengan lokasi saat ini" }, { status: 400 });
        }
        if (await storage.exists(newKey)) {
          return NextResponse.json({ error: "File dengan nama tersebut sudah ada" }, { status: 409 });
        }
        await storage.copy(key, newKey);
        return NextResponse.json({ success: true, key: newKey });
      }

      case "replace": {
        const key = assertFileKey(payload.key);
        if (!payload.file) {
          return NextResponse.json({ error: "File pengganti wajib dipilih" }, { status: 400 });
        }
        if (payload.file.size > MEDIA_MAX_UPLOAD_BYTES) {
          return NextResponse.json(
            { error: `Ukuran file melebihi batas ${Math.round(MEDIA_MAX_UPLOAD_BYTES / 1024 / 1024)}MB` },
            { status: 400 }
          );
        }
        await storage.upload(payload.file, leafFilename(key), payload.file.type, { key });
        return NextResponse.json({ success: true, key });
      }

      case "delete": {
        if (isFolder) {
          const folderPath = normalizeFolder(payload.folderPath);
          if (!folderPath) {
            return NextResponse.json({ error: "Folder wajib diisi" }, { status: 400 });
          }
          const deleted = await deleteFolder(folderPath);
          return NextResponse.json({ success: true, folderPath, deleted });
        }
        const key = assertFileKey(payload.key);
        await storage.delete(key);
        return NextResponse.json({ success: true, key });
      }

      default:
        return NextResponse.json({ error: "Aksi tidak dikenali" }, { status: 400 });
    }
  } catch (err: any) {
    console.error("Media ops error:", err);
    if (err?.message === INVALID_OBJECT_KEY) {
      return NextResponse.json({ error: "Path tidak valid" }, { status: 400 });
    }
    return NextResponse.json({ error: err?.message || "Operasi gagal" }, { status: 500 });
  }
}
