"use server";

import { db } from "@/db";
import {
  user as userTable,
  knowledgeObjects,
  websiteMaterials,
  vectorSyncQueue,
} from "@/db/schema";
import { assertAdmin } from "@/lib/uploadthing-admin";
import { importChapterBundle, type ImportMode, type BundleChapterDiff } from "@/lib/bundle-importer";
import {
  importAssessmentBundle,
  resolveCourseAndChaptersByTitle,
  type AssessmentImportMode,
  type AssessmentSourceDiff,
} from "@/lib/assessment-bundle-importer";
import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// Import post-processing functions
import { compileMarkdown } from "@/lib/markdown-compiler";
import { verifyKOCoverage } from "@/lib/ko-coverage-auditor";
import { buildTermIndex } from "@/lib/term-index";
import { buildConceptGraph } from "@/lib/graph-trace";
import { LEGACY_AUTHORING_RETIRED_MESSAGE } from "@/lib/admin/legacy-authoring-retirement";

export interface ImportResult {
  success: boolean;
  error: string | null;
  friendlyExplanation?: string | null;
  jsonSnippet?: string | null;
  errorContext?: {
    courseTitle?: string;
    chapterTitle?: string;
    chapterIndex?: number;
    entityType?: "Mata Kuliah" | "Bab" | "Knowledge Object (Materi)" | "Konsep" | "Materi Website" | "Kartu Flash" | "Sumber Ujian" | "Butir Soal" | "Relasi Pengetahuan";
    entityName?: string;
    propertyName?: string;
  } | null;
  logs: string[];
  stats?: {
    courseId: string;
    chapterCount: number;
    koCount: number;
    wmCount: number;
    fsetCount: number;
    fcCount: number;
    asCount: number;
    aoCount: number;
    krCount: number;
    chapterDiffs: BundleChapterDiff[];
  };
}

interface ErrorContext {
  courseTitle?: string;
  chapterTitle?: string;
  chapterIndex?: number;
  entityType?: "Mata Kuliah" | "Bab" | "Knowledge Object (Materi)" | "Konsep" | "Materi Website" | "Kartu Flash" | "Sumber Ujian" | "Butir Soal" | "Relasi Pengetahuan";
  entityName?: string;
  propertyName?: string;
}

