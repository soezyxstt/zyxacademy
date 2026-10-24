import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { askTutorRagAction } from "@/app/actions/tutor";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { FREE_ALLOWANCE_IDEMPOTENCY_PREFIX } from "@/lib/usage-budget-service";
import { sanitizeAnswer } from "@/lib/tutor/answer-sanitizer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function publicZyraError(error: unknown, language: "id" | "en" = "id"): string {
  const code = error instanceof Error ? error.message : "";
  if (language === "en") {
    if (code === "NOT_ENROLLED" || code === "COURSE_SCOPE_REQUIRED") return "Zyra access for this course is not available yet.";
    if (code === "UPGRADE_REQUIRED") return "Activate your class to use this feature.";
    if (code === "FREE_TEXT_ONLY") return "The Free plan supports one text question per day.";
    if (code === "QUESTION_REQUIRED") return "Enter a question.";
    if (code === "IMAGE_INPUT_DISABLED") return "Zyra image input is unavailable right now.";
    if (code.includes("DAILY_QUOTA_EXCEEDED") || code.includes("TOTAL_INTERACTION_LIMIT")) return "You have reached today's Zyra question limit. Try again tomorrow.";
    return "There was a problem processing your question.";
  }
  if (code === "NOT_ENROLLED" || code === "COURSE_SCOPE_REQUIRED") {
    return "Akses Zyra untuk mata kuliah ini belum tersedia.";
  }
  if (code === "UPGRADE_REQUIRED") {
    return "Fitur ini tersedia setelah aktivasi kelas.";
  }
  if (code === "FREE_TEXT_ONLY") {
    return "Paket Free hanya mendukung satu pertanyaan teks per hari.";
  }
  if (code === "QUESTION_REQUIRED") {
    return "Pertanyaan tidak boleh kosong.";
  }
  if (code === "IMAGE_INPUT_DISABLED") {
    return "Input gambar Zyra sedang tidak tersedia.";
  }
  if (code.includes("DAILY_QUOTA_EXCEEDED") || code.includes("TOTAL_INTERACTION_LIMIT")) {
    return "Batas pertanyaan Zyra hari ini sudah tercapai. Coba lagi besok.";
  }
  return "Terjadi kendala saat memproses pertanyaan.";
}

function requestKey(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,96}$/.test(value)
    ? value
    : randomUUID();
}

/**
 * Handles streaming chat interactions with Zyra tutor assistant.
 * Enforces course access, daily allowances, and streams server-sent events.
 */
