import { zyraLiveProgress, zyraLiveTextStream } from "@/lib/zyra/live-progress";
import { JsonFieldStreamExtractor } from "@/lib/zyra/json-field-stream";
import { followupEvent, parseFollowupAnswer } from "@/lib/zyra/followups";
import { codingHelpRequestSchema } from "@/lib/coding/http-contracts";
import { after } from "next/server";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { askTutorRagAction, saveTutorMessagesAction } from "@/app/actions/tutor";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { FREE_ALLOWANCE_IDEMPOTENCY_PREFIX } from "@/lib/usage-budget-service";
import { sanitizeAnswer } from "@/lib/tutor/answer-sanitizer";
import { pythonHistoryReply } from "@/lib/coding/python-reply";
import { generateZyraSessionTitle } from "@/lib/zyra/title-ai";

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
      codingContext = null,
      responseLanguage,
    } = body;

    const coding = codingContext === null ? null : codingHelpRequestSchema.safeParse(codingContext);
    if (coding && !coding.success) return Response.json({ error: "Konteks coding tidak valid." }, { status: 400 });

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
          // 1. Initial work-step: Reading relevant course materials
          sendEvent({
            type: "data-work-step",
            data: {
              stepId: "step-search",
              label: requestLanguage === "en" ? "Reading course material..." : "Membaca materi kuliah...",
              status: "running",
            },
          });

          if (req.signal.aborted) {
            controller.close();
            return;
          }

          // 2. Call askTutorRagAction with live progress & real-time text streaming
          let lastStage = "";
          const labels = requestLanguage === "en"
            ? { dispatch: "Thinking...", receiving: "Preparing response...", checking: "Refining answer..." }
            : { dispatch: "Sedang berpikir...", receiving: "Menyiapkan jawaban...", checking: "Merapikan jawaban..." };
          const extractor = new JsonFieldStreamExtractor(["learnerFacingText", "answer"], (textDelta) => {
            if (!req.signal.aborted && textDelta) {
              sendEvent({ type: "text-delta", textDelta });
            }
          });
          const res = await zyraLiveProgress.run(stage => {
            if (req.signal.aborted || stage === lastStage) return;
            lastStage = stage;
            sendEvent({ type: "data-work-step", data: { stepId: "provider", status: "running", label: labels[stage] } });
          }, () => zyraLiveTextStream.run((rawChunk) => {
            if (!req.signal.aborted) extractor.push(rawChunk);
          }, () => askTutorRagAction(
            normalizedCourseId,
            normalizedConceptId,
            normalizedQuestion || (sanitizedSelectionContext?.snippet ? `Jelaskan kutipan: "${sanitizedSelectionContext.snippet}"` : "Tolong jelaskan materi sesuai konteks."),
            normalizedSessionId,
            attachmentIds,
            normalizedPathname,
            idempotencyKey,
            sanitizedSelectionContext,
            coding?.success ? coding.data : undefined,
            normalizedResponseLanguage,
          )));

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
              label: res.responseLanguage === "en" ? "Ready" : "Siap",
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
                ? res.responseLanguage === "en" ? "Your image and question were received, but Zyra is temporarily unavailable. Please try again shortly." : "Gambar dan pertanyaanmu sudah diterima, tetapi Zyra sedang mengalami kendala sementara. Coba kirim ulang beberapa saat lagi."
                : res.responseLanguage === "en" ? "Your image was received, but Zyra is temporarily unavailable. Please try again shortly." : "Gambarmu sudah diterima, tetapi Zyra sedang mengalami kendala sementara. Coba kirim ulang beberapa saat lagi."
              : res.responseLanguage === "en" ? "Your question was received, but Zyra is temporarily unavailable. Please try again shortly." : "Pertanyaanmu sudah diterima, tetapi Zyra sedang mengalami kendala sementara. Coba kirim ulang beberapa saat lagi.";
          } else if (!res.answer) {
            fullAnswer = res.responseLanguage === "en" ? "Sorry, something went wrong while preparing the answer. Please try again shortly." : "Maaf, terjadi gangguan saat memproses jawaban. Coba lagi dalam beberapa saat.";
          } else {
            fullAnswer = sanitizeAnswer(parseFollowupAnswer(res.answer).text, res.sources);
          }

          if (extractor.hasEmitted) {
            if (extractor.emittedText !== fullAnswer) {
              sendEvent({ type: "text-replace", text: fullAnswer });
            }
          } else if (fullAnswer) {
            sendEvent({ type: "text-delta", textDelta: fullAnswer });
          }

          const followups = followupEvent(res.followups);
          if (followups && !req.signal.aborted && !res.failureCode && !res.budgetExhausted) sendEvent(followups);

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
            const historyAnswer = coding.data.kind === "playground" && coding.data.intent === "generate"
              ? pythonHistoryReply(fullAnswer, res.responseLanguage)
              : fullAnswer;
            try {
              await saveTutorMessagesAction(normalizedCourseId, [
                { role: "student", content: normalizedQuestion, attachmentIds },
                { role: "ai", content: historyAnswer, sources: res.sources, canvasSpec: res.canvasSpec },
              ], res.sessionId, idempotencyKey);
              sendEvent({ type: "data-history", saved: true });
            } catch {
              sendEvent({ type: "data-history", saved: false, message: res.responseLanguage === "en"
                ? "This answer could not be saved. Copy anything you need before closing this conversation."
                : "Jawaban ini belum tersimpan. Salin bagian yang diperlukan sebelum menutup percakapan." });
            }
          }

          if (res.sessionId && normalizedQuestion && !res.failureCode && !res.budgetExhausted && !req.signal.aborted) {
            const titleTask = generateZyraSessionTitle({
              sessionId: res.sessionId,
              studentId: userId,
              courseId: normalizedCourseId,
              question: normalizedQuestion,
            }).catch(() => ({ updated: false as const }));
            try {
              after(() => titleTask.then(() => undefined));
            } catch {
              // Unit tests outside Next request scope do not provide an after() context.
            }
            let titleTimeout: ReturnType<typeof setTimeout> | undefined;
            const quickTitle = await Promise.race([
              titleTask,
              new Promise<null>((resolve) => {
                titleTimeout = setTimeout(() => resolve(null), 2500);
              }),
            ]).finally(() => {
              if (titleTimeout !== undefined) clearTimeout(titleTimeout);
            });
            if (quickTitle?.updated && quickTitle.title && !req.signal.aborted) {
              sendEvent({
                type: "data-session-title",
                sessionId: res.sessionId,
                title: quickTitle.title,
              });
            }
          }

          // 5. Complete stream
          if (!req.signal.aborted) {
            sendEvent("[DONE]");
            controller.close();
          }
        } catch (err: unknown) {
          if (!req.signal.aborted) {
            try {
              const errMsg = publicZyraError(err, requestLanguage);
              sendEvent({
                type: "data-error",
                data: { message: errMsg },
              });
              sendEvent("[DONE]");
              controller.close();
            } catch {
              // Stream controller already closed or aborted.
            }
          }
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
