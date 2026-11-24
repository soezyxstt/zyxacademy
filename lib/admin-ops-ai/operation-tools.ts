import { createHash, randomUUID } from "node:crypto";
import { tool, type Tool } from "ai";
import { z } from "zod";
import { readMcpChapterChoice, readMcpCourseChoice, readMcpRunToken, readMcpSourceFileKey } from "@/lib/authoring/mcp-workflows";
import { AdminMcpError } from "@/lib/admin-mcp/mutations";
import { mcpEnvironmentIdentity } from "@/lib/authoring/mcp-environment";
import { hasChatOperationGrant, invokeApprovedOperation, readApprovedOperation, type OpsOperationPlan } from "./operation-approvals";
import { opsGrantTarget } from "./operation-policy";
import { proposalStore } from "./proposal-store";
import { browserOperations, type OpsBrowserChat } from "./registered-operations";
import { listOpsAiSkillsSummary, loadOpsAiSkillMarkdown } from "./skills";
import { getOpsAiSkillMeta } from "./skills-catalog";

const maxModelChars = 16000;

const BROWSER_MANAGED_MCP_CONTROL_KEYS = new Set([
  "dryRun",
  "expectedEnvironment",
  "expectedOrigin",
  "requestKey",
  "confirmationToken",
]);

function stripBrowserManagedControlKeys(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }
  const entries = Object.entries(raw as Record<string, unknown>).filter(
    ([key]) => !BROWSER_MANAGED_MCP_CONTROL_KEYS.has(key),
  );
  return Object.fromEntries(entries);
}

function authoringTargets(input: Record<string, unknown>) {
  const target: Record<string, unknown> = {};
  if (typeof input.courseKey === "string") Object.assign(target, readMcpCourseChoice(input.courseKey));
  if (typeof input.chapterKey === "string") Object.assign(target, readMcpChapterChoice(input.chapterKey));
  if (typeof input.runToken === "string") {
    const { runId, courseId, chapterId, sourcePackId } = readMcpRunToken(input.runToken);
    Object.assign(target, { runId, courseId, chapterId, sourcePackId });
  }
  if (typeof input.fileKey === "string") {
    const { materialId, courseId, chapterId } = readMcpSourceFileKey(input.fileKey);
    Object.assign(target, { materialId, courseId, chapterId });
  }
  return target;
}

