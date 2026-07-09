/**
 * check-file-links.ts
 * Provider-agnostic check: verifies HTTP 200 status over every file URL in DB.
 * Run with: bunx tsx scripts/check-file-links.ts
 */
import 'dotenv/config';
import { db } from '../lib/db/index';
import { driveItem, diktats } from '../db/schema';
import { eq, isNotNull } from 'drizzle-orm';

function extractFileKeyFromUrl(url: string): string | null {
  if (!url) return null;
  const parts = url.split('/f/');
  return parts.length > 1 ? parts[1] : url;
}

interface LinkCheckResult {
  id: string;
  name: string;
  source: 'DriveItem' | 'Diktat';
  url: string;
  httpStatus: number | string;
  pass: boolean;
}

async function main() {
  console.log('=== Starting Provider-Agnostic File Links Check ===');

  // 1. Fetch files from driveItem table
  const driveFiles = await db
    .select()
    .from(driveItem)
    .where(eq(driveItem.kind, 'file'));

  // 2. Fetch diktats
  const readyDiktats = await db
    .select()
    .from(diktats)
    .where(isNotNull(diktats.fileUrl));

  const results: LinkCheckResult[] = [];
  let overallPass = true;

  // Process Drive Items
  for (const item of driveFiles) {
    const key = item.uploadthingKey || item.ufsUrl;
    if (!key) {
      results.push({
        id: item.id,
        name: item.name,
        source: 'DriveItem',
        url: 'N/A',
        httpStatus: 'No URL/Key',
        pass: false,
      });
      overallPass = false;
      continue;
    }

    const cleanKey = extractFileKeyFromUrl(key) || key;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_APP_URL || "http://localhost:3000";
    const publicUrl = `${baseUrl}/api/storage/file/${cleanKey}`;

    let status: number | string = 'N/A';
    try {
      const res = await fetch(publicUrl, { method: 'HEAD' });
      status = res.status;
    } catch (err) {
      status = `Error: ${err instanceof Error ? err.message : String(err)}`;
    }

    const pass = status === 200;
    if (!pass) overallPass = false;

    results.push({
      id: item.id,
      name: item.name,
      source: 'DriveItem',
      url: publicUrl,
      httpStatus: status,
      pass,
    });
  }

  // Process Diktats
  for (const diktat of readyDiktats) {
    const key = diktat.fileUrl;
    if (!key) continue;

    const cleanKey = extractFileKeyFromUrl(key) || key;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_APP_URL || "http://localhost:3000";
    const publicUrl = `${baseUrl}/api/storage/file/${cleanKey}`;

    let status: number | string = 'N/A';
    try {
      const res = await fetch(publicUrl, { method: 'HEAD' });
      status = res.status;
    } catch (err) {
      status = `Error: ${err instanceof Error ? err.message : String(err)}`;
    }

    const pass = status === 200;
    if (!pass) overallPass = false;

    results.push({
      id: diktat.id,
      name: diktat.title,
      source: 'Diktat',
      url: publicUrl,
      httpStatus: status,
      pass,
    });
  }

  console.log('\nLinks Verification Summary:');
  console.table(
    results.map((r) => ({
      Source: r.source,
      Name: r.name.slice(0, 30),
      URL: r.url.slice(0, 60),
      'HTTP Status': r.httpStatus,
      Result: r.pass ? 'PASS' : 'FAIL',
    }))
  );

  if (overallPass) {
    console.log('\n✓ Links check passed! All database file URLs resolved to HTTP 200.');
    process.exit(0);
  } else {
    console.error('\n✗ Links check failed! Some database file URLs returned non-200 responses.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Script execution error:', err);
  process.exit(1);
});
