import { afterAll, describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { unzipSync } from "fflate";
import { registerAuthoringSkills } from "../../lib/authoring/mcp-skills";
import { loadSkillCatalog, safeSkillPath, skillDigest, validateSkillEntry, type SkillCatalogProfile } from "../../lib/authoring/skill-catalog";
import { buildSkillArtifact, localSkillSourceDigest, parseSkillFrontmatter } from "../../scripts/build-authoring-skills";
import { smokeAuthoringSkills } from "../../scripts/smoke-authoring-skills";
import { evaluatePlaybookCompatibility } from "../../lib/authoring/mcp-playbook";

mkdirSync(resolve("artifacts/authoring-skills-tests"), { recursive: true });
const temporary = mkdtempSync(resolve("artifacts/authoring-skills-tests", "run-"));
afterAll(() => rmSync(temporary, { recursive: true, force: true }));
const source = resolve(temporary, "source");
const names = ["zyx-authoring-pipeline", ...Array.from({ length: 20 }, (_, i) => `workflow-${i}`)];
mkdirSync(resolve(source, "skills"), { recursive: true });
writeFileSync(resolve(source, "release.json"), JSON.stringify({ skills: names }));
for (const name of names) {
  mkdirSync(resolve(source, "skills", name, "references"), { recursive: true });
  writeFileSync(resolve(source, "skills", name, "SKILL.md"), `---\nname: ${name}\ndescription: |\n  Author ${name}.\nmetadata:\n  owner: Zyx\n---\nUse endpoint \`https://staging.zyxacademy.com/api/mcp/authoring\`.\n`);
  writeFileSync(resolve(source, "skills", name, "references", "evidence.bin"), Buffer.from([0xff, 0, 0xfe]));
}
const root = resolve(temporary, "artifact");
const provenance = { repository: "https://github.com/soezyxstt/zyx-authoring-mcp.git", commit: "a".repeat(40), environment: "staging" as const };
const manifest = buildSkillArtifact(source, root, provenance);

async function rpc(profile: SkillCatalogProfile, method: string, params: object = {}, artifactRoot = root, environment?: "local" | "staging" | "production") {
  const server = new McpServer({ name: "skills-test", version: "1.0.0" });
  registerAuthoringSkills(server, profile, artifactRoot, environment);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(new Request("http://localhost/api/mcp/authoring", {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }));
    expect(response.status).toBe(200);
    return await response.json();
  } finally { await server.close(); }
}

