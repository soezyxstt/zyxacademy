import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { storage } from "@/lib/storage";
import { joinKey, slugifySegment, userFileLeaf } from "@/lib/storage/keys";

const MAX_BATCH_FILES = 200;

const BodySchema = z.object({
  courseId: z.string().min(1),
  files: z
    .array(
      z.object({
        id: z.string().min(1),
        filename: z.string().min(1).max(255),
      })
    )
    .min(1)
    .max(MAX_BATCH_FILES),
});

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { courseId, files } = parsed.data;

  if (files.some((f) => !f.filename.toLowerCase().endsWith(".pdf"))) {
    return NextResponse.json(
      { error: "Hanya berkas PDF yang didukung" },
      { status: 400 }
    );
  }

  const prefix = joinKey("courses", slugifySegment(courseId), "materials");

  if (typeof storage.getSignedUrl !== "function") {
    return NextResponse.json(
      { error: "Penyimpanan aktif tidak mendukung unggahan presigned" },
      { status: 501 }
    );
  }

  const data = await Promise.all(
    files.map(async (file) => {
      const key = joinKey(prefix, userFileLeaf(file.filename));
      const uploadUrl = await storage.getSignedUrl!(key, "put", "application/pdf", 3600);
      return { id: file.id, key, uploadUrl };
    })
  );

  return NextResponse.json({ data }, { status: 201 });
}
