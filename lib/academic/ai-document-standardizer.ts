import { generateContentWithFallback } from "@/lib/gemini";
import {
  type MaterialLevel1Category,
  type CourseMaterialSubcategory,
  isValidSubcategory,
} from "@/lib/course-materials";
import {
  detectMetadataFromFilename,
  standardizeDocumentTitle,
  buildCanonicalDocumentTitle,
  detectSessionFromFilename,
  detectPartNumberFromFilename,
  type BatchChapterInfo,
} from "@/lib/course-batch-upload";

export interface AiStandardizeInput {
  filename: string;
  courseCode: string;
  courseTitle?: string | null;
  chapters: BatchChapterInfo[];
  currentValues?: {
    title?: string;
    category?: MaterialLevel1Category;
    subcategory?: CourseMaterialSubcategory | null;
    year?: number | null;
  };
  userId?: string;
}

export interface AiStandardizeResult {
  title: string;
  category: MaterialLevel1Category;
  subcategory: CourseMaterialSubcategory | null;
  year: number | null;
  chapterIds: string[];
  matchedChapterOrderIndex: number | null;
  reasoning?: string;
}

export interface BatchAiStandardizeInput {
  files: Array<{ id: string; filename: string }>;
  courseCode: string;
  courseTitle?: string | null;
  chapters: BatchChapterInfo[];
  userId?: string;
}

export interface BatchAiStandardizeResultItem {
  id: string;
  filename: string;
  title: string;
  category: MaterialLevel1Category;
  subcategory: CourseMaterialSubcategory | null;
  year: number | null;
  chapterIds: string[];
  matchedChapterOrderIndex: number | null;
  reasoning?: string;
}

/**
 * Sanitizes titles to conform strictly with Zyx Academy durable rules:
 * - No em dashes or en dashes
 * - No exclamation marks
 * - Normalized whitespace
 */