function findJsonErrorContext(jsonText: string, errorPos: number): ErrorContext | null {
  try {
    let i = 0;
    const stack: { type: "object" | "array"; key?: string; index?: number }[] = [];
    let currentKey: string | undefined = undefined;

    let courseTitle = "";
    let chapterTitle = "";
    let chapterIndex = -1;
    let koTitle = "";
    let conceptSlug = "";
    let conceptName = "";
    let fsetTitle = "";
    let asTitle = "";
    let aoOrder = -1;
    let krSource = "";
    let krTarget = "";

    while (i < errorPos) {
      const char = jsonText[i];
      if (/\s/.test(char)) {
        i++;
        continue;
      }

      if (char === '"') {
        let str = "";
        i++;
        while (i < errorPos) {
          if (jsonText[i] === '"') {
            break;
          }
          if (jsonText[i] === '\\') {
            str += '\\';
            i++;
            if (i < errorPos) {
              str += jsonText[i];
            }
          } else {
            str += jsonText[i];
          }
          i++;
        }
        i++;

        let nextIdx = i;
        while (nextIdx < errorPos && /\s/.test(jsonText[nextIdx])) {
          nextIdx++;
        }

        if (nextIdx < errorPos && jsonText[nextIdx] === ':') {
          currentKey = str;
          i = nextIdx + 1;
        } else {
          if (currentKey) {
            const parent = stack[stack.length - 1];
            if (parent && parent.type === "object") {
              const grandparent = stack[stack.length - 2];
              
              if (currentKey === "title") {
                if (stack.length === 2 && stack[0].key === "course") {
                  courseTitle = str;
                } else if (parent.key === "chapters" || (grandparent && grandparent.key === "chapters")) {
                  chapterTitle = str;
                } else if (parent.key === "knowledgeObjects" || (grandparent && grandparent.key === "knowledgeObjects")) {
                  koTitle = str;
                } else if (parent.key === "flashcardSets" || (grandparent && grandparent.key === "flashcardSets")) {
                  fsetTitle = str;
                } else if (parent.key === "assessmentSources" || (grandparent && grandparent.key === "assessmentSources")) {
                  asTitle = str;
                }
              } else if (currentKey === "canonicalSlug") {
                conceptSlug = str;
              } else if (currentKey === "displayName") {
                conceptName = str;
              } else if (currentKey === "sourceKo$ref") {
                krSource = str;
              } else if (currentKey === "targetKo$ref") {
                krTarget = str;
              }
            }
            currentKey = undefined;
          }
        }
        continue;
      }

      if (char === '{') {
        stack.push({ type: "object", key: currentKey });
        currentKey = undefined;
        i++;
        continue;
      }

      if (char === '}') {
        stack.pop();
        currentKey = undefined;
        i++;
        continue;
      }

      if (char === '[') {
        stack.push({ type: "array", key: currentKey, index: 0 });
        currentKey = undefined;
        i++;
        continue;
      }

      if (char === ']') {
        stack.pop();
        currentKey = undefined;
        i++;
        continue;
      }

      if (char === ',') {
        const top = stack[stack.length - 1];
        if (top && top.type === "array" && top.index !== undefined) {
          top.index++;
        }
        currentKey = undefined;
        i++;
        continue;
      }

      if (/[0-9\-tfn]/.test(char)) {
        let valStr = "";
        while (i < errorPos && /[0-9\.a-zA-Z\-+]/.test(jsonText[i])) {
          valStr += jsonText[i];
          i++;
        }
        if (currentKey === "questionOrder") {
          const num = parseInt(valStr, 10);
          if (!isNaN(num)) aoOrder = num;
        }
        currentKey = undefined;
        continue;
      }

      i++;
    }

    let entityType: ErrorContext["entityType"] = undefined;
    let entityName = "";
    let propertyName = currentKey;

    const chaptersElement = stack.find(el => el.key === "chapters");
    if (chaptersElement && chaptersElement.index !== undefined) {
      chapterIndex = chaptersElement.index;
    }

    const currentContainer = stack[stack.length - 1];
    const parentContainer = stack[stack.length - 2];

    if (currentContainer) {
      if (currentContainer.key === "course" || (parentContainer && parentContainer.key === "course")) {
        entityType = "Mata Kuliah";
        entityName = courseTitle || "Mata Kuliah Baru";
      } else if (currentContainer.key === "chapters" || (parentContainer && parentContainer.key === "chapters" && stack.length <= 5)) {
        entityType = "Bab";
        entityName = chapterTitle || `Bab ke-${chapterIndex + 1}`;
      } else if (stack.some(el => el.key === "knowledgeObjects")) {
        entityType = "Knowledge Object (Materi)";
        entityName = koTitle || "Materi Baru";
      } else if (stack.some(el => el.key === "concepts")) {
        entityType = "Konsep";
        entityName = conceptName || conceptSlug || "Konsep Baru";
      } else if (stack.some(el => el.key === "websiteMaterials")) {
        entityType = "Materi Website";
        entityName = "Dokumen Markdown Bab";
      } else if (stack.some(el => el.key === "flashcardSets")) {
        entityType = "Kartu Flash";
        entityName = fsetTitle || "Set Flashcard";
      } else if (stack.some(el => el.key === "assessmentSources")) {
        entityType = "Sumber Ujian";
        entityName = asTitle || "Sumber Ujian Baru";
      } else if (stack.some(el => el.key === "assessmentObjects")) {
        entityType = "Butir Soal";
        entityName = aoOrder !== -1 ? `Soal nomor ${aoOrder}` : "Butir Soal Baru";
      } else if (stack.some(el => el.key === "knowledgeRelationships")) {
        entityType = "Relasi Pengetahuan";
        entityName = krSource && krTarget ? `Relasi (${krSource} -> ${krTarget})` : "Hubungan Antar Materi";
      }
    }

    return {
      courseTitle: courseTitle || undefined,
      chapterTitle: chapterTitle || undefined,
      chapterIndex: chapterIndex !== -1 ? chapterIndex + 1 : undefined,
      entityType,
      entityName: entityName || undefined,
      propertyName: propertyName || undefined,
    };
  } catch (e) {
    console.error("Failed to extract JSON error context:", e);
    return null;
  }
}

