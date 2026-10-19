import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const AUTHORING_MCP_BOOTSTRAP_PROTOCOL = 1;
export const SUPPORTED_BOOTSTRAP_PROTOCOLS = [1] as const;
export const RECOMMENDED_PLUGIN_VERSION = "0.3.0";
export const MIN_COMPATIBLE_PLUGIN_VERSION = "0.2.0";

export const AUTHORING_MCP_SKILLS = [
  "zyx-authoring-pipeline",
  "zyx-source-pack-mcp",
  "zyx-idea-bundle-mcp",
  "zyx-product-bundle-mcp",
  "zyx-question-authoring-mcp",
  "reference-question-ingest",
] as const;

export type AuthoringMcpSkill = (typeof AUTHORING_MCP_SKILLS)[number];
export const authoringMcpSkillSchema = z.enum(AUTHORING_MCP_SKILLS);

export const AUTHORING_MCP_PLAYBOOK_STAGES = [
  "common",
  "pipeline",
  "source",
  "idea",
  "product",
  "quiz",
  "reference",
] as const;
export const AUTHORING_PLAYBOOK_STAGES = AUTHORING_MCP_PLAYBOOK_STAGES;

export type AuthoringPlaybookStage = (typeof AUTHORING_MCP_PLAYBOOK_STAGES)[number];
export const authoringPlaybookStageSchema = z.enum(AUTHORING_MCP_PLAYBOOK_STAGES);

export const AUTHORING_MCP_PLAYBOOK_MODULE_KEYS = [
  "common/execution",
  "pipeline/orchestration",
  "source/workflow",
  "source/reconciliation",
  "idea/workflow",
  "idea/decomposition",
  "product/workflow",
  "product/editorial",
  "product/quality-rubric",
  "product/flashcards",
  "product/derivation-audit",
  "quiz/workflow",
  "quiz/quality",
  "reference/workflow",
  "reference/payload-preflight",
] as const;
export const AUTHORING_PLAYBOOK_MODULE_KEYS = AUTHORING_MCP_PLAYBOOK_MODULE_KEYS;

export type AuthoringPlaybookModuleKey = (typeof AUTHORING_MCP_PLAYBOOK_MODULE_KEYS)[number];
export const authoringPlaybookModuleKeySchema = z.enum(AUTHORING_MCP_PLAYBOOK_MODULE_KEYS);

export const clientCapabilitiesSchema = z.object({
  independentSubagents: z.boolean().optional(),
  localArtifactFiles: z.boolean().optional(),
  pdfRendering: z.boolean().optional(),
}).strict();

export type AuthoringClientCapabilities = z.infer<typeof clientCapabilitiesSchema>;

type PlaybookModuleCatalogEntry = {
  key: AuthoringPlaybookModuleKey;
  filename: string;
  title: string;
  stage: AuthoringPlaybookStage;
  summary: string;
};

