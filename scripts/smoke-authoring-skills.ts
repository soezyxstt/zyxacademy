import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { skillEntrySchema, validateSkillEntry } from "../lib/authoring/skill-catalog";

// Read-only. Supply a non-production token through the environment, never CLI arguments.
export async function smokeAuthoringSkills(url: string, token?: string) {
  let id = 0;
  async function rpc(method: string, params: object) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
    const body = await response.json();
    if (body.error || !body.result) throw new Error(`${method}: protocol error`);
    return body.result;
  }
  const initialized = await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "zyx-skills-smoke", version: "1.0.0" } });
  if (!initialized.capabilities?.extensions?.["io.modelcontextprotocol/skills"] || !initialized.capabilities.resources) throw new Error("Missing skills capabilities");
  const skills = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await rpc("skills/list", cursor ? { cursor } : {});
    if (!Array.isArray(page.skills)) throw new Error("Invalid skills list");
    skills.push(...page.skills.map((entry: unknown) => skillEntrySchema.parse(entry)));
    cursor = page.nextCursor;
    if (cursor && (typeof cursor !== "string" || cursors.has(cursor))) throw new Error("Invalid pagination");
    if (cursor) cursors.add(cursor);
    if (cursors.size > 100) throw new Error("Too many catalog pages");
  } while (cursor);
  const names = new Set<string>();
  let files = 0;
  for (const listed of skills) {
    validateSkillEntry(listed);
    if (names.has(listed.frontmatter.name)) throw new Error("Duplicate skill name");
    names.add(listed.frontmatter.name);
    const { skill } = await rpc("skills/get", { uri: listed.uri });
    if (JSON.stringify(skill) !== JSON.stringify(listed)) throw new Error("Skill metadata drift");
    for (const resource of listed.resources) {
      const { contents } = await rpc("resources/read", { uri: resource.uri });
      if (contents?.length !== 1 || contents[0].uri !== resource.uri) throw new Error("Invalid resource response");
      const content = contents[0];
      const bytes = typeof content.text === "string" ? Buffer.from(content.text, "utf8") : Buffer.from(content.blob, "base64");
      if (`sha256:${createHash("sha256").update(bytes).digest("hex")}` !== resource.digest || bytes.length !== resource.size) throw new Error("Resource integrity mismatch");
      files++;
    }
  }
  if (!skills.length) throw new Error("Empty skills catalog");
  return { skills: skills.length, files, chatgptCountCompatible: skills.length <= 5 && cursors.size < 10 };
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { url: { type: "string" } }, strict: true });
  if (!values.url) throw new Error("Provide --url for the exact authorized MCP endpoint");
  const url = new URL(values.url);
  if (url.username || url.password || url.hash || (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Use HTTPS or localhost without credentials in URL");
  console.log(JSON.stringify(await smokeAuthoringSkills(url.toString(), process.env.AUTHORING_MCP_SMOKE_TOKEN)));
}
