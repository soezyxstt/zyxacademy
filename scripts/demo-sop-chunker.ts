import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const PDF_URL = 'https://repository.dinamika.ac.id/id/eprint/4557/1/16390150009-2019-STIKOMSURABAYA.pdf';
const DEMO_DIR = path.resolve(process.cwd(), 'artifacts/demo-sop');
const PDF_FILE = path.join(DEMO_DIR, 'sample-sop.pdf');
const OUTPUT_JSON = path.join(DEMO_DIR, 'sop-chunks.json');
const OUTPUT_MD = path.join(DEMO_DIR, 'sop-chunks-preview.md');

export interface SOPChunk {
  chunk_id: string;
  dokumen: string;
  bab: string;
  subbab: string;
  halaman_mulai: number;
  halaman_selesai: number;
  karakter: number;
  hash: string;
  teks: string;
}

async function ensurePDF(): Promise<Buffer> {
  if (!fs.existsSync(DEMO_DIR)) {
    fs.mkdirSync(DEMO_DIR, { recursive: true });
  }

  if (fs.existsSync(PDF_FILE)) {
    console.log('[1/4] File PDF ditemukan di:', PDF_FILE);
    return fs.readFileSync(PDF_FILE);
  }

  console.log('[1/4] Mengunduh PDF contoh dari repository Dinamika...');
  const res = await fetch(PDF_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
  });
  if (!res.ok) throw new Error('Gagal mengunduh PDF: ' + res.status + ' ' + res.statusText);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(PDF_FILE, buf);
  return buf;
}

function cleanPageNoise(text: string): string {
  return text
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^INSTITUT BISNIS DAN INFORMATIKA STIKOM SURABAYA/i.test(trimmed)) return false;
      if (/^FAKULTAS EKONOMI DAN BISNIS/i.test(trimmed)) return false;
      if (/^\d+$/.test(trimmed)) return false;
      if (/\.{5,}/.test(trimmed)) return false;
      return true;
    })
    .join('\n');
}

