import { NextRequest, NextResponse } from "next/server";
import { assertTutorOrAdmin } from "@/lib/uploadthing-admin";
import { storage } from "@/lib/storage";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"];
const MAX_SIZE_MB = 20;

export async function POST(req: NextRequest) {
  try {
    const { user } = await assertTutorOrAdmin();

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Only JPEG, PNG, WEBP, GIF, MP4, and WEBM are allowed." }, { status: 400 });
    }

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return NextResponse.json({ error: `File size exceeds the ${MAX_SIZE_MB}MB limit.` }, { status: 400 });
    }

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const key = `blog/${timestamp}-${safeName}`;

    // Convert File to ArrayBuffer, then Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to R2 via generic storage interface
    const result = await storage.upload(buffer, key, file.type);

    return NextResponse.json({ url: result.url });
  } catch (error: any) {
    console.error("Error in blog media upload:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: error.status || 500 }
    );
  }
}
