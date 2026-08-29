import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { hasPeran } from "@/lib/auth/authorization";
import { searchDocs } from "@/lib/admin-ops-ai/rag-store";
import { getLiveSystemMetrics } from "@/lib/admin-ops-ai/schema-introspection";
import { OPS_AI_TOOLS, executeToolCall } from "@/lib/admin-ops-ai/tools";
import { type OpsAiChatRequest, type OpsAiMessage, type OpsAiDocumentSource } from "@/lib/admin-ops-ai/types";
import { geminiKeyPool } from "@/lib/gemini-keys";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function buildSystemPrompt(
  context: OpsAiChatRequest["context"],
  sources: OpsAiDocumentSource[],
  metrics: Awaited<ReturnType<typeof getLiveSystemMetrics>>
): string {
  const flagsSummary = metrics.featureFlags
    .map((f) => `- ${f.key}: ${f.enabled ? "AKTIF" : "NONAKTIF"} (${f.name})`)
    .join("\n");

  const sourcesText =
    sources.length > 0
      ? sources
          .map(
            (s, idx) =>
              `[Dokumen ${idx + 1}: ${s.title} (${s.filePath} > ${s.section || "Umum"})]\n${s.snippet}`
          )
          .join("\n\n")
      : "Tidak ada potongan dokumen awal.";

  return `Anda adalah Zyx Ops AI, asisten teknis dan operasional untuk panel administrator Zyx Academy.
Tugas Anda adalah membantu administrator memahami fitur sistem, skema basis data, arsitektur, prosedur runbook operasional, dan menjalankan aksi administratif.

ATURAN DAN PEDOMAN:
1. Nama brand adalah Zyx (bukan ZYX).
2. Gaya bahasa: Singkat, lugas, profesional, kalimat dalam sentence-case bahasa Indonesia.
3. JANGAN PERNAH menggunakan em-dash (—) atau en-dash (–). Gunakan koma, titik dua, atau titik.
4. Jangan menambahkan tanda seru berlebih atau kalimat basa-basi.
5. Berikan jawaban berbasis data nyata dan dokumentasi yang disertakan di bawah.

KONTEKS HALAMAN SAAT INI:
- Rute aktif: ${context?.currentPath || "/admin"}
- Query params: ${JSON.stringify(context?.queryParams || {})}
- Entitas aktif: ${JSON.stringify(context?.activeEntity || null)}

SNAPSHOT STATUS SISTEM & METRIK:
- Pengguna terdaftar: ${metrics.usersCount}
- Mata kuliah: ${metrics.coursesCount}
- Bank soal: ${metrics.questionsCount}
- Token aktivasi: ${metrics.tokensCount}
- Pendaftar PKA: ${metrics.pkaRegistrationsCount}
- Feature Flags:
${flagsSummary}

REFERENSI DOKUMENTASI TERKAIT (RAG):
${sourcesText}

ALAT / TOOLS YANG DAPAT DIGUNAKAN:
Jika pertanyaan admin memerlukan pencarian dokumen lebih lanjut, inspeksi skema tabel, pencarian user, pembuatan token aktivasi, atau pengubahan feature flag, Anda dapat memanggil tool dengan format JSON berikut di akhir jawaban Anda:
\`\`\`tool_call
{"tool": "nama_tool", "args": {"arg1": "value1"}}
\`\`\`

Daftar tool:
1. search_admin_docs: {"query": "kata kunci"}
2. introspect_db_schema: {"tableName": "nama_tabel"} (contoh: user, enrollment_tokens, questions, courses, pka_registrations, groups)
3. get_live_system_metrics: {}
4. navigate_admin: {"destination": "nama_fitur"}
5. search_users: {"query": "nama atau email"}
6. propose_create_token: {"courseIds": "kalkulus-1", "capacity": "5", "packageType": "reguler_15"}
7. propose_toggle_flag: {"flagKey": "FEATURE_PKA", "enabled": "true", "reason": "alasan"}

Untuk aksi mutasi (membuat token atau mengubah flag), JANGAN katakan Anda sudah mengubah database secara langsung. Gunakan propose_create_token atau propose_toggle_flag agar admin dapat mengonfirmasi via kartu aksi.`;
}

export async function POST(req: Request) {
  let h: Headers;
  try {
    h = await headers();
  } catch {
    h = req.headers;
  }
  const session = await auth.api.getSession({ headers: h });
  if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: OpsAiChatRequest = await req.json();
    const { messages, context } = body;

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: "Messages array cannot be empty" }, { status: 400 });
    }

    const latestUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const query = latestUserMsg?.content || "";

    // 1. Fetch relevant RAG chunks and live system metrics in parallel
    const [sources, liveMetrics] = await Promise.all([
      query ? searchDocs(query, 3) : Promise.resolve([]),
      getLiveSystemMetrics(),
    ]);

    const systemPrompt = buildSystemPrompt(context, sources, liveMetrics);

    // 2. Format conversation history for Gemini
    const contents = [
      { role: "user" as const, parts: [{ text: systemPrompt }] },
      { role: "model" as const, parts: [{ text: "Dimengerti. Saya siap membantu sebagai Zyx Ops AI." }] },
      ...messages.map((m) => ({
        role: (m.role === "user" ? "user" : "model") as "user" | "model",
        parts: [{ text: m.content }],
      })),
    ];

    // 3. Call Gemini
    const healthyKeys = geminiKeyPool.getHealthyKeys();
    const activeKey = healthyKeys[0] || geminiKeyPool.getKeyByProjectAlias("zyx-main") || geminiKeyPool.getKeyByProjectAlias("default");
    
    if (!activeKey) {
      return NextResponse.json(
        { error: "AI provider keys are currently unconfigured." },
        { status: 503 }
      );
    }

    const client = activeKey.client;
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents,
    });

    let rawText = response.text || "Tidak ada respon dari model.";
    let toolResultData: OpsAiMessage["toolResult"] | undefined;
    let proposalData: OpsAiMessage["proposal"] | undefined;

    // 4. Parse any tool_call in the output
    const toolCallMatch = rawText.match(/```tool_call\s*([\s\S]*?)\s*```/);
    if (toolCallMatch) {
      try {
        const parsed = JSON.parse(toolCallMatch[1]);
        const toolName = parsed.tool;
        const toolArgs = parsed.args || {};

        const execution = await executeToolCall(toolName, toolArgs);
        
        if (execution.proposal) {
          proposalData = execution.proposal;
        }

        toolResultData = {
          toolName,
          summary: execution.summary,
          data: execution.data,
        };

        // Remove the raw tool_call block from visible text
        rawText = rawText.replace(/```tool_call\s*[\s\S]*?\s*```/, "").trim();

        // If it was a read-only tool, let's append a concise summary or execute a follow-up if text is empty
        if (!rawText) {
          rawText = execution.summary;
        }
      } catch (err) {
        console.warn("[OpsAi] Error parsing tool call:", err);
      }
    }

    const replyMessage: OpsAiMessage = {
      id: randomUUID(),
      role: "assistant",
      content: rawText,
      createdAt: Date.now(),
      sources: sources.length > 0 ? sources : undefined,
      proposal: proposalData,
      toolResult: toolResultData,
    };

    return NextResponse.json({
      message: replyMessage,
    });
  } catch (error) {
    console.error("[OpsAi Route Error]:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan internal saat memproses permintaan AI." },
      { status: 500 }
    );
  }
}