export async function processSOPChunks() {
  const startTime = Date.now();
  console.log('================================================================');
  console.log('  OPTIMIZED SOP CHUNKER - COMPREHENSIVE SEMANTIC MERGING');
  console.log('================================================================');

  const pdfBuffer = await ensurePDF();

  console.log('[2/4] Mengekstrak teks dari PDF menggunakan parser lokal...');
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
  const extracted = await parser.getText();
  const rawText = extracted.text;

  const rawPages = rawText.split(/--\s*\d+\s+of\s+\d+\s*--/);
  const pages: { pageNum: number; content: string }[] = [];
  for (let i = 0; i < rawPages.length; i++) {
    const pContent = cleanPageNoise(rawPages[i]);
    if (pContent.trim().length > 0) {
      pages.push({ pageNum: i, content: pContent.trim() });
    }
  }
  console.log('      Total halaman berhasil diekstrak:', pages.length);

  console.log('[3/4] Melakukan sanitasi dokumen & pemotongan semantik optimal...');
  
  let bodyStartIndex = pages.findIndex(p => /BAB\s+I\b/i.test(p.content) && !/daftar\s+isi/i.test(p.content));
  if (bodyStartIndex === -1) bodyStartIndex = 0;
  console.log('      Halaman isi utama dimulai dari index halaman:', bodyStartIndex);

  const bodyPages = pages.slice(bodyStartIndex);
  
  const chunks: SOPChunk[] = [];
  let currentBab = 'BAB I PENDAHULUAN';
  let currentSubbab = '1.1 Latar Belakang Masalah';
  let currentParagraphs: string[] = [];
  let currentStartPage = bodyPages[0]?.pageNum ?? 1;
  let chunkCounter = 1;

  const MIN_CHUNK_CHARS = 700;
  const TARGET_CHUNK_CHARS = 1500;

  const flushChunk = (endPage: number, force = false) => {
    if (currentParagraphs.length === 0) return;
    const chunkText = currentParagraphs.join('\n\n').trim();
    if (!force && chunkText.length < MIN_CHUNK_CHARS) {
      // Jangan flush jika belum mencapai batas minimal agar tidak jadi sliver pendek
      return;
    }

    const hash = createHash('sha256').update(chunkText).digest('hex').slice(0, 16);
    chunks.push({
      chunk_id: 'SOP-CHUNK-' + String(chunkCounter++).padStart(3, '0'),
      dokumen: 'SOP Surat Masuk PT SUCOFINDO (Persero)',
      bab: currentBab,
      subbab: currentSubbab,
      halaman_mulai: currentStartPage,
      halaman_selesai: endPage,
      karakter: chunkText.length,
      hash,
      teks: chunkText,
    });
    currentParagraphs = [];
  };

  for (const page of bodyPages) {
    const lines = page.content.split('\n');
    let buffer = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Deteksi pergantian BAB besar
      const babMatch = line.match(/^(BAB\s+[I|V|X]+)\s*(.*)$/i);
      if (babMatch) {
        flushChunk(page.pageNum, true); // Force flush saat ganti bab besar
        const babTitle = babMatch[2] ? ' ' + babMatch[2].trim() : '';
        currentBab = (babMatch[1].toUpperCase() + babTitle).trim();
        currentSubbab = 'Umum';
        currentStartPage = page.pageNum;
        continue;
      }

      // Deteksi Sub-bab penomoran
      const subbabMatch = line.match(/^(\d+\.\d+(\.\d+)?)\s+([A-Z].+)$/);
      if (subbabMatch) {
        // Coba flush, tapi hanya jika sudah memenuhi ukuran minimal
        const currentLength = currentParagraphs.reduce((acc, p) => acc + p.length, 0);
        if (currentLength >= MIN_CHUNK_CHARS) {
          flushChunk(page.pageNum, true);
          currentSubbab = subbabMatch[0].trim();
          currentStartPage = page.pageNum;
        } else {
          // Tetap update subbab aktif tanpa memotong paksa teks
          currentSubbab = subbabMatch[0].trim();
        }
        continue;
      }

      buffer += (buffer ? ' ' : '') + line;

      // Jika menemukan akhir kalimat (.) atau titik dua (:)
      if (buffer.length >= 250 && (line.endsWith('.') || line.endsWith(':'))) {
        currentParagraphs.push(buffer);
        buffer = '';

        const currentTotalLength = currentParagraphs.reduce((acc, p) => acc + p.length, 0);
        if (currentTotalLength >= TARGET_CHUNK_CHARS) {
          flushChunk(page.pageNum, true);
          currentStartPage = page.pageNum;
        }
      }
    }

    if (buffer.trim()) {
      currentParagraphs.push(buffer.trim());
    }
  }

  // Flush sisa teks di akhir
  flushChunk(bodyPages[bodyPages.length - 1]?.pageNum ?? pages.length, true);

  console.log('[4/4] Menyimpan output chunk ke file JSON dan Markdown...');
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(chunks, null, 2), 'utf-8');

  // Render SEMUA chunk ke preview markdown agar terlihat utuh dan komprehensif
  let mdPreview = '# DOKUMEN HASIL CHUNKING OTOMATIS: SOP PT SUCOFINDO\n\n';
  mdPreview += `> **Total Chunks Terbentuk:** ${chunks.length} Chunks | **Total Karakter:** ${chunks.reduce((a, b) => a + b.karakter, 0).toLocaleString()} chars\n`;
  mdPreview += `> **Metode:** Local Semantic & Structure-Aware Parser (Zero External API)\n\n`;
  mdPreview += `## Daftar Isi Chunks\n`;
  for (const c of chunks) {
    mdPreview += `- [${c.chunk_id}] ${c.bab} > ${c.subbab} (${c.karakter} chars, Hal ${c.halaman_mulai}-${c.halaman_selesai})\n`;
  }
  mdPreview += `\n---\n\n## Isi Lengkap Chunks\n\n`;

  for (const c of chunks) {
    mdPreview += `### [${c.chunk_id}] ${c.bab} > ${c.subbab}\n`;
    mdPreview += `- **Halaman:** ${c.halaman_mulai} s/d ${c.halaman_selesai}\n`;
    mdPreview += `- **Panjang Karakter:** ${c.karakter} karakter\n`;
    mdPreview += `- **Hash Identifikasi:** \`${c.hash}\`\n\n`;
    mdPreview += `\`\`\`text\n${c.teks}\n\`\`\`\n\n---\n\n`;
  }
  fs.writeFileSync(OUTPUT_MD, mdPreview, 'utf-8');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  const avgChars = Math.round(chunks.reduce((a, b) => a + b.karakter, 0) / chunks.length);
  console.log('================================================================');
  console.log('  PROSES CHUNKING SELESAI DALAM ' + elapsed + ' DETIK');
  console.log('================================================================');
  console.log('  * Total Chunk Terbentuk : ' + chunks.length + ' chunks padat');
  console.log('  * Rata-rata Panjang     : ' + avgChars + ' karakter per chunk');
  console.log('  * File Output JSON      : artifacts/demo-sop/sop-chunks.json');
  console.log('  * File Output Preview   : artifacts/demo-sop/sop-chunks-preview.md');
  console.log('================================================================');
}

processSOPChunks().catch(console.error);