export function sanitizeStandardTitle(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/!+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildDeterministicFallback(
  filename: string,
  courseCode: string,
  chapters: BatchChapterInfo[],
  currentValues?: AiStandardizeInput["currentValues"]
): AiStandardizeResult {
  const meta = detectMetadataFromFilename(filename, chapters);
  const category = currentValues?.category || meta.category;
  const subcategory = currentValues?.subcategory !== undefined ? currentValues.subcategory : meta.subcategory;
  const year = currentValues?.year !== undefined ? currentValues.year : meta.year;
  const chapterIds = meta.chapterIds.length > 0 ? meta.chapterIds : [];

  let matchedChapter: BatchChapterInfo | null = null;
  if (chapterIds.length === 1) {
    matchedChapter = chapters.find((c) => c.id === chapterIds[0]) || null;
  }

  const cleanCourseCode = courseCode.toUpperCase().replace(/[^A-Z0-9]/g, "");

  const session = detectSessionFromFilename(filename);
  const partNumber = detectPartNumberFromFilename(filename);

  const title = buildCanonicalDocumentTitle({
    courseCode,
    category,
    subcategory,
    chapterIndex: matchedChapter?.orderIndex ?? meta.primaryChapterIndex,
    chapterTitle: matchedChapter?.title,
    year,
    session,
    partNumber,
    customTopic: meta.title || undefined,
  });

  return {
    title: sanitizeStandardTitle(title),
    category,
    subcategory,
    year,
    chapterIds,
    matchedChapterOrderIndex: matchedChapter?.orderIndex ?? meta.primaryChapterIndex,
    reasoning: "Fallback deterministik berbasis heuristik nama berkas.",
  };
}

/**
 * Standardize single document metadata and display title using Gemini AI with fallback.
 */
export async function standardizeDocumentMetadataWithAi(
  input: AiStandardizeInput
): Promise<AiStandardizeResult> {
  const {
    filename,
    courseCode,
    courseTitle,
    chapters,
    currentValues,
    userId = "system-standardizer",
  } = input;

  const fallback = buildDeterministicFallback(filename, courseCode, chapters, currentValues);

  const sortedChapters = [...chapters].sort((a, b) => a.orderIndex - b.orderIndex);
  const chapterListing = sortedChapters
    .map((c) => `- ID: "${c.id}", Bab ${c.orderIndex}: "${c.title}"`)
    .join("\n");

  const systemInstruction = `Anda adalah kurator dokumen akademik resmi Zyx Academy.
Tugas Anda adalah menstandardisasi display name (judul tampilan) dan mengaitkan bab yang tepat untuk berkas perkuliahan yang diunggah.

KONVENSI PENOMORAN & SEMANTIK BAB:
1. Di Zyx Academy, bab SELALU dimulai dari Bab 1.
2. Di universitas atau slide dosen (misal ITB), dosen sering memulai dari Bab 0 (misal "Bab 0: Sistem Bilangan Real", sehingga file "Bab 01-Limit.pdf" adalah materi Limit).
   JANGAN PERNAH mencocokkan bab hanya berdasarkan angka pada nama berkas!
   Cocokkan topik materi berkas (misal "Limit", "Turunan", "Integral Tentu", "Aplikasi Turunan") secara semantik terhadap judul bab resmi yang terdaftar di sistem Zyx.
3. Kategori yang didukung:
   - "materi" (Subkategori: "materi_dosen", "scl", "modul", "ebook", "lainnya")
   - "soal" (Subkategori: "uts", "uas", "up", "ltm", "kuis", "kbf", "tutorial", "modul", "lainnya")
   - "pembahasan_soal" (Subkategori: "uts", "uas", "up", "ltm", "kuis", "kbf", "tutorial", "modul", "lainnya")

ATURAN DISPLAY NAME BAKU:
- materi_dosen: "Bab {orderIndex}: {Judul Bab di Zyx}" (misal: "Bab 2: Limit dan Kekontinuan")
  Jika materi multi-part: "Bab {orderIndex}: {Judul Bab di Zyx} (Bagian {N})"
  Jika materi aplikasi: "Bab {orderIndex}: {Judul Bab di Zyx} (Aplikasi)"
  Jika materi problem: "Bab {orderIndex}: {Judul Bab di Zyx} (Contoh Problem)"
- scl: "SCL Bab {orderIndex}: {Judul Bab di Zyx}"
- modul: "Modul Bab {orderIndex}: {Judul Bab di Zyx}"
- ebook: "Buku Teks: {Judul}"
- tutorial: "Tutorial {N}: Bab {orderIndex} ({Judul Bab}){Tahun}"
- kuis: "Kuis {N} {Kode MK}: Bab {orderIndex} ({Judul Bab}){Tahun}"
- kbf: "KBF {N} {Kode MK}: Bab {orderIndex} ({Judul Bab}){Tahun}"
- ltm: "LTM {N} {Kode MK}: Bab {orderIndex} ({Judul Bab})"
- uts: "UTS {Kode MK} [{Sesi}] {Tahun} (Soal)" (misal: "UTS MA1101 Sesi 1 2024 (Soal)")
- uas: "UAS {Kode MK} [{Sesi}] {Tahun} (Soal)"
- up: "UP {Kode MK} {Tahun} (Soal)"
- pembahasan_soal: Awali dengan kata "Pembahasan" (misal: "Pembahasan UTS MA1101 Sesi 1 2024", "Pembahasan UP MA1101 2022")

ATURAN FORMAT KETAT:
- Jangan gunakan tanda hubung em-dash (—) maupun en-dash (–). Gunakan titik dua (:), koma (,), atau titik (.).
- Jangan gunakan tanda seru (!).
- Tulis dalam bahasa Indonesia baku, ringkas, dan jelas.
- Kembalikan output HANYA dalam format JSON valid.`;

  const userPrompt = `INFORMASI MATA KULIAH:
- Kode: ${courseCode}
- Judul: ${courseTitle || courseCode}

DAFTAR BAB TERDAFTAR DI ZYX:
${chapterListing || "(Belum ada bab terdaftar)"}

BERKAS YANG AKAN DISTANDARDISASI:
- Nama Berkas: "${filename}"
- Nilai Saat Ini (jika ada): ${JSON.stringify(currentValues || {})}

Berikan output JSON dengan format persis berikut:
{
  "title": "Display name baku dokumen sesuai konvensi",
  "category": "materi | soal | pembahasan_soal",
  "subcategory": "materi_dosen | scl | modul | ebook | kuis | kbf | tutorial | uts | uas | lainnya",
  "matchedChapterId": "ID bab dari daftar di atas yang paling cocok atau null",
  "matchedChapterOrderIndex": 1,
  "year": 2023,
  "reasoning": "Penjelasan singkat pemetaan semantik bab"
}`;

  try {
    const { response } = await generateContentWithFallback({
      contents: userPrompt,
      userId,
      feature: "academic-document-standardizer",
      useCase: "tutoring",
      config: {
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const rawText = response.text || "";
    const parsed = JSON.parse(rawText);

    const validCategory: MaterialLevel1Category = ["materi", "soal", "pembahasan_soal"].includes(
      parsed.category
    )
      ? parsed.category
      : fallback.category;

    let validSubcategory: CourseMaterialSubcategory | null = parsed.subcategory || fallback.subcategory;
    if (validSubcategory && !isValidSubcategory(validCategory, validSubcategory)) {
      validSubcategory = null;
    }

    let chapterIds = fallback.chapterIds;
    let matchedChapterOrderIndex = fallback.matchedChapterOrderIndex;

    if (parsed.matchedChapterId && chapters.some((c) => c.id === parsed.matchedChapterId)) {
      chapterIds = [parsed.matchedChapterId];
      const matched = chapters.find((c) => c.id === parsed.matchedChapterId);
      if (matched) matchedChapterOrderIndex = matched.orderIndex;
    } else if (
      typeof parsed.matchedChapterOrderIndex === "number" &&
      chapters.some((c) => c.orderIndex === parsed.matchedChapterOrderIndex)
    ) {
      const matched = chapters.find((c) => c.orderIndex === parsed.matchedChapterOrderIndex);
      if (matched) {
        chapterIds = [matched.id];
        matchedChapterOrderIndex = matched.orderIndex;
      }
    }

    const title = sanitizeStandardTitle(parsed.title || fallback.title);
    const year =
      typeof parsed.year === "number" && parsed.year >= 1900 && parsed.year <= 2100
        ? parsed.year
        : fallback.year;

    return {
      title,
      category: validCategory,
      subcategory: validSubcategory,
      year,
      chapterIds,
      matchedChapterOrderIndex,
      reasoning: parsed.reasoning || "Dianalisis oleh Zyx Gemini AI",
    };
  } catch (err) {
    console.warn("[standardizeDocumentMetadataWithAi] Failed to invoke Gemini, falling back:", err);
    return fallback;
  }
}

/**
 * Standardize multiple staged documents in one batched Gemini request.
 */
export async function batchStandardizeDocumentsWithAi(
  input: BatchAiStandardizeInput
): Promise<BatchAiStandardizeResultItem[]> {
  const { files, courseCode, courseTitle, chapters, userId = "system-batch-standardizer" } = input;

  if (files.length === 0) return [];

  const fallbacks: Record<string, AiStandardizeResult> = {};
  for (const f of files) {
    fallbacks[f.id] = buildDeterministicFallback(f.filename, courseCode, chapters);
  }

  const sortedChapters = [...chapters].sort((a, b) => a.orderIndex - b.orderIndex);
  const chapterListing = sortedChapters
    .map((c) => `- ID: "${c.id}", Bab ${c.orderIndex}: "${c.title}"`)
    .join("\n");

  const fileListing = files
    .map((f, i) => `${i + 1}. ID: "${f.id}", Berkas: "${f.filename}"`)
    .join("\n");

  const systemInstruction = `Anda adalah kurator dokumen akademik Zyx Academy.
Tugas Anda adalah menstandardisasi display name dan memetakan bab yang tepat untuk sejumlah berkas PDF perkuliahan sekaligus.

KONVENSI PENOMORAN & SEMANTIK BAB:
1. Di Zyx Academy, bab SELALU dimulai dari Bab 1.
2. Di universitas (seperti ITB), dosen sering memulai penomoran dari Bab 0 (misal "Bab 0: Sistem Bilangan Real", sehingga slide "Bab 01-Limit.pdf" adalah materi Limit).
   JANGAN PERNAH mencocokkan bab hanya berdasarkan angka pada nama berkas!
   Cocokkan topik materi berkas (misal "Limit", "Turunan", "Integral Tentu", "Aplikasi Integral") secara semantik terhadap judul bab resmi yang terdaftar di sistem Zyx.
3. Kategori: "materi", "soal", "pembahasan_soal".
4. Display name baku:
   - materi_dosen: "Bab {orderIndex}: {Judul Bab di Zyx}"
   - tutorial: "Tutorial {N}: Bab {orderIndex} ({Judul Bab})"
   - kuis: "Kuis {N} {Kode MK}: Bab {orderIndex} ({Judul Bab})"
   - kbf: "KBF {N} {Kode MK}: Bab {orderIndex} ({Judul Bab})"
   - uts: "UTS {Kode MK} {Tahun/TahunAjaran}"
   - uas: "UAS {Kode MK} {Tahun/TahunAjaran}"
   - pembahasan_soal: Awali dengan kata "Pembahasan"
5. Larangan: Jangan gunakan em-dash (—) atau en-dash (–) atau tanda seru (!). Gunakan bahasa Indonesia baku.`;

  const userPrompt = `INFORMASI MATA KULIAH:
- Kode: ${courseCode}
- Judul: ${courseTitle || courseCode}

DAFTAR BAB TERDAFTAR DI ZYX:
${chapterListing || "(Belum ada bab terdaftar)"}

DAFTAR BERKAS UNTUK DISTANDARDISASI:
${fileListing}

Kembalikan output HANYA dalam JSON valid berbentuk array pada properti "items":
{
  "items": [
    {
      "id": "ID berkas yang sesuai dengan daftar di atas",
      "title": "Display name baku",
      "category": "materi | soal | pembahasan_soal",
      "subcategory": "materi_dosen | scl | modul | ebook | kuis | kbf | tutorial | uts | uas | lainnya",
      "matchedChapterId": "ID bab yang cocok atau null",
      "matchedChapterOrderIndex": 2,
      "year": 2023,
      "reasoning": "Alasan pemetaan"
    }
  ]
}`;

  try {
    const { response } = await generateContentWithFallback({
      contents: userPrompt,
      userId,
      feature: "academic-batch-document-standardizer",
      useCase: "tutoring",
      config: {
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const rawText = response.text || "";
    const parsed = JSON.parse(rawText);
    const items: any[] = Array.isArray(parsed?.items) ? parsed.items : [];

    const itemsMap = new Map<string, any>();
    for (const item of items) {
      if (item?.id) itemsMap.set(item.id, item);
    }

    return files.map((f) => {
      const fb = fallbacks[f.id];
      const item = itemsMap.get(f.id);

      if (!item) {
        return {
          id: f.id,
          filename: f.filename,
          title: fb.title,
          category: fb.category,
          subcategory: fb.subcategory,
          year: fb.year,
          chapterIds: fb.chapterIds,
          matchedChapterOrderIndex: fb.matchedChapterOrderIndex,
          reasoning: fb.reasoning,
        };
      }

      const validCategory: MaterialLevel1Category = ["materi", "soal", "pembahasan_soal"].includes(
        item.category
      )
        ? item.category
        : fb.category;

      let validSubcategory: CourseMaterialSubcategory | null = item.subcategory || fb.subcategory;
      if (validSubcategory && !isValidSubcategory(validCategory, validSubcategory)) {
        validSubcategory = null;
      }

      let chapterIds = fb.chapterIds;
      let matchedChapterOrderIndex = fb.matchedChapterOrderIndex;

      if (item.matchedChapterId && chapters.some((c) => c.id === item.matchedChapterId)) {
        chapterIds = [item.matchedChapterId];
        const matched = chapters.find((c) => c.id === item.matchedChapterId);
        if (matched) matchedChapterOrderIndex = matched.orderIndex;
      } else if (
        typeof item.matchedChapterOrderIndex === "number" &&
        chapters.some((c) => c.orderIndex === item.matchedChapterOrderIndex)
      ) {
        const matched = chapters.find((c) => c.orderIndex === item.matchedChapterOrderIndex);
        if (matched) {
          chapterIds = [matched.id];
          matchedChapterOrderIndex = matched.orderIndex;
        }
      }

      const title = sanitizeStandardTitle(item.title || fb.title);
      const year =
        typeof item.year === "number" && item.year >= 1900 && item.year <= 2100
          ? item.year
          : fb.year;

      return {
        id: f.id,
        filename: f.filename,
        title,
        category: validCategory,
        subcategory: validSubcategory,
        year,
        chapterIds,
        matchedChapterOrderIndex,
        reasoning: item.reasoning || "Dianalisis oleh Zyx Gemini AI",
      };
    });
  } catch (err) {
    console.warn("[batchStandardizeDocumentsWithAi] Failed to invoke Gemini, falling back:", err);
    return files.map((f) => ({
      id: f.id,
      filename: f.filename,
      ...fallbacks[f.id],
    }));
  }
}
