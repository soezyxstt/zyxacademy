import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { storage } from '@/lib/storage';
import { joinKey, slugifySegment, userFileLeaf } from '@/lib/storage/keys';

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") || "";

  const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

  // 1. Handle JSON request for presigned direct R2 upload (bypasses Vercel 4.5MB payload limit)
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => null);
    const filename = body?.filename?.toString().trim() || "";
    const courseId = body?.courseId?.toString().trim();
    const size = typeof body?.size === "number" ? body.size : Number(body?.size);

    if (!filename || !filename.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Nama berkas PDF wajib diisi dan berakhiran .pdf" }, { status: 400 });
    }

    if (!Number.isFinite(size) || size <= 0) {
      return NextResponse.json({ error: "Ukuran berkas (size) wajib diisi dengan nilai valid" }, { status: 400 });
    }

    if (size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "Ukuran berkas melebihi batas 50 MB" }, { status: 413 });
    }

    if (typeof storage.getSignedUrl !== "function") {
      return NextResponse.json(
        { error: "Penyimpanan aktif tidak mendukung unggahan presigned" },
        { status: 501 }
      );
    }

    const leaf = userFileLeaf(filename);
    const storageKey = courseId
      ? joinKey("courses", slugifySegment(courseId), "materials", leaf)
      : joinKey(
          "uploads",
          String(new Date().getUTCFullYear()),
          String(new Date().getUTCMonth() + 1).padStart(2, "0"),
          leaf
        );

    const uploadUrl = await storage.getSignedUrl(storageKey, "put", "application/pdf", 3600, {
      contentLength: size,
    });
    const url = storage.getUrl(storageKey);

    return NextResponse.json({ key: storageKey, uploadUrl, url }, { status: 200 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 });
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File size exceeds 50 MB limit' }, { status: 413 });
  }

  const courseId = formData.get('courseId')?.toString().trim();
  const customFilename = formData.get('filename')?.toString().trim();
  const targetFilename =
    customFilename && customFilename.toLowerCase().endsWith('.pdf')
      ? customFilename
      : file.name;
  const leaf = userFileLeaf(targetFilename);

  const storageKey = courseId
    ? joinKey("courses", slugifySegment(courseId), "materials", leaf)
    : joinKey(
        "uploads",
        String(new Date().getUTCFullYear()),
        String(new Date().getUTCMonth() + 1).padStart(2, "0"),
        leaf
      );

  const { key, url } = await storage.upload(file, leaf, 'application/pdf', {
    key: storageKey,
    metadata: {
      uploadedBy: session.user.id,
      originalName: file.name,
    },
  });

  return NextResponse.json({ key, url }, { status: 201 });
}