function getFriendlyJsonError(errorMsg: string, jsonText: string): {
  message: string;
  snippet?: string;
  line?: number;
  column?: number;
  context?: ErrorContext | null;
} {
  let position: number | null = null;
  let line: number | null = null;
  let column: number | null = null;

  const posMatch = errorMsg.match(/position (\d+)/i);
  if (posMatch) {
    position = parseInt(posMatch[1], 10);
  }

  const lineColMatch = errorMsg.match(/line (\d+)\s+column (\d+)/i);
  if (lineColMatch) {
    line = parseInt(lineColMatch[1], 10);
    column = parseInt(lineColMatch[2], 10);
  }

  if (line !== null && column !== null && position === null) {
    const lines = jsonText.split("\n");
    let pos = 0;
    for (let i = 0; i < line - 1; i++) {
      pos += lines[i].length + 1;
    }
    pos += column - 1;
    position = pos;
  }

  if (position !== null && (line === null || column === null)) {
    const lines = jsonText.slice(0, position).split("\n");
    line = lines.length;
    column = lines[lines.length - 1].length + 1;
  }

  let explanation = "Format data JSON tidak valid.";
  const lowerMsg = errorMsg.toLowerCase();
  
  if (lowerMsg.includes("bad escaped character")) {
    explanation = "Terdapat karakter backslash (\\) yang tidak ditulis dengan benar. Di dalam JSON, garis miring terbalik (\\) harus ditulis ganda (\\\\) jika bermaksud menulis karakter backslash biasa. Contoh: ubah \"C:\\materi\" menjadi \"C:\\\\materi\".";
  } else if (lowerMsg.includes("unexpected token }")) {
    explanation = "Terdapat tanda koma (,) berlebih di akhir item sebelum kurung penutup (}). Silakan hapus tanda koma terakhir tersebut.";
  } else if (lowerMsg.includes("unexpected token ]")) {
    explanation = "Terdapat tanda koma (,) berlebih sebelum kurung siku penutup (]). Silakan hapus tanda koma di item terakhir dalam daftar.";
  } else if (lowerMsg.includes("unexpected string")) {
    explanation = "Ada string/teks yang tidak dipisahkan oleh tanda koma (,) atau tanda titik dua (:). Pastikan semua properti dipisahkan tanda koma.";
  } else if (lowerMsg.includes("unexpected end of json input")) {
    explanation = "File JSON terputus di tengah jalan. Pastikan semua kurung pembuka { atau [ memiliki pasangan penutup } atau ] yang lengkap.";
  } else if (lowerMsg.includes("unexpected token")) {
    explanation = "Ada karakter yang tidak dikenali atau salah letak. Pastikan tanda kutip ganda (\"), koma (,), dan tanda kurung seimbang.";
  }

  let snippet = "";
  if (line !== null && column !== null) {
    const allLines = jsonText.split("\n");
    const startLine = Math.max(0, line - 4);
    const endLine = Math.min(allLines.length - 1, line + 3);
    
    const linesToDisplay: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      const lineNum = i + 1;
      const isErrorLine = lineNum === line;
      const prefix = isErrorLine ? "👉 " : "   ";
      linesToDisplay.push(`${prefix}${lineNum.toString().padStart(4, " ")} | ${allLines[i]}`);
      
      if (isErrorLine) {
        const indent = " ".repeat(11);
        const caretIndent = " ".repeat(column);
        linesToDisplay.push(`${indent}${caretIndent}^ (Karakter salah di sekitar kolom ${column})`);
      }
    }
    snippet = linesToDisplay.join("\n");
  }

  const context = position !== null ? findJsonErrorContext(jsonText, position) : null;

  const cleanMessage = `Gagal Membaca File JSON: ${explanation}\n\nLokasi error: Baris ${line}, Kolom ${column}`;
  return {
    message: cleanMessage,
    snippet,
    line: line || undefined,
    column: column || undefined,
    context
  };
}

