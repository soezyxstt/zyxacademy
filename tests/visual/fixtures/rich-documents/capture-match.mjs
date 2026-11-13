import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export const captureMatches = (capture, documentSha256, printSha256) => Boolean(printSha256 && capture?.documentSha256 === documentSha256 && capture?.printSha256 === printSha256);

export async function sourceHashes(root = 'tests/visual/fixtures/rich-documents') {
  const files = ['../rich-documents.css', ...(await readdir(root)).filter(name => /\.(?:js|mjs)$/.test(name))].sort();
  return Object.fromEntries(await Promise.all(files.map(async name => [name, createHash('sha256').update((await readFile(resolve(root, name), 'utf8')).replace(/\r\n/g, '\n')).digest('hex')])));
}
