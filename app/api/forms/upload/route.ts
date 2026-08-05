import { NextResponse } from "next/server";
import { storage } from "@/lib/storage";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "File tidak ditemukan." }, { status: 400 });
    }

    // Limit public form upload size to 50MB
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Ukuran berkas melebihi batas 50MB." }, { status: 400 });
    }

    // Upload to active storage provider (R2 / UploadThing)
    const uploadRes = await storage.upload(file, file.name, file.type);
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