/** Resolves (creating if needed) the system/author user attributed to assessment sources imported by a bundle. */
async function resolveAuthorUuid(authorEmailInput: string | undefined, dryRun: boolean, log: (msg: string) => void): Promise<string> {
  const importerEmail = "bundle-importer@zyx.internal";
  let authorUuid = "bundle-importer";

  const authorEmail = authorEmailInput || importerEmail;
  const [dbUser] = await db.select().from(userTable).where(eq(userTable.email, authorEmail)).limit(1);

  let isNewUser = false;
  let userRow: any = null;

  if (dbUser) {
    authorUuid = dbUser.id;
    log(`Resolved author to user ID: ${authorUuid}`);
  } else {
    if (authorEmail === importerEmail) {
      isNewUser = true;
      userRow = {
        id: "bundle-importer",
        name: "Bundle Importer",
        email: importerEmail,
        emailVerified: true,
        role: "teacher" as const,
      };
      authorUuid = "bundle-importer";
      log("System user not found. Will create 'bundle-importer'.");
    } else {
      const [systemUser] = await db.select().from(userTable).where(eq(userTable.email, importerEmail)).limit(1);
      if (systemUser) {
        authorUuid = systemUser.id;
      } else {
        isNewUser = true;
        userRow = {
          id: "bundle-importer",
          name: "Bundle Importer",
          email: importerEmail,
          emailVerified: true,
          role: "teacher" as const,
        };
        authorUuid = "bundle-importer";
      }
      log(`Author "${authorEmail}" not found. Falling back to system importer user.`);
    }
  }

  if (isNewUser && userRow && !dryRun) {
    await db.insert(userTable).values(userRow).onConflictDoNothing();
  }

  return authorUuid;
}

