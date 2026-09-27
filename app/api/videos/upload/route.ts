import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { storage } from "@/lib/storage";
import {
  buildCourseVideoKey,
  buildCourseVideoThumbnailKey,
} from "@/lib/storage/keys";
import { requireTutorCourseAccess } from "@/lib/auth/tutor-access";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";

const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const MAX_THUMBNAIL_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".mkv", ".m4v"];
const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

async function verifyVideoUploaderAccess(
  userId: string,
  userRole: string | null | undefined,
  courseId: string
): Promise<{ allowed: boolean; slug: string }> {
  const identity = await resolveCourseIdentity(courseId);
  const courseSlug = identity?.slug || courseId;

  if (userRole === "admin") {
    return { allowed: true, slug: courseSlug };
  }

  try {
    await requireTutorCourseAccess(userId, courseId, { allowAdmin: true });
    return { allowed: true, slug: courseSlug };
  } catch {
    return { allowed: false, slug: courseSlug };
  }
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") || "";

  // 1. JSON Request for Presigned Direct-to-R2 Upload
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => null);
    const filename = body?.filename?.toString().trim() || "";
    const courseId = body?.courseId?.toString().trim() || "";
    const fileType = body?.fileType === "thumbnail" ? "thumbnail" : "video";
    const mimeType = body?.mimeType?.toString().trim() || (fileType === "thumbnail" ? "image/jpeg" : "video/mp4");
    const size = typeof body?.size === "number" ? body.size : Number(body?.size);

    if (!courseId) {
      return NextResponse.json({ error: "ID mata kuliah wajib diisi" }, { status: 400 });
    }

    const { allowed, slug } = await verifyVideoUploaderAccess(
      session.user.id,
      session.user.role,
      courseId
    );
    if (!allowed) {
      return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
    }

    const lowerFilename = filename.toLowerCase();

    if (fileType === "video") {
      const hasValidExt = ALLOWED_VIDEO_EXTENSIONS.some((ext) => lowerFilename.endsWith(ext));
      if (!hasValidExt) {
        return NextResponse.json(
          { error: "Format berkas video harus berupa MP4, WebM, MOV, atau MKV" },
          { status: 400 }
        );
      }
      if (!Number.isFinite(size) || size <= 0) {
        return NextResponse.json({ error: "Ukuran berkas video tidak valid" }, { status: 400 });
      }
      if (size > MAX_VIDEO_SIZE_BYTES) {
        return NextResponse.json(
          { error: "Ukuran berkas video melebihi batas 100 MB" },
          { status: 413 }
        );
      }
    } else {
      const hasValidExt = ALLOWED_IMAGE_EXTENSIONS.some((ext) => lowerFilename.endsWith(ext));
      if (!hasValidExt) {
        return NextResponse.json(
          { error: "Format thumbnail harus berupa JPG, PNG, atau WebP" },
          { status: 400 }
        );
      }
      if (size > MAX_THUMBNAIL_SIZE_BYTES) {
        return NextResponse.json(
          { error: "Ukuran thumbnail melebihi batas 5 MB" },
          { status: 413 }
        );
      }
    }

    const storageKey =
      fileType === "thumbnail"
        ? buildCourseVideoThumbnailKey({ courseSlug: slug, filename })
        : buildCourseVideoKey({ courseSlug: slug, filename });

    if (typeof storage.getSignedUrl !== "function") {
      return NextResponse.json(
        { error: "Penyimpanan aktif tidak mendukung unggahan presigned" },
        { status: 501 }
      );
    }

    const uploadUrl = await storage.getSignedUrl(storageKey, "put", mimeType, 3600, {
      contentLength: size,
    });
    const url = storage.getUrl(storageKey);

    return NextResponse.json({ key: storageKey, uploadUrl, url }, { status: 200 });
  }

  // 2. Multipart FormData Upload Fallback
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const courseId = formData.get("courseId")?.toString().trim();
  const fileType = formData.get("fileType") === "thumbnail" ? "thumbnail" : "video";

  if (!file) {
    return NextResponse.json({ error: "Berkas tidak ditemukan" }, { status: 400 });
  }
  if (!courseId) {
    return NextResponse.json({ error: "ID mata kuliah wajib diisi" }, { status: 400 });
  }

  const { allowed, slug } = await verifyVideoUploaderAccess(
    session.user.id,
    session.user.role,
    courseId
  );
  if (!allowed) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  const lowerName = file.name.toLowerCase();

  if (fileType === "video") {
    const hasValidExt = ALLOWED_VIDEO_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (!hasValidExt && !file.type.startsWith("video/")) {
      return NextResponse.json({ error: "Format berkas harus video (MP4, WebM, MOV, MKV)" }, { status: 400 });
    }
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      return NextResponse.json({ error: "Ukuran berkas video melebihi batas 100 MB" }, { status: 413 });
    }
  } else {
    const hasValidExt = ALLOWED_IMAGE_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (!hasValidExt && !file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Format thumbnail harus gambar (JPG, PNG, WebP)" }, { status: 400 });
    }
    if (file.size > MAX_THUMBNAIL_SIZE_BYTES) {
      return NextResponse.json({ error: "Ukuran thumbnail melebihi batas 5 MB" }, { status: 413 });
    }
  }

  const storageKey =
    fileType === "thumbnail"
      ? buildCourseVideoThumbnailKey({ courseSlug: slug, filename: file.name })
      : buildCourseVideoKey({ courseSlug: slug, filename: file.name });

  const leaf = storageKey.split("/").pop() || file.name;
  const mime = file.type || (fileType === "thumbnail" ? "image/jpeg" : "video/mp4");

  const { key, url } = await storage.upload(file, leaf, mime, {
    key: storageKey,
    metadata: {
      uploadedBy: session.user.id,
      originalName: file.name,
      courseId,
    },
  });

  return NextResponse.json({ key, url: storage.getUrl(key) }, { status: 200 });
}
