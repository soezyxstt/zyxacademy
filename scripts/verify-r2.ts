/**
 * verify-r2.ts
 * Health check: verify that every DB file key exists in R2 (size > 0)
 * and resolves to an HTTP 200 via its public CDN URL.
 * Run with: bunx tsx scripts/verify-r2.ts
 */
import 'dotenv/config';
import { db } from '../lib/db/index';
import { driveItem, diktats } from '../db/schema';
import { eq, isNotNull } from 'drizzle-orm';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

const bucket = process.env.R2_BUCKET || 'zyx';

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

function extractFileKeyFromUrl(url: string): string | null {
  if (!url) return null;
  const parts = url.split('/f/');
  return parts.length > 1 ? parts[1] : url;
}

const CONFORMING_DOMAINS = ['courses', 'blog', 'forms', 'pka', 'overhaul', 'uploads'];

/** Structured keys look like `{domain}/{entity-slug}/{subfolder...}/{leaf}`. */
function isConformingKey(key: string): boolean {
  const parts = key.split('/').filter(Boolean);
  if (parts.length < 2) return false;
  if (!CONFORMING_DOMAINS.includes(parts[0])) return false;
  if (parts[0] === 'courses') return parts.length >= 3;
  return true;
}

interface VerifyResult {
  id: string;
  name: string;
  source: 'DriveItem' | 'Diktat';
  key: string;
  existsInR2: boolean;
  sizeBytes: number;
  publicUrl: string;
  httpStatus: number | string;
  pass: boolean;
  conforms: boolean;
}

async function main() {
  console.log('=== Starting R2 Database Storage Verification ===');
  
  if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    console.error('Error: Missing R2 environment credentials (endpoint, access key, or secret key).');
    process.exit(1);
  }

  // 1. Fetch files from driveItem table
  const driveFiles = await db
    .select()
    .from(driveItem)
    .where(eq(driveItem.kind, 'file'));

  // 2. Fetch diktats that are ready and have fileUrls
  const readyDiktats = await db
    .select()
    .from(diktats)
    .where(isNotNull(diktats.fileUrl));

  const results: VerifyResult[] = [];
  let overallPass = true;

  // Process Drive Items
  for (const item of driveFiles) {
    const key = item.uploadthingKey || item.ufsUrl;
    if (!key) {
      results.push({
        id: item.id,
        name: item.name,
        source: 'DriveItem',
        key: 'N/A',
        existsInR2: false,
        sizeBytes: 0,
        publicUrl: 'N/A',
        httpStatus: 'No Key',
        pass: false,
        conforms: false,
      });
      overallPass = false;
      continue;
    }

    const cleanKey = extractFileKeyFromUrl(key) || key;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_APP_URL || "http://localhost:3000";
    const publicUrl = `${baseUrl}/api/storage/file/${cleanKey}`;

    let exists = false;
    let size = 0;
    let status: number | string = 'N/A';

    // Check R2 Existence via S3
    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: cleanKey }));
      exists = true;
      size = head.ContentLength || 0;
    } catch {
      exists = false;
    }

    // Check HTTP Status via public URL
    try {
      const res = await fetch(publicUrl, { method: 'HEAD' });
      status = res.status;
    } catch (err) {
      status = `Error: ${err instanceof Error ? err.message : String(err)}`;
    }

    const pass = exists && size > 0 && status === 200;
    if (!pass) overallPass = false;

    results.push({
      id: item.id,
      name: item.name,
      source: 'DriveItem',
      key: cleanKey,
      existsInR2: exists,
      sizeBytes: size,
      publicUrl,
      httpStatus: status,
      pass,
      conforms: isConformingKey(cleanKey),
    });
  }

  // Process Diktats
  for (const diktat of readyDiktats) {
    const key = diktat.fileUrl;
    if (!key) continue;

    const cleanKey = extractFileKeyFromUrl(key) || key;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_APP_URL || "http://localhost:3000";
    const publicUrl = `${baseUrl}/api/storage/file/${cleanKey}`;

    let exists = false;
    let size = 0;
    let status: number | string = 'N/A';

    // Check R2 Existence via S3
    try {
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: cleanKey }));
      exists = true;
      size = head.ContentLength || 0;
    } catch {
      exists = false;
    }

    // Check HTTP Status via public URL
    try {
      const res = await fetch(publicUrl, { method: 'HEAD' });
      status = res.status;
    } catch (err) {
      status = `Error: ${err instanceof Error ? err.message : String(err)}`;
    }

    const pass = exists && size > 0 && status === 200;
    if (!pass) overallPass = false;

    results.push({
      id: diktat.id,
      name: diktat.title,
      source: 'Diktat',
      key: cleanKey,
      existsInR2: exists,
      sizeBytes: size,
      publicUrl,
      httpStatus: status,
      pass,
      conforms: isConformingKey(cleanKey),
    });
  }

  console.log('\nVerification Summary Table:');
  console.table(
    results.map((r) => ({
      Source: r.source,
      Name: r.name.slice(0, 30),
      Key: r.key.slice(0, 30),
      'R2 Exists': r.existsInR2 ? 'YES' : 'NO',
      'Size (bytes)': r.sizeBytes,
      'HTTP Status': r.httpStatus,
      'Conforms': r.conforms ? 'YES' : 'NO',
      Result: r.pass ? 'PASS' : 'FAIL',
    }))
  );

  if (overallPass) {
    console.log('\n✓ Health check passed! All DB files exist in R2, have valid sizes, and yield HTTP 200.');
    process.exit(0);
  } else {
    console.error('\n✗ Health check failed! Some DB files are missing, empty, or yield non-200 responses.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Script execution error:', err);
  process.exit(1);
});
