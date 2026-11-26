import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { hasPeran } from "@/lib/auth/authorization";
import { detectFormFileMime, FORM_IMAGE_MIMES } from "@/lib/forms/file-types";
import { PUBLIC_FORM_MAX_FILE_SIZE_MB } from "@/lib/forms/presentation";
import { buildFormStorageKey } from "@/lib/forms/storage-utils";
import { storage } from "@/lib/storage";

export async function POST(req: Request) {
  try {
    const expectedUser = req.headers.get("x-native-operations-user-id");
    const expectedSession = req.headers.get("x-native-operations-session-id");
    const native = expectedUser !== null || expectedSession !== null;
    if (native && req.headers.get("origin") !== new URL(resolveAuthBaseUrl()).origin) {
      return NextResponse.json({ error: "Akses admin diperlukan." }, { status: 403 });
    }
    const session = await auth.api.getSession({
      headers: req.headers,
      ...(native ? { query: { disableCookieCache: true, disableRefresh: true } } : {}),
    });
    if (native && (!expectedUser || !expectedSession || session?.user.id !== expectedUser || session.session.id !== expectedSession)) {
      return NextResponse.json({ error: "Akses admin diperlukan." }, { status: 403 });
    }
    if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
      return NextResponse.json({ error: "Akses admin diperlukan." }, { status: 403 });
    }

    const formData = await req.formData().catch(() => null);
    const file = formData?.get("file");
    const formTitle = formData?.get("formTitle");
    const questionNumber = formData?.get("questionNumber");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Pilih gambar yang akan diunggah." }, { status: 400 });
    }
    if (file.size > PUBLIC_FORM_MAX_FILE_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ error: `Maksimal ${PUBLIC_FORM_MAX_FILE_SIZE_MB} MB per berkas.` }, { status: native ? 413 : 400 });
    }
    const mime = await detectFormFileMime(file, FORM_IMAGE_MIMES);
    if (!mime) {
      return NextResponse.json({ error: "Pilih gambar JPEG, PNG, GIF, atau WebP yang valid." }, { status: 415 });
    }

    const key = buildFormStorageKey({
      formTitle: typeof formTitle === "string" ? formTitle : undefined,
      questionNumber: typeof questionNumber === "string" ? questionNumber : undefined,
      filename: file.name,
    });
    const upload = await storage.upload(file, file.name, mime, { key });
    return NextResponse.json({ success: true, key: upload.key, url: storage.getUrl(upload.key) });
  } catch (error) {
    console.error("Form Question Image Upload Error:", error);
    return NextResponse.json({ error: "Gagal mengunggah gambar." }, { status: 500 });
  }
}