export async function POST(req: Request) {
  let requestLanguage: "id" | "en" = "id";
  let h: Headers;
  try {
    h = await headers();
  } catch {
    h = req.headers;
  }

  const session = await auth.api.getSession({ headers: h });
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userId = session.user.id;

  try {
    const body = await req.json();
    const {
      courseId,
      conceptId = null,
      question,
      sessionId = null,
      attachmentIds = [],
      pathname,
      requestId,
      selectionContext = null,
      responseLanguage,
    } = body;

    const normalizedCourseId = typeof courseId === "string" ? courseId.trim() : "";
    const normalizedQuestion = typeof question === "string" ? question.trim() : "";
    const normalizedConceptId = typeof conceptId === "string" ? conceptId : null;
    const normalizedResponseLanguage = responseLanguage === "en" || responseLanguage === "id" ? responseLanguage : undefined;
    requestLanguage = normalizedResponseLanguage ?? "id";
    const normalizedSessionId = typeof sessionId === "string" ? sessionId : null;
    const normalizedPathname = typeof pathname === "string" ? pathname : null;
    const sanitizedSelectionContext = selectionContext && typeof selectionContext === "object"
      ? {
          snippet: typeof selectionContext.snippet === "string" ? selectionContext.snippet.trim().slice(0, 1200) : undefined,
          blockType: typeof selectionContext.blockType === "string" ? selectionContext.blockType : undefined,
          surroundingText: typeof selectionContext.surroundingText === "string" ? selectionContext.surroundingText.trim().slice(0, 2000) : undefined,
          sectionTitle: typeof selectionContext.sectionTitle === "string" ? selectionContext.sectionTitle.trim().slice(0, 200) : undefined,
          chapterTitle: typeof selectionContext.chapterTitle === "string" ? selectionContext.chapterTitle.trim().slice(0, 200) : undefined,
          intent: typeof selectionContext.intent === "string" ? selectionContext.intent : undefined,
        }
      : null;
    if (!normalizedCourseId) {
      return new Response(JSON.stringify({ error: requestLanguage === "en" ? "Invalid course." : "Mata kuliah tidak valid." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(attachmentIds) || !attachmentIds.every((id): id is string => typeof id === "string")) {
      return new Response(JSON.stringify({ error: requestLanguage === "en" ? "Invalid attachment." : "Lampiran tidak valid." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!normalizedQuestion && attachmentIds.length === 0 && !sanitizedSelectionContext?.snippet) {
      return new Response(JSON.stringify({ error: requestLanguage === "en" ? "Enter a question or attach an image." : "Pertanyaan atau lampiran tidak boleh kosong." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const access = await resolveCourseAccess({ courseId: normalizedCourseId, userId });
    // The central resolver validates course identity, active status, and the
    // actor's canonical role/assignment. A session role must never bypass it.
    if (!access.hasCourseAccess) {
      return new Response(JSON.stringify({ error: requestLanguage === "en" ? "Zyra access for this course is not available yet." : "Akses Zyra untuk mata kuliah ini belum tersedia." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (access?.tier === "free" && attachmentIds.length > 0) {
      return new Response(JSON.stringify({ error: requestLanguage === "en" ? "The Free plan supports text questions only." : "Paket Free hanya mendukung pertanyaan teks." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const idempotencyKey = access?.tier === "free"
      ? `${FREE_ALLOWANCE_IDEMPOTENCY_PREFIX}${requestKey(requestId).replace(/^zyra-free:/, "")}`
      : `zyra:${requestKey(requestId).replace(/^zyra:/, "")}`;

    // Set up Server-Sent Events stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: Record<string, unknown> | string) => {
          if (typeof data === "string") {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          } else {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          }
        };

        try {
          // 1. Initial work-step: Searching relevant course materials
          sendEvent({
            type: "data-work-step",
            data: {
              stepId: "step-search",
              label: requestLanguage === "en" ? "Searching course material..." : "Menelusuri materi kuliah dan kurikulum...",
              status: "running",
            },
          });

          if (req.signal.aborted) {
            controller.close();
            return;
          }

          // 2. Call askTutorRagAction
          const res = await askTutorRagAction(
            normalizedCourseId,
            normalizedConceptId,
            normalizedQuestion || (sanitizedSelectionContext?.snippet ? `Jelaskan kutipan: "${sanitizedSelectionContext.snippet}"` : "Tolong jelaskan materi sesuai konteks."),
            normalizedSessionId,
            attachmentIds,
            normalizedPathname,
            idempotencyKey,
            sanitizedSelectionContext,
            normalizedResponseLanguage,
          );

          if (req.signal.aborted) {
            controller.close();
            return;
          }

          sendEvent({
            type: "data-response-language",
            responseLanguage: res.responseLanguage,
          });

          // Complete search step
          sendEvent({
            type: "data-work-step",
            data: {
              stepId: "step-search",
              label: res.responseLanguage === "en" ? "Course material is ready" : "Materi dan konteks pembelajaran siap",
              status: "completed",
            },
          });

          // Session ID sync
          if (res.sessionId) {
            sendEvent({
              type: "data-session",
              sessionId: res.sessionId,
            });
          }

          // Determine answer content
          let fullAnswer = "";
          if (res.budgetExhausted) {
            fullAnswer = res.responseLanguage === "en"
              ? "Zyra can't answer another question today because you've reached the daily limit. Try again tomorrow, or study with your textbook and flashcards."
              : "Zyra tidak dapat menjawab pertanyaan baru hari ini karena batas harian tercapai. Coba lagi besok, atau gunakan buku teks dan kartu hafalan untuk belajar mandiri.";
          } else if (res.failureCode === "provider_unavailable") {
            fullAnswer = attachmentIds.length > 0
              ? normalizedQuestion
                ? res.responseLanguage === "en" ? "Your image and question were received, but the AI service is temporarily unavailable. Please try again shortly." : "Gambar dan pertanyaanmu sudah diterima, tetapi layanan AI sedang mengalami kendala sementara. Coba kirim ulang beberapa saat lagi."
                : res.responseLanguage === "en" ? "Your image was received, but the AI service is temporarily unavailable. Please try again shortly." : "Gambarmu sudah diterima, tetapi layanan AI sedang mengalami kendala sementara. Coba kirim ulang beberapa saat lagi."
              : res.responseLanguage === "en" ? "Your question was received, but the AI service is temporarily unavailable. Please try again shortly." : "Pertanyaanmu sudah diterima, tetapi layanan AI sedang mengalami kendala sementara. Coba kirim ulang beberapa saat lagi.";
          } else if (!res.answer) {
            fullAnswer = res.responseLanguage === "en" ? "Sorry, something went wrong while preparing the answer. Please try again shortly." : "Maaf, terjadi gangguan saat memproses jawaban. Coba lagi dalam beberapa saat.";
          } else {
            fullAnswer = sanitizeAnswer(res.answer, res.sources);
          }

          // 3. Progressive stream of text-delta chunks for smooth typing effect
          // Chunk by tokens/words with a tiny interval
          const words = fullAnswer.split(/(\s+)/);
          const chunkSize = 3;
          for (let i = 0; i < words.length; i += chunkSize) {
            if (req.signal.aborted) break;
            const chunk = words.slice(i, i + chunkSize).join("");
            sendEvent({
              type: "text-delta",
              textDelta: chunk,
            });
            // 15ms pace for fluid typing feel
            if (words.length > 10) {
              await new Promise((r) => setTimeout(r, 15));
            }
          }

          // 4. Send metadata: Sources & Learning Canvas
          if (res.sources && res.sources.length > 0) {
            sendEvent({
              type: "data-sources",
              sources: res.sources,
            });
          }

          if (res.canvasSpec) {
            sendEvent({
              type: "data-canvas",
              canvasSpec: res.canvasSpec,
            });
          }

          // 5. Complete stream
          sendEvent("[DONE]");
          controller.close();
        } catch (err: unknown) {
          const errMsg = publicZyraError(err, requestLanguage);
          sendEvent({
            type: "data-error",
            data: { message: errMsg },
          });
          sendEvent("[DONE]");
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[Zyra Chat Route Error]:", error);
    return new Response(JSON.stringify({ error: requestLanguage === "en" ? "An internal error occurred." : "Terjadi kesalahan internal." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