const PLAYBOOK_MODULE_ALLOWLIST: Record<AuthoringPlaybookModuleKey, PlaybookModuleCatalogEntry> = {
  "common/execution": {
    key: "common/execution",
    filename: "common-execution.md",
    title: "Common Execution, Security, and Publication Boundaries",
    stage: "common",
    summary: "Bootstrap protocol rules, token safety, untrusted document boundaries, role separation, and per-workflow publication matrix.",
  },
  "pipeline/orchestration": {
    key: "pipeline/orchestration",
    filename: "pipeline-orchestration.md",
    title: "End-to-End Authoring Pipeline Orchestration",
    stage: "pipeline",
    summary: "Checkpoint sequence from Source Pack to Idea Bundle V3, admin Idea publication gate, and Product Bundle V3 staging.",
  },
  "source/workflow": {
    key: "source/workflow",
    filename: "source-workflow.md",
    title: "Source Pack Workflow and Archive Contract",
    stage: "source",
    summary: "Tool sequence, scoped documentId collision prevention, source-pack.v1 manifest schema, and unit marker requirements.",
  },
  "source/reconciliation": {
    key: "source/reconciliation",
    filename: "source-reconciliation.md",
    title: "Lossless Transcription and Multi-Source Reconciliation",
    stage: "source",
    summary: "Verbatim fidelity, visual/table transcription, notation alignment across multiple documents, and quality gate checklist.",
  },
  "idea/workflow": {
    key: "idea/workflow",
    filename: "idea-workflow.md",
    title: "Idea Bundle V3 Workflow and Archive Contract",
    stage: "idea",
    summary: "Tool sequence, idea-bundle.v3 manifest and 6 entity schemas, attribution placeholders, and staging rules.",
  },
  "idea/decomposition": {
    key: "idea/decomposition",
    filename: "idea-decomposition.md",
    title: "Pedagogical Decomposition and Idea Graph Design",
    stage: "idea",
    summary: "Learning section partitioning, atomic Idea granularity, classification enums, provenance coverage, and DAG acyclicity.",
  },
  "product/workflow": {
    key: "product/workflow",
    filename: "product-workflow.md",
    title: "Product Bundle V3 Workflow and Archive Contract",
    stage: "product",
    summary: "Capability gates, Creator/Critic/Student POV verification, product-bundle.v3 schema, lineage, and staging rules.",
  },
  "product/editorial": {
    key: "product/editorial",
    filename: "product-editorial.md",
    title: "Structured Article, Diktat, and Typed Visuals Editorial Guide",
    stage: "product",
    summary: "Section pedagogy fields, semantic block payloads, epsilon_delta_graph and learning_canvas visuals, and A4 Diktat budget.",
  },
  "product/quality-rubric": {
    key: "product/quality-rubric",
    filename: "product-quality-rubric.md",
    title: "Eight-Criterion Pedagogic Quality Rubric and Subagent Protocol",
    stage: "product",
    summary: "Detailed 8-criterion rubric, Critic and Student POV inspection tasks, and anchored review payload rules.",
  },
  "product/flashcards": {
    key: "product/flashcards",
    filename: "product-flashcards.md",
    title: "Atomic Flashcard Authoring Guide",
    stage: "product",
    summary: "One-Idea-per-card invariant, minimum information principle, card mix, and formatting hygiene.",
  },
  "product/derivation-audit": {
    key: "product/derivation-audit",
    filename: "product-derivation-audit.md",
    title: "Mathematical and Scientific Derivation Audit Guide",
    stage: "product",
    summary: "Step-by-step algebraic justification, domain and inequality tracking, unit consistency, and KaTeX render safety.",
  },
  "quiz/workflow": {
    key: "quiz/workflow",
    filename: "quiz-workflow.md",
    title: "Question Bank V2 and Quiz Assembly Workflow",
    stage: "quiz",
    summary: "Scoped Idea catalog search, bounded historical reference gap analysis, question-bank-draft.v2 contract, and quiz assembly tools.",
  },
  "quiz/quality": {
    key: "quiz/quality",
    filename: "quiz-quality.md",
    title: "Question Design and Diagnostic Distractor Guide",
    stage: "quiz",
    summary: "Idea alignment, difficulty and cognitive calibration, stem clarity, misconception-mapped distractors, and explanation standards.",
  },
  "reference/workflow": {
    key: "reference/workflow",
    filename: "reference-workflow.md",
    title: "Historical Reference Question Ingest Workflow and Contract",
    stage: "reference",
    summary: "Course-only scope, direct published status semantics, reference-question-draft.v1 schema, provenance enums, and quizEligible gate.",
  },
  "reference/payload-preflight": {
    key: "reference/payload-preflight",
    filename: "reference-payload-preflight.md",
    title: "Historical Reference Verbatim Fidelity and Preflight Checklist",
    stage: "reference",
    summary: "Verbatim preservation, multi-part splitting, solution span isolation, cross-chapter Idea linking, and pre-submit checklist.",
  },
};

const SKILL_DEFAULT_STAGE: Record<AuthoringMcpSkill, AuthoringPlaybookStage> = {
  "zyx-authoring-pipeline": "pipeline",
  "zyx-source-pack-mcp": "source",
  "zyx-idea-bundle-mcp": "idea",
  "zyx-product-bundle-mcp": "product",
  "zyx-question-authoring-mcp": "quiz",
  "reference-question-ingest": "reference",
};