describe("authoring skills distribution", () => {
  it("advertises the extension in initialization, outside experimental", async () => {
    const { result } = await rpc("chatgpt", "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    expect(result.capabilities.extensions).toEqual({ "io.modelcontextprotocol/skills": {} });
    expect(result.capabilities.resources).toEqual({});
    expect(result.capabilities.experimental).toBeUndefined();
  });

  it("keeps more than 20 independently discoverable skills and paginates deterministically", async () => {
    const entries = [];
    let cursor;
    do {
      const { result } = await rpc("all", "skills/list", cursor ? { cursor } : {});
      expect(result.skills.length).toBeLessThanOrEqual(5);
      entries.push(...result.skills);
      cursor = result.nextCursor;
    } while (cursor);
    expect(entries).toEqual(manifest.catalogs.all);
    expect(entries.length).toBe(21);
    for (const entry of entries) expect((await rpc("all", "skills/get", { uri: entry.uri })).result.skill).toEqual(entry);
  });

  it("imports all workflow bytes through one router, with working relative directory layout", async () => {
    const { result } = await rpc("chatgpt", "skills/list");
    expect(result.skills).toEqual(manifest.catalogs.chatgpt);
    expect(result.nextCursor).toBeUndefined();
    const entry = result.skills[0];
    expect(entry.resources.length).toBe(43);
    const zip = unzipSync(readFileSync(resolve(root, "chatgpt-skills.zip")));
    for (const name of names) {
      expect(Buffer.from(zip[`zyx-authoring/references/${name}/SKILL.md`])).toEqual(readFileSync(resolve(source, "skills", name, "SKILL.md")));
    }
  });

  it("serves every file with one matching URI and exact digest, preserving frontmatter", async () => {
    for (const profile of ["all", "chatgpt"] as const) {
      for (const entry of manifest.catalogs[profile]) {
        for (const resource of entry.resources) {
          const { result } = await rpc(profile, "resources/read", { uri: resource.uri });
          expect(result.contents).toHaveLength(1);
          const content = result.contents[0];
          expect(content.uri).toBe(resource.uri);
          const bytes = content.text === undefined ? Buffer.from(content.blob, "base64") : Buffer.from(content.text);
          expect(skillDigest(bytes)).toBe(resource.digest);
          expect(bytes.length).toBe(resource.size);
          if (resource.uri === entry.uri) expect(parseSkillFrontmatter(bytes)).toEqual(entry.frontmatter);
        }
      }
    }
  });

  it("rejects unknown resources, profile leaks, traversal, and invalid cursors", async () => {
    for (const uri of ["file:///etc/passwd", "skill://zyx-authoring/../secret", "skill://zyx-authoring/%2e%2e/secret", manifest.catalogs.all[0].uri]) {
      expect((await rpc("chatgpt", "resources/read", { uri })).error.code).toBe(-32602);
    }
    expect((await rpc("chatgpt", "skills/get", { uri: manifest.catalogs.all[0].uri })).error.code).toBe(-32602);
    for (const cursor of ["-1", "NaN", "1", "999", "05", ""]) {
      expect((await rpc("all", "skills/list", { cursor })).error.code).toBe(-32602);
    }
    for (const path of ["../secret", "/secret", "x\\secret", "x/%2e%2e", "x/./a", "x//a", "x/a.", "x/a?b", "x/cafe\u0301"]) expect(() => safeSkillPath(root, path)).toThrow();
  });

  it("rejects missing frontmatter, directory mismatch, file/count/size limits, and normalization conflicts", () => {
    expect(() => parseSkillFrontmatter(Buffer.from("name: missing"))).toThrow();
    const entry = structuredClone(manifest.catalogs.all[0]);
    expect(() => validateSkillEntry({ ...entry, frontmatter: { ...entry.frontmatter, name: "wrong" } })).toThrow();
    expect(() => validateSkillEntry({ ...entry, resources: Array(101).fill(entry.resources[0]) })).toThrow();
    expect(() => validateSkillEntry({ ...entry, resources: [{ ...entry.resources[0], size: 1024 * 1024 + 1 }] })).toThrow();
    expect(() => validateSkillEntry({ ...entry, resources: [entry.resources[0], { ...entry.resources[0], uri: entry.resources[0].uri.toUpperCase().replace("SKILL://ZYX-AUTHORING/", "skill://zyx-authoring/") }] })).toThrow();
    const tooBig = { ...entry, resources: [entry.resources.find((r) => r.uri === entry.uri)!, ...Array.from({ length: 6 }, (_, i) => ({ uri: entry.uri.replace("SKILL.md", `file-${i}`), digest: `sha256:${"a".repeat(64)}`, size: 1024 * 1024 }))] };
    expect(() => validateSkillEntry(tooBig)).toThrow();
  });

  it("detects changed bytes instead of serving stale manifest digests", () => {
    const copy = resolve(temporary, "tampered");
    buildSkillArtifact(source, copy, provenance);
    const path = safeSkillPath(copy, manifest.catalogs.all[0].uri.slice("skill://zyx-authoring/".length));
    writeFileSync(path, "tampered");
    expect(() => loadSkillCatalog(copy, "all")).toThrow("integrity");
  });

  it.skipIf(process.platform === "win32")("rejects symlinks instead of reading outside the snapshot", () => {
    const copy = resolve(temporary, "symlinked");
    buildSkillArtifact(source, copy, provenance);
    const outside = resolve(temporary, "outside");
    mkdirSync(outside);
    const linked = resolve(copy, "all", manifest.catalogs.all[0].frontmatter.name, "references");
    rmSync(linked, { recursive: true });
    symlinkSync(outside, linked, "junction");
    expect(() => loadSkillCatalog(copy, "all")).toThrow();
  });

  it("produces deterministic snapshots and rejects environment drift", () => {
    const second = resolve(temporary, "second");
    expect(buildSkillArtifact(source, second, provenance)).toEqual(manifest);
    expect(readFileSync(resolve(second, "manifest.json"))).toEqual(readFileSync(resolve(root, "manifest.json")));
    expect(() => buildSkillArtifact(source, resolve(temporary, "wrong-env"), { ...provenance, environment: "production" })).toThrow("environment");
  });

  it("passes the read-only HTTP import smoke against every catalog entry", async () => {
    const liveServers: McpServer[] = [];
    const http = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
      const server = new McpServer({ name: "smoke", version: "1" });
      liveServers.push(server);
      registerAuthoringSkills(server, new URL(request.url).searchParams.get("skills") === "all" ? "all" : "chatgpt", root);
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await server.connect(transport);
      return transport.handleRequest(request);
    } });
    try {
      expect(await smokeAuthoringSkills(http.url.toString())).toEqual({ skills: 1, files: 43, chatgptCountCompatible: true });
      expect(await smokeAuthoringSkills(`${http.url}?skills=all`)).toEqual({ skills: 21, files: 42, chatgptCountCompatible: false });
    } finally {
      http.stop(true);
      await Promise.all(liveServers.map((server) => server.close()));
    }
  }, 30000);

  it("validates the actual locked build", () => {
    const actual = loadSkillCatalog(resolve("dist/skills"), "all");
    expect(actual.entries.length).toBeGreaterThan(5);
    expect(loadSkillCatalog(resolve("dist/skills"), "chatgpt").entries.length).toBeLessThanOrEqual(5);
  });

  it("builds and serves the real local V4 skills, rejecting candidate serving in deployed environments", async () => {
    const candidateSource = resolve("plugins/zyx-authoring-mcp");
    const candidateRoot = resolve(temporary, "v4-candidate");
    const candidate = buildSkillArtifact(candidateSource, candidateRoot, {
      kind: "local-candidate", repository: "workspace:plugins/zyx-authoring-mcp", baseCommit: "b".repeat(40),
      digest: localSkillSourceDigest(candidateSource), environment: "staging",
    });
    expect(candidate.catalogs.all).toHaveLength(7);
    expect(candidate.catalogs.all.some((entry) => entry.frontmatter.name === "zyx-admin-operations")).toBe(true);
    const product = loadSkillCatalog(candidateRoot, "all").resources.get("skill://zyx-authoring/all/zyx-product-bundle-mcp/SKILL.md")!.text!;
    const release = JSON.parse(readFileSync(resolve(candidateSource, "release.json"), "utf8"));
    for (const required of ["product-bundle.v4", "math_unit", "visual_ref", "workflow.get_contract", "receipt tepercaya", release.version]) expect(product).toContain(required);
    expect(candidate.source).toHaveProperty("kind", "local-candidate");
    expect(evaluatePlaybookCompatibility({ bootstrapProtocol: release.bootstrapProtocol, pluginVersion: release.version, stage: "product", clientCapabilities: { independentSubagents: true, localArtifactFiles: true, pdfRendering: false } }).status).toBe("compatible");
    expect((await rpc("all", "skills/list", {}, candidateRoot, "staging")).error).toBeDefined();
    for (const profile of ["all", "chatgpt"] as const) {
      const entries = candidate.catalogs[profile];
      expect((await rpc(profile, "skills/list", {}, candidateRoot, "local")).result.skills).toEqual(entries.slice(0, 5));
      for (const entry of entries) {
        expect((await rpc(profile, "skills/get", { uri: entry.uri }, candidateRoot, "local")).result.skill).toEqual(entry);
        for (const resource of entry.resources) {
          const content = (await rpc(profile, "resources/read", { uri: resource.uri }, candidateRoot, "local")).result.contents[0];
          expect(skillDigest(Buffer.from(content.text))).toBe(resource.digest);
        }
      }
    }
    const before = localSkillSourceDigest(source);
    const changed = resolve(source, "skills", names[0], "references", "evidence.bin");
    const bytes = readFileSync(changed);
    try { writeFileSync(changed, "changed"); expect(localSkillSourceDigest(source)).not.toBe(before); }
    finally { writeFileSync(changed, bytes); }
  }, 30000);
});