export async function importCourseBundleAction(
  bundleJsonText: string,
  options: {
    mode: ImportMode;
    postProcess: boolean;
    dryRun: boolean;
  }
): Promise<ImportResult> {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(`[${new Date().toISOString().split("T")[1].slice(0, 8)}] ${msg}`);
  };

  try {
    // 1. Authorization
    await assertAdmin();
    return {
      success: false,
      error: LEGACY_AUTHORING_RETIRED_MESSAGE,
      friendlyExplanation: "Buat Source Pack dari Upload Manual, lalu review Idea Bundle dan Product Bundle di Review Materi.",
      logs: ["Legacy Learning Bundle importer retired."],
    };

    log("=== BUNDLE IMPORTER STARTED ===");
    log(`Options: Mode=${options.mode}, PostProcess=${options.postProcess}, DryRun=${options.dryRun}`);

    // 2. Parse JSON
    let bundle: any;
    try {
      bundle = JSON.parse(bundleJsonText);
      log("Successfully parsed JSON payload.");
    } catch (err: any) {
      const friendly = getFriendlyJsonError(err.message || String(err), bundleJsonText);
      return {
        success: false,
        error: `Invalid JSON format: ${err.message}`,
        friendlyExplanation: friendly.message,
        jsonSnippet: friendly.snippet,
        errorContext: friendly.context,
        logs
      };
    }

    // 3. Basic Validation
    if (!bundle.metadata || !bundle.metadata.schemaVersion) {
      return {
        success: false,
        error: "Missing bundle metadata or schemaVersion.",
        friendlyExplanation: "Format file bundel tidak dikenali. File yang diunggah tidak memiliki informasi metadata atau versi skema (schemaVersion). Pastikan file tersebut adalah file bundel matakuliah Zyx yang valid.",
        logs
      };
    }
    const ver = bundle.metadata.schemaVersion;
    log(`Detected schema version: ${ver}`);
    if (ver !== "1.0" && ver !== "1.1" && ver !== "1.1.1") {
      return {
        success: false,
        error: `Unsupported schema version "${ver}". Supported: 1.0, 1.1, 1.1.1.`,
        friendlyExplanation: `Versi skema "${ver}" tidak didukung oleh sistem. Versi skema yang didukung saat ini adalah: 1.0, 1.1, atau 1.1.1. Silakan periksa kembali file bundel Anda atau lakukan ekspor ulang menggunakan versi compiler yang sesuai.`,
        logs
      };
    }

    if (!bundle.course || !bundle.course.title || !bundle.course.category) {
      return {
        success: false,
        error: "Course object must specify a title and category.",
        friendlyExplanation: "Informasi matakuliah tidak lengkap. Properti \"course\" dalam file JSON harus mencantumkan nama matakuliah (title) dan kategori (category).",
        logs
      };
    }

    if (!Array.isArray(bundle.course.chapters) || bundle.course.chapters.length === 0) {
      return {
        success: false,
        error: "Course must contain a non-empty chapters array.",
        friendlyExplanation: "Bundel matakuliah ini kosong. Properti \"chapters\" harus berupa daftar (array) bab belajar dan tidak boleh kosong.",
        logs
      };
    }

    if (bundle.course.chapters.length > 1) {
      log(
        `Warning: bundle contains ${bundle.course.chapters.length} chapters. A bundle upload is meant to carry exactly one chapter; importing all of them, but consider splitting future exports into one bundle per chapter.`
      );
    }

    // 4. Setup Author User (used for assessment source attribution only)
    const authorUuid = await resolveAuthorUuid(bundle.author?.email, options.dryRun, log);

    // 5. Import each chapter's learning content (concepts, KOs, website material,
    // flashcards, relationships) through the shared incremental importer.
    let courseUuid = "";
    const chapterDiffs: BundleChapterDiff[] = [];
    const chapterRefToId = new Map<string, string>();
    let totalWm = 0;
    let totalFset = 0;
    let totalFc = 0;
    let totalKr = 0;

    for (const [chIdx, chapter] of bundle.course.chapters.entries()) {
      try {
        const result = await importChapterBundle(bundle, chapter, options.mode, log, options.dryRun);
        courseUuid = result.courseId;
        chapterDiffs.push(result.diff);
        chapterRefToId.set(chapter.$id || chapter.id || `$chapter-${chIdx}`, result.diff.chapterId);
        chapterRefToId.set(chapter.title, result.diff.chapterId);
        totalWm += result.wmCount;
        totalFset += result.fsetCount;
        totalFc += result.fcCount;
        totalKr += result.krCount;
        log(
          `Chapter "${chapter.title}" -> +${result.diff.koAdded} / ~${result.diff.koUpdated} / =${result.diff.koUnchanged} / -${result.diff.koRetired} KOs.` +
            (result.diff.cascadedStaleness ? " Downstream assets marked stale (content changed)." : "")
        );
      } catch (err: any) {
        return { success: false, error: err.message || String(err), logs };
      }
    }

    // 6. Process Assessment Sources (embedded in this combined bundle), against the
    // now-resolved course/chapter IDs, through the shared incremental assessment importer.
    const rootSources = bundle.course["course.assessmentSources"] || bundle.course.assessmentSources || [];
    const chapterSources: any[] = [];
    if (Array.isArray(bundle.course.chapters)) {
      for (const [chIdx, chapter] of bundle.course.chapters.entries()) {
        if (Array.isArray(chapter.assessmentSources)) {
          for (const as of chapter.assessmentSources) {
            if (as) {
              const cloned = { ...as };
              if (!cloned.chapters || cloned.chapters.length === 0) {
                cloned.chapters = [chapter.$id || chapter.id || `$chapter-${chIdx}`];
              }
              chapterSources.push(cloned);
            }
          }
        }
      }
    }

    const combinedSourcesMap = new Map<string, any>();
    for (const as of [...rootSources, ...chapterSources]) {
      if (as && as.title) {
        combinedSourcesMap.set(as.title, as);
      }
    }
    const bundleAssessmentSources = Array.from(combinedSourcesMap.values());

    // Cross-chapter relationships declared at the course level (within-bundle KO refs
    // aren't resolvable here since each chapter import resolves its own KO ids
    // independently; course-level relationships referencing KOs from different
    // chapters in the same bundle are not yet supported by the incremental importer).
    for (const kr of (bundle.course.knowledgeRelationships || [])) {
      log(`Skipped course-level knowledgeRelationship ${kr.sourceKo$ref} -> ${kr.targetKo$ref}: cross-chapter relationships must be declared inside a chapter's own knowledgeRelationships array.`);
    }

    let asResult;
    try {
      asResult = await importAssessmentBundle(
        bundleAssessmentSources,
        courseUuid,
        (ref) => chapterRefToId.get(ref),
        authorUuid,
        options.mode,
        options.postProcess,
        log,
        options.dryRun,
      );
    } catch (err: any) {
      return { success: false, error: err.message || String(err), logs };
    }

    if (options.dryRun) {
      log("Dry run: chapter and assessment content was diffed and rolled back, no database writes were committed.");
      return {
        success: true,
        error: null,
        logs,
        stats: {
          courseId: courseUuid,
          chapterCount: chapterDiffs.length,
          koCount: chapterDiffs.reduce((sum, d) => sum + d.koAdded + d.koUpdated + d.koUnchanged, 0),
          wmCount: totalWm,
          fsetCount: totalFset,
          fcCount: totalFc,
          asCount: asResult.asCount,
          aoCount: asResult.aoCount,
          krCount: totalKr,
          chapterDiffs,
        },
      };
    }

    const stats = {
      courseId: courseUuid,
      chapterCount: chapterDiffs.length,
      koCount: chapterDiffs.reduce((sum, d) => sum + d.koAdded + d.koUpdated + d.koUnchanged, 0),
      wmCount: totalWm,
      fsetCount: totalFset,
      fcCount: totalFc,
      asCount: asResult.asCount,
      aoCount: asResult.aoCount,
      krCount: totalKr,
      chapterDiffs,
    };

    log(`Assessment import completed. Course ID: ${stats.courseId}`);

    // 8. Post-Processing Phase (learning content only; assessment post-processing
    // already ran inside importAssessmentBundle above).
    if (options.postProcess) {
      log("Starting post-processing routines...");

      const materialsList = await db.select().from(websiteMaterials).where(eq(websiteMaterials.courseId, courseUuid));
      for (const row of materialsList) {
        log(`Processing material for Chapter ID: ${row.chapterId} ("${row.title}")`);
        try {
          const compilerResult = compileMarkdown(row.canonicalMarkdown, row.chapterId, courseUuid);
          const errors = compilerResult.diagnostics.filter(d => d.severity === "error");
          if (errors.length > 0) {
            log(`  [FAIL] Compilation failed with ${errors.length} errors:`);
            errors.forEach(e => log(`    - ${e.message}`));
            continue;
          }

          const verification = await verifyKOCoverage(row.chapterId, compilerResult.ast);
          const termIndex = await buildTermIndex(row.chapterId);

          const structuredContent = {
            markdown: row.canonicalMarkdown,
            compilerResult,
            compiledAt: new Date().toISOString(),
            compilerVersion: "2.1.0",
            schemaVersion: "1.0.0",
          };

          await db
            .update(websiteMaterials)
            .set({
              structuredContent,
              coverageStatus: verification.status as any,
              coverageReport: verification.report,
              termIndex,
              status: "published",
              isStale: false,
              updatedAt: new Date(),
            })
            .where(eq(websiteMaterials.id, row.id));

          log(`  [SUCCESS] Material AST and term index saved.`);
        } catch (err: any) {
          log(`  [FAIL] Error compiling material: ${err.message || err}`);
        }
      }

      log("Rebuilding concept graph rollup...");
      try {
        const edgeCount = await buildConceptGraph(courseUuid);
        log(`[SUCCESS] Rebuilt concept graph with ${edgeCount} edges.`);
      } catch (err: any) {
        log(`[FAIL] Error building concept graph: ${err.message || err}`);
      }

      log("Enqueuing KOs to Vector Sync Queue...");
      const activeKOs = await db
        .select()
        .from(knowledgeObjects)
        .where(and(eq(knowledgeObjects.courseId, courseUuid), eq(knowledgeObjects.status, "active")));

      let koQueueCount = 0;
      for (const ko of activeKOs) {
        const textToEmbed = `Title: ${ko.title}\nConcept: ${ko.conceptName}\nContent: ${ko.content}`;
        const syncId = `sync-import-${randomUUID()}`;
        await db.insert(vectorSyncQueue).values({
          id: syncId,
          courseId: courseUuid,
          koId: ko.id,
          action: "upsert" as const,
          namespace: "learning" as const,
          payload: {
            text: textToEmbed,
            metadata: {
              chapterId: ko.chapterId,
              type: ko.type,
              bloomLevel: ko.bloomLevel,
              difficulty: ko.difficulty,
              tags: ko.tags,
            }
          },
          status: "pending" as const,
          attempts: 0,
        }).onConflictDoNothing();
        koQueueCount++;
      }
      log(`[SUCCESS] Enqueued ${koQueueCount} KOs to Vector Sync Queue.`);
      log("(Assessment object concept mapping, vector sync, and profile recalculation already ran inside the assessment import step above.)");
    }

    log("=== BUNDLE IMPORTER COMPLETED SUCCESSFULLY ===");

    revalidatePath("/admin/courses");
    revalidatePath("/courses");
    revalidatePath(`/courses/${courseUuid}`);

    return {
      success: true,
      error: null,
      logs,
      stats,
    };
  } catch (err: any) {
    console.error("Bundle importer crash:", err);
    log(`[CRITICAL CRASH] Importer failed: ${err.message || err}`);
    const errMsg = err.message || String(err);
    let friendly = errMsg;
    let errorContext: ImportResult["errorContext"] = null;

    if (errMsg.includes("UNIQUE constraint failed: courses.title")) {
      friendly = "Gagal menyimpan karena nama mata kuliah ini sudah terdaftar di sistem. Silakan gunakan mode 'Upsert' atau ubah judul mata kuliah di file bundel Anda.";
      errorContext = {
        entityType: "Mata Kuliah",
        propertyName: "title",
      };
    } else if (errMsg.includes("UNIQUE constraint failed: concepts.canonical_slug")) {
      friendly = "Gagal menyimpan karena kode unik konsep (canonicalSlug) sudah terdaftar di database. Silakan pastikan tidak ada kode konsep yang duplikat.";
      errorContext = {
        entityType: "Konsep",
        propertyName: "canonicalSlug",
      };
    } else if (errMsg.includes("UNIQUE constraint failed: chapters.course_id, chapters.title") || errMsg.includes("UNIQUE constraint failed: chapters.title")) {
      friendly = "Gagal menyimpan karena judul bab ini sudah terdaftar dalam mata kuliah tersebut. Silakan ubah judul bab agar tidak ada yang sama.";
      errorContext = {
        entityType: "Bab",
        propertyName: "title",
      };
    } else if (errMsg.includes("UNIQUE constraint failed: knowledge_objects.id")) {
      friendly = "Gagal menyimpan karena ada materi (Knowledge Object) yang memiliki ID duplikat. Pastikan setiap materi memiliki ID unik.";
      errorContext = {
        entityType: "Knowledge Object (Materi)",
        propertyName: "id",
      };
    } else if (errMsg.includes("UNIQUE constraint failed: website_materials.slug")) {
      friendly = "Gagal menyimpan karena materi website memiliki slug URL yang sudah terdaftar. Periksa judul atau slug materi website Anda.";
      errorContext = {
        entityType: "Materi Website",
        propertyName: "slug",
      };
    } else if (errMsg.includes("UNIQUE constraint failed")) {
      friendly = `Gagal menyimpan karena adanya duplikasi data unik di sistem (Unique Constraint): ${errMsg}. Pastikan data seperti kode bab, email user, atau ID materi bersifat unik.`;
    } else if (errMsg.includes("foreign key constraint failed")) {
      friendly = "Gagal menyimpan karena ada relasi data yang tidak valid (Foreign Key Constraint). Ini biasanya terjadi jika Anda mereferensikan ID materi, konsep, atau bab yang tidak ada dalam database.";
      errorContext = {
        entityType: "Relasi Pengetahuan",
      };
    }

    return {
      success: false,
      error: errMsg,
      friendlyExplanation: friendly,
      errorContext,
      logs,
    };
  }
}

