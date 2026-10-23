import { codingHelpRequestSchema } from "@/lib/coding/http-contracts";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { askTutorRagAction, saveTutorMessagesAction } from "@/app/actions/tutor";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { FREE_ALLOWANCE_IDEMPOTENCY_PREFIX } from "@/lib/usage-budget-service";
import { sanitizeAnswer } from "@/lib/tutor/answer-sanitizer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function publicZyraError(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
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
      codingContext = null,
    } = body;

    const coding = codingContext === null ? null : codingHelpRequestSchema.safeParse(codingContext);
    if (coding && !coding.success) return Response.json({ error: "Konteks coding tidak valid." }, { status: 400 });

    const normalizedCourseId = typeof courseId === "string" ? courseId.trim() : "";
    const normalizedQuestion = typeof question === "string" ? question.trim() : "";
    const normalizedConceptId = typeof conceptId === "string" ? conceptId : null;
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
      return new Response(JSON.stringify({ error: "Mata kuliah tidak valid." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(attachmentIds) || !attachmentIds.every((id): id is string => typeof id === "string")) {
      return new Response(JSON.stringify({ error: "Lampiran tidak valid." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!normalizedQuestion && attachmentIds.length === 0 && !sanitizedSelectionContext?.snippet) {
      return new Response(JSON.stringify({ error: "Pertanyaan atau lampiran tidak boleh kosong." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const access = await resolveCourseAccess({ courseId: normalizedCourseId, userId });
    // The central resolver validates course identity, active status, and the
    // actor's canonical role/assignment. A session role must never bypass it.
    if (!access.hasCourseAccess) {
      return new Response(JSON.stringify({ error: "Akses Zyra untuk mata kuliah ini belum tersedia." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (access?.tier === "free" && attachmentIds.length > 0) {
      return new Response(JSON.stringify({ error: "Paket Free hanya mendukung pertanyaan teks." }), {
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
              label: "Menelusuri materi kuliah & kurikulum...",
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
            coding?.success ? coding.data : undefined,
          );

          if (req.signal.aborted) {
            controller.close();
            return;
          }

          // Complete search step
          sendEvent({
            type: "data-work-step",
            data: {
              stepId: "step-search",
              label: "Materi & konteks pembelajaran siap",
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
            fullAnswer = "Zyra tidak dapat menjawab pertanyaan baru hari ini (batas harian tercapai). Silakan coba lagi besok, atau gunakan buku teks dan kartu hafalan untuk belajar mandiri.";
          } else if (res.failureCode === "provider_unavailable") {
            fullAnswer = attachmentIds.length > 0
              ? normalizedQuestion
                ? "Gambar dan pertanyaanmu sudah diterima, tetapi layanan AI sedang mengalami kendala sementara. Silakan coba kirim ulang beberapa saat lagi."
                : "Gambarmu sudah diterima, tetapi layanan AI sedang mengalami kendala sementara. Silakan coba kirim ulang beberapa saat lagi."
              : "Pertanyaanmu sudah diterima, tetapi layanan AI sedang mengalami kendala sementara. Silakan coba kirim ulang beberapa saat lagi.";
          } else if (!res.answer) {
            fullAnswer = "Maaf, terjadi gangguan saat memproses jawaban. Silakan coba lagi dalam beberapa saat.";
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

          if (coding?.success && res.sessionId && res.answer && !res.failureCode && !res.budgetExhausted && !req.signal.aborted) {
            try {
              await saveTutorMessagesAction(normalizedCourseId, [
                { role: "student", content: normalizedQuestion },
                { role: "ai", content: fullAnswer, sources: res.sources, canvasSpec: res.canvasSpec },
              ], res.sessionId);
            } catch { /* A history failure must not discard a completed explanation. */ }
          }

          // 5. Complete stream
          sendEvent("[DONE]");
          controller.close();
        } catch (err: unknown) {
          const errMsg = publicZyraError(err);
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
    return new Response(JSON.stringify({ error: "Terjadi kesalahan internal." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
