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

  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF files are accepted' }, { status: 400 });
  }

  const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
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