type StageManifestSpec = {
  stage: AuthoringPlaybookStage;
  requiredModules: readonly AuthoringPlaybookModuleKey[];
  optionalModules: readonly AuthoringPlaybookModuleKey[];
  requiredCapabilities: {
    independentSubagents: boolean;
    localArtifactFiles: boolean;
    pdfRendering: boolean;
  };
};

const STAGE_MANIFEST_SPECS: Record<AuthoringPlaybookStage, StageManifestSpec> = {
  common: {
    stage: "common",
    requiredModules: ["common/execution"],
    optionalModules: [],
    requiredCapabilities: {
      independentSubagents: false,
      localArtifactFiles: false,
      pdfRendering: false,
    },
  },
  pipeline: {
    stage: "pipeline",
    requiredModules: ["common/execution", "pipeline/orchestration"],
    optionalModules: ["source/workflow", "idea/workflow", "product/workflow"],
    requiredCapabilities: {
      independentSubagents: false,
      localArtifactFiles: true,
      pdfRendering: false,
    },
  },
  source: {
    stage: "source",
    requiredModules: ["common/execution", "source/workflow", "source/reconciliation"],
    optionalModules: [],
    requiredCapabilities: {
      independentSubagents: false,
      localArtifactFiles: true,
      pdfRendering: false,
    },
  },
  idea: {
    stage: "idea",
    requiredModules: ["common/execution", "idea/workflow", "idea/decomposition"],
    optionalModules: [],
    requiredCapabilities: {
      independentSubagents: false,
      localArtifactFiles: true,
      pdfRendering: false,
    },
  },
  product: {
    stage: "product",
    requiredModules: [
      "common/execution",
      "product/workflow",
      "product/editorial",
      "product/quality-rubric",
      "product/flashcards",
      "product/derivation-audit",
    ],
    optionalModules: [],
    requiredCapabilities: {
      independentSubagents: true,
      localArtifactFiles: true,
      pdfRendering: false,
    },
  },
  quiz: {
    stage: "quiz",
    requiredModules: ["common/execution", "quiz/workflow", "quiz/quality"],
    optionalModules: [],
    requiredCapabilities: {
      independentSubagents: false,
      localArtifactFiles: false,
      pdfRendering: false,
    },
  },
  reference: {
    stage: "reference",
    requiredModules: ["common/execution", "reference/workflow", "reference/payload-preflight"],
    optionalModules: [],
    requiredCapabilities: {
      independentSubagents: false,
      localArtifactFiles: false,
      pdfRendering: false,
    },
  },
};

export type LoadedPlaybookModule = {
  key: AuthoringPlaybookModuleKey;
  title: string;
  stage: AuthoringPlaybookStage;
  summary: string;
  required: boolean;
  revision: string;
  checksum: string;
  markdown: string;
};

export type StagePlaybookManifest = {
  stage: AuthoringPlaybookStage;
  playbookRevision: string;
  playbookChecksum: string;
  requiredModules: AuthoringPlaybookModuleKey[];
  optionalModules: AuthoringPlaybookModuleKey[];
  requiredCapabilities: {
    independentSubagents: boolean;
    localArtifactFiles: boolean;
    pdfRendering: boolean;
  };
  modules: Array<{
    key: AuthoringPlaybookModuleKey;
    title: string;
    stage: AuthoringPlaybookStage;
    summary: string;
    required: boolean;
    revision: string;
    checksum: string;
  }>;
};

export type PlaybookCompatibilityResult = {
  status: "compatible" | "warning" | "incompatible";
  code:
    | "OK"
    | "AUTHORING_MCP_PLUGIN_OUTDATED"
    | "AUTHORING_MCP_BOOTSTRAP_PROTOCOL_UNSUPPORTED"
    | "AUTHORING_MCP_CAPABILITY_MISSING";
  reason: string;
  remediation: string | null;
  supportedBootstrapProtocols: readonly number[];
  recommendedPluginVersion: string;
  minCompatiblePluginVersion: string;
};

