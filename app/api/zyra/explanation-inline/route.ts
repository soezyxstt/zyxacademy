import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { ZyxLanguageModel } from "@/lib/admin-ops-ai/zyx-language-model-adapter";
import {
  buildInlineExplanationSystemPrompt,
  createRenderHelperUiTool,
  deriveInlineUiFromMessages,
  inlineExplanationRequestSchema,
  RENDER_HELPER_UI_TOOL_NAME,
} from "@/lib/zyra/inline-explanation";

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
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Format permintaan tidak valid." }, { status: 400 });
  }

  const parsed = inlineExplanationRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Payload penjelasan inline tidak valid.",
        issues: parsed.error.issues.slice(0, 5),
      },
      { status: 400 }
    );
  }

  const { messages, context } = parsed.data;

  const access = await resolveCourseAccess({
    courseId: context.courseId,
    userId,
  });
  if (!access.hasCourseAccess) {
    return Response.json(
      { error: "Akses Zyra untuk mata kuliah ini belum tersedia." },
      { status: 403 }
    );
  }

  try {
    const uiMessages = messages.map((msg, idx) => ({
      id: msg.id || `msg-${idx}`,
      role: msg.role,
      parts:
        Array.isArray(msg.parts) && msg.parts.length > 0
          ? msg.parts
          : msg.content
            ? [{ type: "text" as const, text: msg.content }]
            : [],
    })) as UIMessage[];

    const derivedUi = deriveInlineUiFromMessages(uiMessages);
    const systemPrompt = buildInlineExplanationSystemPrompt(context, derivedUi.spec);

    const modelMessages = await convertToModelMessages(uiMessages, {
      ignoreIncompleteToolCalls: true,
    });

    const model = new ZyxLanguageModel({
      actorId: userId,
      feature: "zyra",
    });

    const forceVisualToolOnFirstStep =
      context.intent === "visualize" && uiMessages.length === 1;

    const result = streamText({
      model,
      system: systemPrompt,
      messages: modelMessages,
      tools: {
        [RENDER_HELPER_UI_TOOL_NAME]: createRenderHelperUiTool(),
      },
      prepareStep: forceVisualToolOnFirstStep
        ? ({ stepNumber }) =>
            stepNumber === 0
              ? { toolChoice: { type: "tool", toolName: RENDER_HELPER_UI_TOOL_NAME } }
              : { toolChoice: "auto" }
        : undefined,
      stopWhen: stepCountIs(3),
      abortSignal: req.signal,
      maxRetries: 0,
    });

    return result.toUIMessageStreamResponse({
      originalMessages: uiMessages,
    });
  } catch (error) {
    console.error("[Zyra Inline Explanation Route Error]:", error);
    return Response.json(
      { error: "Terjadi kendala saat menyiapkan penjelasan Zyra." },
      { status: 500 }
    );
  }
}
