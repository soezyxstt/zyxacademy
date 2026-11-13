import { issueMcpRunToken, readMcpBootstrapToken } from "@/lib/authoring/mcp-workflows";

/** Mirrors workflow.start's principal-bound run, without test-only production behavior. */
export function issueBoundMcpRunToken(input: Parameters<typeof issueMcpRunToken>[0], bootstrapToken: string) {
  const { kind: _kind, issuedAt: _issuedAt, expiresAt: _expiresAt, ...bootstrap } = readMcpBootstrapToken(bootstrapToken);
  return issueMcpRunToken({ ...input, bootstrap });
}