function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function normalizeMarkdownText(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function playbooksDirectory(): string {
  return path.join(process.cwd(), "lib", "authoring", "playbooks");
}

const moduleCache = new Map<AuthoringPlaybookModuleKey, Omit<LoadedPlaybookModule, "required">>();

export function loadPlaybookModule(
  key: AuthoringPlaybookModuleKey,
  required = true,
): LoadedPlaybookModule {
  const entry = PLAYBOOK_MODULE_ALLOWLIST[key];
  if (!entry) {
    throw new Error(`AUTHORING_MCP_PLAYBOOK_MODULE_UNKNOWN:${String(key)}`);
  }
  let cached = moduleCache.get(key);
  if (!cached) {
    const filePath = path.join(playbooksDirectory(), entry.filename);
    const raw = readFileSync(filePath, "utf8");
    const markdown = normalizeMarkdownText(raw);
    const checksum = sha256Hex(markdown);
    const revision = `pb-mod-${checksum.slice(0, 12)}`;
    cached = {
      key: entry.key,
      title: entry.title,
      stage: entry.stage,
      summary: entry.summary,
      revision,
      checksum,
      markdown,
    };
    moduleCache.set(key, cached);
  }
  return {
    ...cached,
    required,
  };
}

export function listAllPlaybookModules(): LoadedPlaybookModule[] {
  return AUTHORING_PLAYBOOK_MODULE_KEYS.map((key) => loadPlaybookModule(key, true));
}

export function resolvePlaybookStage(input: {
  skill?: AuthoringMcpSkill;
  stage?: AuthoringPlaybookStage;
}): AuthoringPlaybookStage {
  if (input.stage) {
    if (input.skill && input.stage !== SKILL_DEFAULT_STAGE[input.skill] &&
        !(input.skill === "zyx-authoring-pipeline" && ["common", "source", "idea", "product"].includes(input.stage))) {
      throw new Error("AUTHORING_MCP_BOOTSTRAP_STAGE_MISMATCH");
    }
    return input.stage;
  }
  if (input.skill) return SKILL_DEFAULT_STAGE[input.skill];
  return "common";
}

export function getStagePlaybookManifest(stage: AuthoringPlaybookStage): StagePlaybookManifest {
  const spec = STAGE_MANIFEST_SPECS[stage];
  if (!spec) {
    throw new Error(`AUTHORING_MCP_PLAYBOOK_STAGE_UNKNOWN:${String(stage)}`);
  }
  const requiredLoaded = spec.requiredModules.map((key) => loadPlaybookModule(key, true));
  const optionalLoaded = spec.optionalModules.map((key) => loadPlaybookModule(key, false));
  const allModules = [...requiredLoaded, ...optionalLoaded];

  const canonicalDescriptor = JSON.stringify({
    stage: spec.stage,
    requiredCapabilities: spec.requiredCapabilities,
    modules: allModules.map((mod) => ({
      key: mod.key,
      required: mod.required,
      checksum: mod.checksum,
    })),
  });
  const playbookChecksum = sha256Hex(canonicalDescriptor);
  const playbookRevision = `pb-v1-${spec.stage}-${playbookChecksum.slice(0, 12)}`;

  return {
    stage: spec.stage,
    playbookRevision,
    playbookChecksum,
    requiredModules: [...spec.requiredModules],
    optionalModules: [...spec.optionalModules],
    requiredCapabilities: { ...spec.requiredCapabilities },
    modules: allModules.map(({ markdown: _markdown, ...meta }) => meta),
  };
}

export function listAllStagePlaybookManifests(): Record<AuthoringPlaybookStage, StagePlaybookManifest> {
  return {
    common: getStagePlaybookManifest("common"),
    pipeline: getStagePlaybookManifest("pipeline"),
    source: getStagePlaybookManifest("source"),
    idea: getStagePlaybookManifest("idea"),
    product: getStagePlaybookManifest("product"),
    quiz: getStagePlaybookManifest("quiz"),
    reference: getStagePlaybookManifest("reference"),
  };
}

function parseSemverTuple(version: string | undefined): [number, number, number] | null {
  if (!version) return null;
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a: [number, number, number], b: [number, number, number]): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

export function evaluatePlaybookCompatibility(input: {
  stage: AuthoringPlaybookStage;
  bootstrapProtocol?: number;
  pluginVersion?: string;
  clientCapabilities?: AuthoringClientCapabilities;
}): PlaybookCompatibilityResult {
  const protocol = input.bootstrapProtocol ?? AUTHORING_MCP_BOOTSTRAP_PROTOCOL;
  if (!SUPPORTED_BOOTSTRAP_PROTOCOLS.includes(protocol as 1)) {
    return {
      status: "incompatible",
      code: "AUTHORING_MCP_BOOTSTRAP_PROTOCOL_UNSUPPORTED",
      reason: `Client bootstrapProtocol '${String(input.bootstrapProtocol)}' is not supported by this server (supported: ${SUPPORTED_BOOTSTRAP_PROTOCOLS.join(", ")}).`,
      remediation: `Update your local zyx-authoring-mcp plugin package to version ${RECOMMENDED_PLUGIN_VERSION} or newer and restart your MCP host session.`,
      supportedBootstrapProtocols: SUPPORTED_BOOTSTRAP_PROTOCOLS,
      recommendedPluginVersion: RECOMMENDED_PLUGIN_VERSION,
      minCompatiblePluginVersion: MIN_COMPATIBLE_PLUGIN_VERSION,
    };
  }

  const stageSpec = STAGE_MANIFEST_SPECS[input.stage];
  const missingCapabilities = (Object.keys(stageSpec.requiredCapabilities) as Array<keyof AuthoringClientCapabilities>)
    .filter((capability) => stageSpec.requiredCapabilities[capability] && input.clientCapabilities?.[capability] !== true);
  if (missingCapabilities.length > 0) {
    return {
      status: "incompatible",
      code: "AUTHORING_MCP_CAPABILITY_MISSING",
      reason: `Tahap '${input.stage}' memerlukan capability bernilai true: ${missingCapabilities.join(", ")}.`,
      remediation: "Gunakan host yang mendukung seluruh capability wajib dan laporkan kemampuan host secara eksplisit.",
      supportedBootstrapProtocols: SUPPORTED_BOOTSTRAP_PROTOCOLS,
      recommendedPluginVersion: RECOMMENDED_PLUGIN_VERSION,
      minCompatiblePluginVersion: MIN_COMPATIBLE_PLUGIN_VERSION,
    };
  }

  const parsedVersion = parseSemverTuple(input.pluginVersion);
  const recommendedTuple = parseSemverTuple(RECOMMENDED_PLUGIN_VERSION)!;
  if (!parsedVersion || compareSemver(parsedVersion, recommendedTuple) < 0) {
    return {
      status: "warning",
      code: "AUTHORING_MCP_PLUGIN_OUTDATED",
      reason: input.pluginVersion
        ? `Client pluginVersion '${input.pluginVersion}' is older than recommended version '${RECOMMENDED_PLUGIN_VERSION}', though bootstrapProtocol ${protocol} remains compatible.`
        : `Client did not declare pluginVersion (recommended: '${RECOMMENDED_PLUGIN_VERSION}'). Proceeding with compatible bootstrapProtocol ${protocol}.`,
      remediation: `Consider syncing the local zyx-authoring-mcp skill package to ${RECOMMENDED_PLUGIN_VERSION} when convenient; active server playbooks remain authoritative for this run.`,
      supportedBootstrapProtocols: SUPPORTED_BOOTSTRAP_PROTOCOLS,
      recommendedPluginVersion: RECOMMENDED_PLUGIN_VERSION,
      minCompatiblePluginVersion: MIN_COMPATIBLE_PLUGIN_VERSION,
    };
  }

  return {
    status: "compatible",
    code: "OK",
    reason: "Bootstrap protocol and client capabilities satisfy active server requirements.",
    remediation: null,
    supportedBootstrapProtocols: SUPPORTED_BOOTSTRAP_PROTOCOLS,
    recommendedPluginVersion: RECOMMENDED_PLUGIN_VERSION,
    minCompatiblePluginVersion: MIN_COMPATIBLE_PLUGIN_VERSION,
  };
}

export function resolveAuthoringMcpEnvironment(): "staging" | "production" | "local" {
  const explicit = (process.env.ZYX_MCP_ENVIRONMENT ?? process.env.VERCEL_ENV ?? "").trim().toLowerCase();
  if (explicit === "production") return "production";
  if (explicit === "preview" || explicit === "staging") return "staging";

  const appUrl = (process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (appUrl) {
    const hostname = new URL(appUrl).hostname.toLowerCase();
    if (hostname === "staging.zyxacademy.com") return "staging";
    if (["zyxacademy.com", "www.zyxacademy.com", "zyx.id", "www.zyx.id"].includes(hostname)) return "production";
    if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname)) throw new Error("AUTHORING_MCP_ENVIRONMENT_UNKNOWN");
  }
  return "local";
}

