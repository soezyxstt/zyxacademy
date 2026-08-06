import { NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import { buildFormStorageKey } from "@/lib/forms/storage-utils";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const formTitle = (formData.get("formTitle") as string | null) || undefined;
    const formSlug = (formData.get("formSlug") as string | null) || undefined;
    const questionNumber = (formData.get("questionNumber") as string | null) || undefined;

    if (!file) {
      return NextResponse.json({ error: "File tidak ditemukan." }, { status: 400 });
    }

    // Limit public form upload size to 50MB
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Ukuran berkas melebihi batas 50MB." }, { status: 400 });
    }

    // Build structured storage key: forms/[judul-forms]/question-[number]/[filename]
    const customKey = buildFormStorageKey({
      formTitle,
      formSlug,
      questionNumber,
      filename: file.name,
    });

    // Upload to active storage provider (R2 / UploadThing) using custom key
    const uploadRes = await storage.upload(file, file.name, file.type, { key: customKey });
    const publicUrl = storage.getUrl(uploadRes.key);

    return NextResponse.json({
      success: true,
      key: uploadRes.key,
      url: publicUrl,
    });
  } catch (err: any) {
    console.error("Public Form Upload Error:", err);
    return NextResponse.json({ error: err.message || "Gagal mengunggah berkas." }, { status: 500 });
  }
}