export interface AssessmentImportResult {
  success: boolean;
  error: string | null;
  friendlyExplanation?: string | null;
  jsonSnippet?: string | null;
  errorContext?: {
    courseTitle?: string;
    entityType?: "Mata Kuliah" | "Bab" | "Sumber Ujian" | "Butir Soal";
    entityName?: string;
    propertyName?: string;
  } | null;
  logs: string[];
  stats?: {
    courseId: string;
    asCount: number;
    aoCount: number;
    sourceDiffs: AssessmentSourceDiff[];
  };
}

/**
 * Imports an Assessment Bundle: assessmentSources[] (each with chapter refs
 * and assessmentObjects[]) targeting an ALREADY-IMPORTED course. Chapters are
 * referenced by title, since this bundle has no access to the bundle-local
 * chapter $id namespace of the Learning Bundle that created them (see
 * lib/assessment-bundle-importer.ts).
 */
export async function importAssessmentBundleAction(
  bundleJsonText: string,
  options: {
    mode: AssessmentImportMode;
    postProcess: boolean;
    dryRun: boolean;
  }
): Promise<AssessmentImportResult> {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(`[${new Date().toISOString().split("T")[1].slice(0, 8)}] ${msg}`);
  };

  try {
    await assertAdmin();
    return {
      success: false,
      error: LEGACY_AUTHORING_RETIRED_MESSAGE,
      friendlyExplanation: "Gunakan Product Bundle untuk soal berbasis sumber, lalu kelola hasil terbit di Bank Soal.",
      logs: ["Legacy Assessment Bundle importer retired."],
    };

    log("=== ASSESSMENT BUNDLE IMPORTER STARTED ===");
    log(`Options: Mode=${options.mode}, PostProcess=${options.postProcess}, DryRun=${options.dryRun}`);

    let bundle: any;
    try {
      bundle = JSON.parse(bundleJsonText);
      log("Successfully parsed JSON payload.");
    } catch (err: any) {
      const friendly = getFriendlyJsonError(err.message || String(err), bundleJsonText);
      return {
        success: false,
        error: `Invalid JSON format: ${err.message}`,
        friendlyExplanation: friendly.message,
        jsonSnippet: friendly.snippet,
        logs,
      };
    }

    if (!bundle.metadata || !bundle.metadata.schemaVersion) {
      return {
        success: false,
        error: "Missing bundle metadata or schemaVersion.",
        friendlyExplanation: "Format file bundel tidak dikenali. File yang diunggah tidak memiliki informasi metadata atau versi skema (schemaVersion). Pastikan file tersebut adalah file bundel asesmen Zyx yang valid.",
        logs,
      };
    }
    const ver = bundle.metadata.schemaVersion;
    log(`Detected assessment bundle schema version: ${ver}`);
    if (ver !== "1.0") {
      return {
        success: false,
        error: `Unsupported assessment bundle schema version "${ver}". Supported: 1.0.`,
        friendlyExplanation: `Versi skema bundel asesmen "${ver}" tidak didukung. Versi yang didukung saat ini hanya "1.0". Lihat docs/bundle/assessment-bundle-spec.md.`,
        logs,
      };
    }

    const courseTitle = bundle.course?.title;
    if (!courseTitle) {
      return {
        success: false,
        error: "Bundle must specify course.title.",
        friendlyExplanation: "Bundel asesmen harus mencantumkan \"course.title\" yang menunjuk ke mata kuliah yang sudah ada (sudah diimpor melalui Learning Bundle sebelumnya).",
        logs,
      };
    }

    const assessmentSourcesInput = bundle.assessmentSources || bundle.course.assessmentSources || [];
    if (!Array.isArray(assessmentSourcesInput) || assessmentSourcesInput.length === 0) {
      return {
        success: false,
        error: "Bundle must contain a non-empty assessmentSources array.",
        friendlyExplanation: "Bundel asesmen ini kosong. Properti \"assessmentSources\" harus berupa daftar (array) sumber ujian dan tidak boleh kosong.",
        logs,
      };
    }

    let courseId: string;
    let chapterByTitle: Map<string, string>;
    try {
      const resolved = await resolveCourseAndChaptersByTitle(courseTitle);
      courseId = resolved.courseId;
      chapterByTitle = resolved.chapterByTitle;
      log(`Resolved course "${courseTitle}" -> ${courseId}.`);
    } catch (err: any) {
      return {
        success: false,
        error: err.message || String(err),
        friendlyExplanation: `Mata kuliah "${courseTitle}" tidak ditemukan. Impor Learning Bundle untuk mata kuliah ini terlebih dahulu sebelum mengunggah bundel asesmen.`,
        errorContext: { courseTitle, entityType: "Mata Kuliah" },
        logs,
      };
    }

    const authorUuid = await resolveAuthorUuid(bundle.author?.email, options.dryRun, log);

    let result;
    try {
      result = await importAssessmentBundle(
        assessmentSourcesInput,
        courseId,
        (ref) => chapterByTitle.get(ref),
        authorUuid,
        options.mode,
        options.postProcess,
        log,
        options.dryRun,
      );
    } catch (err: any) {
      return { success: false, error: err.message || String(err), logs };
    }

    log(
      options.dryRun
        ? "Dry run: assessment content was diffed and rolled back, no database writes were committed."
        : "=== ASSESSMENT BUNDLE IMPORTER COMPLETED SUCCESSFULLY ===",
    );

    if (!options.dryRun) {
      revalidatePath("/admin/courses");
      revalidatePath(`/courses/${courseId}`);
    }

    return {
      success: true,
      error: null,
      logs,
      stats: {
        courseId: result.courseId,
        asCount: result.asCount,
        aoCount: result.aoCount,
        sourceDiffs: result.sourceDiffs,
      },
    };
  } catch (err: any) {
    console.error("Assessment bundle importer crash:", err);
    log(`[CRITICAL CRASH] Importer failed: ${err.message || err}`);
    return {
      success: false,
      error: err.message || String(err),
      friendlyExplanation: err.message || String(err),
      logs,
    };
  }
}
