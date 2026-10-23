import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { requireMcpScope, type McpPrincipal } from "@/lib/authoring/mcp-auth";
import { grantInputSchema, planInputSchema, executeInputSchema, transferId, errorCode } from "./contracts";
import { capabilities, transferConfig } from "./security";
import { createSourceGrant, revokeSourceGrant } from "./source";
import { controlTransfer, executeTransfer, planTransfer, transferStatus } from "./destination";
import { TRANSFER_PLAYBOOK_URI, transferPlaybook } from "./playbook";

export function registerTransferTools(server: McpServer, principal: McpPrincipal) {
  const actor = { actorId: principal.actorId, sessionId: principal.sessionId };
  server.registerResource("authoring-transfer-playbook", TRANSFER_PLAYBOOK_URI, { mimeType: "application/json", description: "Current cross-environment transfer procedure, recovery, and supported boundary." }, async uri => {
    requireMcpScope(principal, "authoring:transfer:read");
    return { contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(transferPlaybook) }] };
  });
  function register(name: string, description: string, schema: z.ZodObject, scope: string, readOnly: boolean, run: (input: Record<string, unknown>) => Promise<unknown>) {
    server.registerTool(name, { description, inputSchema: schema.shape, annotations: { readOnlyHint: readOnly, destructiveHint: false, openWorldHint: true } }, async (input: Record<string, unknown>) => {
      try {
        requireMcpScope(principal, scope);
        const result = await run(input as Record<string, unknown>);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      } catch (error) {
        const code = error instanceof Error && error.message.startsWith("AUTHORING_MCP_SCOPE_REQUIRED") ? "TRANSFER_SCOPE_REQUIRED" : errorCode(error);
        return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: code }) }] };
      }
    });
  }
  register("transfer.capabilities", "Daftar peer transfer yang diizinkan dan dukungan versi. Transfer menghasilkan draft; publikasi tetap memakai review tujuan.", z.object({}), "authoring:transfer:read", true, async () => {
    const config = transferConfig();
    return { ...capabilities(config), playbookUri: TRANSFER_PLAYBOOK_URI, peers: config.peers.map(p => ({ id: p.id, canReadFrom: p.allowSource, canTransferTo: p.allowDestination })),
      workflow: ["Pada koneksi sumber: transfer.create_source_grant", "Pada koneksi tujuan: transfer.plan, periksa hasil, transfer.execute", "Poll transfer.status; setelah Idea dipublikasikan lewat alur tujuan, transfer.resume"],
      limitations: ["exact_identity", "source_figures_unsupported", "no_auto_publish", "no_overwrite"] };
  });
  register("transfer.create_source_grant", "Pada koneksi sumber, izinkan satu exact bundle revision dan dependency closure pada course yang sama untuk peer tujuan. Menulis metadata grant. Jangan mencetak sourceGrant dalam percakapan atau log.", grantInputSchema, "authoring:transfer:source", false, async input => createSourceGrant(transferConfig(), actor, input));
  register("transfer.revoke_source_grant", "Cabut delegasi transfer milik aktor pada koneksi sumber.", z.object({ grantId: transferId }), "authoring:transfer:source", false, async input => revokeSourceGrant(input.grantId as string, actor));
  register("transfer.plan", "Pada koneksi tujuan, periksa kompatibilitas, dependency closure dan konflik tanpa menulis konten. sourceGrant berasal dari koneksi sumber. Jangan memilih latest atau mengubah isi.", planInputSchema, "authoring:transfer:read", true, async input => planTransfer(transferConfig(), actor, input));
  register("transfer.execute", "Pada koneksi tujuan, jalankan exact plan yang telah diperiksa. Gunakan idempotencyKey yang sama untuk retry. Tidak menerbitkan konten atau mengganti draft yang berbeda.", executeInputSchema, "authoring:transfer:execute", false, async input => executeTransfer(transferConfig(), actor, input));
  register("transfer.status", "Poll progres transfer, reasonCode, dan receipt tanpa mengirim artifact melalui konteks agent.", z.object({ transferId }), "authoring:transfer:read", true, async input => transferStatus(input.transferId as string, actor));
  for (const action of ["resume", "cancel"] as const) register(`transfer.${action}`, action === "resume" ? "Lanjutkan transfer setelah prasyarat terpenuhi. Untuk delegasi kedaluwarsa, berikan sourceGrant baru dengan exact dependency closure yang sama." : "Batalkan transfer; konten yang telah dimaterialisasikan tetap tercatat dan tidak dihapus otomatis.", z.object({ transferId, sourceGrant: z.string().max(16000).optional() }), "authoring:transfer:execute", false, async input => controlTransfer(transferConfig(), input.transferId as string, actor, action, action === "resume" ? input.sourceGrant as string | undefined : undefined));
}
