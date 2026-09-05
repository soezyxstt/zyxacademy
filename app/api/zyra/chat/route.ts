import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { askTutorRagAction } from "@/app/actions/tutor";
import { isEnrolled } from "@/lib/course-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const userRole = (session.user as { role?: string | null }).role;

  try {
    const body = await req.json();
    const {
      courseId,
      conceptId = null,
      question,
      sessionId,
      attachmentIds = [],
      pathname,
    } = body;

    if (!question && (!attachmentIds || attachmentIds.length === 0)) {
      return new Response(JSON.stringify({ error: "Pertanyaan atau lampiran tidak boleh kosong." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (userRole !== "admin") {
      if (courseId && courseId !== "unknown") {
        const enrolled = await isEnrolled(userId, courseId);
        if (!enrolled) {
          return new Response(JSON.stringify({ error: "Anda belum terdaftar pada mata kuliah ini." }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
    }

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
            courseId ?? "unknown",
            conceptId,
            question || "Tolong jelaskan materi sesuai konteks.",
            sessionId,
            attachmentIds,
            pathname,
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
            fullAnswer = "Gambar dan pertanyaanmu sudah diterima, tetapi layanan AI sedang mengalami kendala sementara. Silakan coba kirim ulang beberapa saat lagi.";
          } else if (!res.answer) {
            fullAnswer = "Maaf, terjadi gangguan saat memproses jawaban. Silakan coba lagi dalam beberapa saat.";
          } else {
            fullAnswer = res.answer;
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
          const errMsg = err instanceof Error ? err.message : "Terjadi kendala internal.";
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