export function resolveAuthoringServerRevision(): string {
  const sha =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.CF_PAGES_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    process.env.COMMIT_SHA;
  if (sha && sha.trim().length > 0) {
    return sha.trim().slice(0, 12);
  }
  return "local-dev";
}

export function buildPlaybookResponse(input: {
  skill?: AuthoringMcpSkill;
  stage?: AuthoringPlaybookStage;
  modules?: readonly AuthoringPlaybookModuleKey[];
  bootstrapProtocol?: number;
  pluginVersion?: string;
  clientCapabilities?: AuthoringClientCapabilities;
  expectedPlaybookRevision?: string;
}) {
  const resolvedStage = resolvePlaybookStage({ skill: input.skill, stage: input.stage });
  const manifest = getStagePlaybookManifest(resolvedStage);
  if (input.expectedPlaybookRevision && input.expectedPlaybookRevision !== manifest.playbookRevision) {
    throw new Error("AUTHORING_MCP_PLAYBOOK_STALE");
  }
  const compatibility = evaluatePlaybookCompatibility({
    stage: resolvedStage,
    bootstrapProtocol: input.bootstrapProtocol,
    pluginVersion: input.pluginVersion,
    clientCapabilities: input.clientCapabilities,
  });

  const requestedKeys: AuthoringPlaybookModuleKey[] = input.modules && input.modules.length > 0
    ? [...new Set(input.modules)]
    : [...manifest.requiredModules];

  const requiredSet = new Set<AuthoringPlaybookModuleKey>(manifest.requiredModules);
  const allowedModules = new Set<AuthoringPlaybookModuleKey>([...manifest.requiredModules, ...manifest.optionalModules]);
  if (requestedKeys.some((key) => !allowedModules.has(key))) throw new Error("AUTHORING_MCP_PLAYBOOK_MODULE_OUT_OF_STAGE");
  const loadedModules = requestedKeys.map((key) => loadPlaybookModule(key, requiredSet.has(key)));
  const instructionsMarkdown = [
    `# Zyx Authoring Playbook (${resolvedStage})`,
    `- Playbook revision: \`${manifest.playbookRevision}\``,
    `- Playbook checksum: \`${manifest.playbookChecksum}\``,
    `- Compatibility: \`${compatibility.status}\` (\`${compatibility.code}\`)`,
    ...(compatibility.remediation ? [`- Remediation: ${compatibility.remediation}`] : []),
    "",
    ...loadedModules.map(
      (mod) => `## Module: ${mod.key} (${mod.revision})\n\n${mod.markdown.trim()}`,
    ),
  ].join("\n");

  return {
    environment: resolveAuthoringMcpEnvironment(),
    serverRevision: resolveAuthoringServerRevision(),
    skill: input.skill ?? null,
    stage: resolvedStage,
    bootstrapProtocol: input.bootstrapProtocol ?? AUTHORING_MCP_BOOTSTRAP_PROTOCOL,
    pluginVersion: input.pluginVersion ?? null,
    playbookRevision: manifest.playbookRevision,
    playbookChecksum: manifest.playbookChecksum,
    requiredModules: manifest.requiredModules,
    optionalModules: manifest.optionalModules,
    requiredCapabilities: manifest.requiredCapabilities,
    compatibility,
    modules: loadedModules,
    instructionsMarkdown,
  };
}
