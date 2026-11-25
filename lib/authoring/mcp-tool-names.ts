export const MCP_TOOL_NAME_MAX_LENGTH = 40;

export const MCP_TOOL_NAMING = {
  pattern: "^[a-zA-Z0-9_-]{1,40}$",
  maxLength: MCP_TOOL_NAME_MAX_LENGTH,
  rule: "replace dots with underscores",
  aliases: {
    "authoring.get_solution_collection_review_context": "authoring_solution_review_context",
  },
  canonicalOperationIdsPreserved: true,
  legacyCallsAccepted: true,
} as const;

export const MCP_SERVER_IDS = {
  staging: "zyx-stg",
  production: "zyx-prd",
  local: "zyx-local",
} as const;

const portableNamePattern = new RegExp(MCP_TOOL_NAMING.pattern);

/** Call names are portable; persisted operation IDs and OAuth scopes stay unchanged. */
export function portableMcpToolName(canonicalName: string): string {
  const aliases: Readonly<Record<string, string>> = MCP_TOOL_NAMING.aliases;
  const name = Object.hasOwn(aliases, canonicalName) ? aliases[canonicalName] : canonicalName.replaceAll(".", "_");
  if (!portableNamePattern.test(name)) throw new Error(`MCP_TOOL_NAME_INVALID:${canonicalName}`);
  return name;
}

/** Each server builds this map during registration, before any stateless request. */
export class McpToolNameMap {
  private readonly aliases = new Map<string, string>();
  private readonly canonicalNames = new Map<string, string>();

  assertAvailable(canonicalName: string): string {
    const alias = portableMcpToolName(canonicalName);
    if (this.canonicalNames.has(canonicalName)) throw new Error(`MCP_TOOL_NAME_DUPLICATE:${canonicalName}`);
    if (this.aliases.has(alias) || this.aliases.has(canonicalName) || this.canonicalNames.has(alias)) {
      throw new Error(`MCP_TOOL_NAME_COLLISION:${canonicalName}`);
    }
    return alias;
  }

  register(canonicalName: string): void {
    const alias = this.assertAvailable(canonicalName);
    this.canonicalNames.set(canonicalName, alias);
    this.aliases.set(alias, canonicalName);
  }

  portableName(canonicalName: string): string {
    const alias = this.canonicalNames.get(canonicalName);
    if (!alias) throw new Error(`MCP_TOOL_NAME_UNREGISTERED:${canonicalName}`);
    return alias;
  }

  canonicalName(callName: string): string {
    return this.aliases.get(callName) ?? callName;
  }
}