export function createBrowserOperationTools(chat: OpsBrowserChat, runId: string, allowWrites: boolean): Record<string, Tool> {
  const registry = browserOperations(chat);
  return {
    read_admin_approval_result: tool({
      description: "Baca hasil aksi yang sebelumnya disetujui dalam chat ini, termasuk ID job atau token alur kerja. Gunakan ID proposal dari kartu persetujuan.",
      inputSchema: z.object({ proposalId: z.string().regex(/^prop-[a-f0-9-]{36}$/) }),
      execute: async ({ proposalId }) => {
        const result = await readApprovedOperation(chat, proposalId);
        if (!result) return { summary: "Hasil persetujuan tidak tersedia." };
        if (JSON.stringify(result).length > maxModelChars * 4) {
          return { operation: result.operation, status: result.status, summary: "Hasil terlalu besar. Gunakan tool baca yang sesuai dengan target." };
        }
        return result;
      },
    }),
    load_admin_skill: tool({
      description: "Muat panduan skill operasional atau authoring Zyx sesuai kebutuhan (misalnya formulir, blog, media, authoring, atau pemulihan operasi). Panggil tanpa skillId untuk melihat daftar 12 skill yang tersedia.",
      inputSchema: z.object({
        skillId: z.string().trim().max(100).optional(),
        query: z.string().trim().max(200).optional(),
      }),
      execute: async ({ skillId, query }) => {
        const requestedId = skillId?.trim();
        if (requestedId) {
          const meta = getOpsAiSkillMeta(requestedId);
          if (meta) {
            const guide = await loadOpsAiSkillMarkdown(meta.id);
            if (guide) {
              return {
                skillId: meta.id,
                label: meta.label,
                category: meta.category,
                guide,
              };
            }
          }
        }

        const search = (query ?? requestedId ?? "").trim().toLowerCase();
        const allSkills = listOpsAiSkillsSummary();
        if (search) {
          const matched = allSkills.filter(
            (skill) =>
              skill.skillId.toLowerCase().includes(search) ||
              skill.label.toLowerCase().includes(search) ||
              skill.shortDescription.toLowerCase().includes(search) ||
              skill.category.toLowerCase().includes(search),
          );
          if (matched.length === 1) {
            const single = matched[0];
            const guide = await loadOpsAiSkillMarkdown(single.skillId);
            if (guide) {
              return {
                skillId: single.skillId,
                label: single.label,
                category: single.category,
                guide,
              };
            }
          }
          if (matched.length > 0) {
            return {
              summary: "Ditemukan beberapa skill yang cocok. Panggil load_admin_skill dengan skillId yang tepat.",
              skills: matched,
            };
          }
        }

        return {
          summary: "Daftar 12 skill Zyx tersedia. Panggil load_admin_skill dengan skillId yang sesuai.",
          skills: allSkills,
        };
      },
    }),
    discover_admin_operations: tool({
      description: "Temukan operasi admin aktif. Gunakan nama domain untuk daftar, atau nama operasi lengkap untuk skema argumen JSON.",
      inputSchema: z.object({ query: z.string().trim().max(200).default("") }),
      execute: async ({ query }) => {
        const visible = [...registry].filter(([, entry]) => allowWrites || entry.policy === "read");
        const exact = visible.find(([name]) => name === query);
        if (exact) {
          const [name, entry] = exact;
          return { name, description: entry.description, approval: entry.policy, inputSchema: z.toJSONSchema(entry.input, { io: "input", unrepresentable: "any" }) };
        }
        const normalizedDomainQuery = query.replace(/\.+$/, "");
        return {
          domains: [...new Set(visible.map(([name]) => name.split(".")[0]))].sort(),
          operations: normalizedDomainQuery ? visible.filter(([name]) => name.startsWith(normalizedDomainQuery + ".")).map(([name, entry]) => ({ name, approval: entry.policy })) : [],
        };
      },
    }),
    use_admin_operation: tool({
      description: "Jalankan operasi baca atau siapkan aksi admin untuk persetujuan. Gunakan nama dan skema dari discover_admin_operations. Hanya kirim argumen bisnis sebagai objek JSON.",
      inputSchema: z.object({ operation: z.string().max(200), argumentsJson: z.string().max(1_000_000) }),
      execute: async ({ operation, argumentsJson }, options) => {
        const entry = registry.get(operation);
        if (!entry || (!allowWrites && entry.policy !== "read")) return { summary: "Operasi tidak tersedia di chat ini." };

        let raw: unknown;
        try { raw = argumentsJson.trim() ? JSON.parse(argumentsJson) : {}; } catch { return { summary: "Argumen harus berupa objek JSON yang valid." }; }
        const sanitizedRaw = stripBrowserManagedControlKeys(raw);
        const parsed = entry.input.safeParse(sanitizedRaw);
        if (!parsed.success) {
          const fieldErrors = parsed.error.issues.map((issue) => {
            const path = issue.path.join(".") || "(root)";
            const unrecognizedKeys =
              issue.code === "unrecognized_keys" && Array.isArray((issue as { keys?: unknown }).keys)
                ? (issue as { keys: string[] }).keys
                : undefined;
            return {
              path,
              code: issue.code,
              message: issue.message,
              ...(unrecognizedKeys ? { unrecognizedKeys } : {}),
            };
          });
          const previewErrors = fieldErrors
            .slice(0, 2)
            .map((err) => `${err.path} (${err.message})`)
            .join("; ");
          return {
            summary: `Argumen tidak valid: ${previewErrors}. Perbaiki argumen lalu panggil ulang use_admin_operation.`,
            issues: fieldErrors.map((err) => err.path),
            fieldErrors,
            inputSchema: z.toJSONSchema(entry.input, { io: "input", unrepresentable: "any" }),
          };
        }
        const input = parsed.data;
        const { environment, origin } = mcpEnvironmentIdentity();
        const target = entry.expectsTarget ? { expectedEnvironment: environment, expectedOrigin: origin } : {};
        if (entry.policy === "read") {
          const response = await entry.invoke({ ...input, ...target });
          if (JSON.stringify(response.structuredContent ?? {}).length > maxModelChars * 4) {
            return { summary: "Hasil terlalu besar. Perkecil halaman atau sempitkan target." };
          }
          return { summary: response.isError ? "Operasi baca gagal." : "Data tersedia.", data: response.structuredContent };
        }

        const requestKey = `ops-${randomUUID()}`;
        let confirmationToken: string | undefined;
        let impact: unknown;
        if (entry.protocol === "plan") {
          const response = await entry.invoke({ ...input, ...target, dryRun: true, requestKey });
          const data = response.structuredContent?.data as { confirmationToken?: unknown; impact?: unknown } | undefined;
          if (response.isError || typeof data?.confirmationToken !== "string") {
            return { summary: "Aksi belum dapat disiapkan.", data: response.structuredContent };
          }
          confirmationToken = data.confirmationToken;
          impact = data.impact;
        }
        const grantTarget = entry.protocol === "plan" ? opsGrantTarget(operation, input, impact) : undefined;
        const plan: OpsOperationPlan = { operation, input, environment, origin, requestKey, confirmationToken, protocol: entry.protocol, sessionId: chat.sessionId, chatId: chat.chatId, grantTarget };
        if (options.abortSignal?.aborted) return { summary: "Permintaan dihentikan." };
        if (await hasChatOperationGrant(chat, operation, grantTarget)) {
          if (options.abortSignal?.aborted) return { summary: "Permintaan dihentikan." };
          const guardedEntry = browserOperations(chat, async tx => {
            const active = await hasChatOperationGrant(chat, operation, grantTarget, tx);
            if (!active || options.abortSignal?.aborted) {
              throw new AdminMcpError("OPS_CHAT_GRANT_ENDED");
            }
          }).get(operation);
          if (!guardedEntry) return { summary: "Operasi tidak tersedia di chat ini." };
          const result = await invokeApprovedOperation(guardedEntry, plan);
          if (result.structuredContent?.error === "OPS_CHAT_GRANT_ENDED") {
            return { summary: "Izin chat telah berakhir. Siapkan persetujuan baru sebelum menjalankan perubahan." };
          }
          if (result.isError || result.structuredContent?.ok !== true) {
            return { summary: "Aksi belum terverifikasi. Baca ulang target sebelum melanjutkan.", data: result.structuredContent, requestKey };
          }
          return { summary: "Aksi selesai dengan izin chat.", targetId: grantTarget };
        }

        const preview = (value: unknown) => JSON.stringify(value, (key, field) => {
          if (/(?:token|credential|secret)s?$|^(?:courseKey|chapterKey|fileKey)$/i.test(key)) return undefined;
          if (/base64$/i.test(key) && typeof field === "string" && field.length > 2048) {
            return { length: field.length, sha256: createHash("sha256").update(field).digest("hex") };
          }
          return field;
        }, 2);
        const visibleInput = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "expectedRevision"));
        const exactDetails = JSON.stringify(visibleInput, null, 2);
        let details = exactDetails;
        if (entry.protocol === "direct") {
          try {
            details = preview({ ...visibleInput, resolvedTarget: authoringTargets(input) });
          } catch {
            return { summary: "Scope authoring sudah tidak berlaku. Ambil referensi target atau run terbaru." };
          }
        }
        const impactFields = impact && typeof impact === "object"
          ? Object.entries(impact).filter(([key]) => !["target", "operation", "expectedRevision"].includes(key))
          : [];
        const impactPreview = impactFields.length ? preview(Object.fromEntries(impactFields)) : undefined;
        if (details.length + (impactPreview?.length ?? 0) > maxModelChars) {
          return { summary: "Detail aksi terlalu besar untuk ditinjau. Perkecil perubahan dan siapkan kembali." };
        }
        const { publicProposal } = await proposalStore.createProposal({
          type: "admin_operation",
          actorId: chat.actorId,
          runId,
          stepId: `step-${options.toolCallId}`,
          title: entry.description.split(/\.\s/)[0].replace(/\.$/, ""),
          description: grantTarget ? "Izinkan perubahan ini?" : "Izinkan aksi ini sekali?",
          approval: grantTarget ? "chat" : "once",
          preview: {
            summary: operation,
            targetEntity: grantTarget,
            fields: [
              { label: "Environment", value: `${environment} (${origin})` },
              { label: "Detail perubahan", value: details },
              ...(impactPreview ? [{ label: "Dampak", value: impactPreview }] : []),
            ],
          },
          payload: plan,
          ttlMinutes: 10,
        });
        return { summary: "Persetujuan diperlukan. Tanyakan persetujuan dalam chat. Aksi belum dijalankan.", proposal: publicProposal };
      },
    }),
  };
}
