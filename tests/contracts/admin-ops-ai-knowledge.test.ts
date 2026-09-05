import { describe, expect, test } from "bun:test";
import {
  CANONICAL_NAMESPACES,
  CANONICAL_ENTITY_TYPES,
  CANONICAL_VECTOR_PROFILE,
  assertCanonicalMetadata,
  createVersionedVectorId,
  parseVersionedVectorId,
  type CanonicalVectorMetadata,
} from "@/lib/vectorize/contracts";
import {
  ADMIN_OPS_KNOWLEDGE_NAMESPACE,
  ADMIN_DOCUMENT_ENTITY_TYPE,
  ADMIN_ACCESS_CLASS,
  ADMIN_KNOWLEDGE_BOUNDS,
  AdminKnowledgeSecurityError,
  AdminKnowledgeAuthError,
} from "@/lib/admin-ops-ai/admin-knowledge-contracts";
import {
  CURATED_ADMIN_KNOWLEDGE_ALLOWLIST,
  isPathAllowedForAdminKnowledge,
  assertPathAllowedForAdminKnowledge,
  generateDbSchemaProjection,
  generateFeatureFlagsCatalog,
  generateAdminRoutesCatalog,
  generateOpsAiToolsCatalog,
} from "@/lib/admin-ops-ai/admin-knowledge-sources";
import {
  chunkAdminKnowledgeSource,
  parseSemanticBlocks,
} from "@/lib/admin-ops-ai/admin-knowledge-chunker";
import { KNOWN_FEATURE_FLAGS } from "@/lib/feature-flags";

describe("Admin Ops Knowledge Pipeline - Vectorize Contracts & Isolation", () => {
  test("includes isolated admin_ops_knowledge in canonical namespaces", () => {
    expect(CANONICAL_NAMESPACES).toContain("admin_ops_knowledge");
    expect(ADMIN_OPS_KNOWLEDGE_NAMESPACE).toBe("admin_ops_knowledge");
  });

  test("includes admin_document in canonical entity types", () => {
    expect(CANONICAL_ENTITY_TYPES).toContain("admin_document");
    expect(ADMIN_DOCUMENT_ENTITY_TYPE).toBe("admin_document");
  });

  test("creates and parses versioned vector IDs for admin documents", () => {
    const vectorId = createVersionedVectorId("admin_document", "doc_architecture_c0", 1);
    expect(vectorId).toBe("v2:admin_document:doc_architecture_c0:1");

    const parsed = parseVersionedVectorId(vectorId);
    expect(parsed).toEqual({
      entityType: "admin_document",
      entityId: "doc_architecture_c0",
      version: 1,
    });
  });

  test("validates canonical metadata with admin_ops_knowledge and admin accessClass", () => {
    const validMeta: CanonicalVectorMetadata = {
      namespace: "admin_ops_knowledge",
      entityType: "admin_document",
      entityId: "doc_architecture_c0",
      version: 1,
      status: "active",
      accessClass: "admin",
      language: "id",
      profileId: CANONICAL_VECTOR_PROFILE.id,
      contentHash: "a".repeat(64),
    };

    expect(() => assertCanonicalMetadata(validMeta)).not.toThrow();
  });
});

describe("Admin Ops Knowledge Pipeline - Curated Source Registry & Security Guard", () => {
  test("curated allowlist contains only approved documents and virtual projections", () => {
    const paths = CURATED_ADMIN_KNOWLEDGE_ALLOWLIST.map((s) => s.sourcePath);
    expect(paths).toContain("docs/ARCHITECTURE.md");
    expect(paths).toContain("docs/features.md");
    expect(paths).toContain("docs/DB_SCHEMA.md");
    expect(paths).toContain("docs/DEVELOPMENT.md");
    expect(paths).toContain("docs/DEPLOYMENT.md");
    expect(paths).toContain("docs/operations/production-readiness-checklist.md");
    expect(paths).toContain("docs/operations/zyra-ops-runbooks.md");
    expect(paths).toContain("docs/bundle/authoring-context-pack-v1.md");
    expect(paths).toContain("docs/bundle/authoring-job-pack-v1.md");
    expect(paths).toContain("docs/bundle/idea-bundle-v3.md");
    expect(paths).toContain("docs/bundle/product-bundle-v3.md");
    expect(paths).toContain("virtual:schema_projection");
    expect(paths).toContain("virtual:feature_flags_catalog");
    expect(paths).toContain("virtual:admin_routes_catalog");
    expect(paths).toContain("virtual:ops_ai_tools_catalog");
    expect(paths.length).toBe(15);
  });

  test("allows registered curated paths", () => {
    expect(isPathAllowedForAdminKnowledge("docs/ARCHITECTURE.md")).toBe(true);
    expect(isPathAllowedForAdminKnowledge("docs/features.md")).toBe(true);
    expect(isPathAllowedForAdminKnowledge("virtual:schema_projection")).toBe(true);
    expect(() => assertPathAllowedForAdminKnowledge("docs/ARCHITECTURE.md")).not.toThrow();
  });

  test("strictly rejects secret-bearing, environment, audit, handoff, and unauthorized paths", () => {
    const forbiddenPaths = [
      ".env",
      ".env.local",
      ".env.production",
      "config/secrets.json",
      "certs/id_rsa",
      "auth/user-sessions.json",
      "tokens.txt",
      "db/passwords.txt",
      "node_modules/express/index.js",
      ".git/config",
      ".gemini/token",
      "plans/001-overhaul.md",
      "docs/audit/admin-visual-quality-audit.md",
      "docs/handoffs/zyra-ai-plans-001-007.md",
      "artifacts/screenshot.png",
      "tests/contracts/admin-ops-ai-knowledge.test.ts",
      "scripts/staging/smoke-auth.ts",
      "app/api/admin/chat/route.ts",
      "arbitrary/random/file.md",
    ];

    for (const forbidden of forbiddenPaths) {
      expect(isPathAllowedForAdminKnowledge(forbidden)).toBe(false);
      expect(() => assertPathAllowedForAdminKnowledge(forbidden)).toThrow(
        AdminKnowledgeSecurityError
      );
    }
  });

  test("generates safe schema projection without raw code or secrets", () => {
    const schemaDoc = generateDbSchemaProjection();
    expect(schemaDoc).toContain("# Database Schema Structural Projection");
    expect(schemaDoc).toContain("user");
    expect(schemaDoc).toContain("courses");
    expect(schemaDoc).toContain("enrollment_tokens");
    expect(schemaDoc).toContain("admin_ops_knowledge_sources");
    expect(schemaDoc).not.toContain("process.env");
    expect(schemaDoc).not.toContain("password");
    expect(schemaDoc).not.toContain("API_KEY");
  });

  test("generates feature flags catalog covering all known flags", () => {
    const flagsDoc = generateFeatureFlagsCatalog();
    expect(flagsDoc).toContain("# Feature Flags Catalog");
    for (const flag of KNOWN_FEATURE_FLAGS) {
      expect(flagsDoc).toContain(flag.key);
      expect(flagsDoc).toContain(flag.name);
    }
  });

  test("generates admin routes and ops ai tools catalogs", () => {
    const routesDoc = generateAdminRoutesCatalog();
    expect(routesDoc).toContain("/admin");
    expect(routesDoc).toContain("/admin/tokens");
    expect(routesDoc).toContain("/admin/ops/flags");

    const toolsDoc = generateOpsAiToolsCatalog();
    expect(toolsDoc).toContain("search_users");
    expect(toolsDoc).toContain("inspect_schema");
    expect(toolsDoc).toContain("propose_create_token");
  });
});

describe("Admin Ops Knowledge Pipeline - Deterministic Chunker & Manifest", () => {
  const sampleMarkdown = `# System Architecture

Zyx Academy architecture is built on Next.js, Cloudflare Vectorize, and Turso SQLite.

## Vectorize Foundation

The canonical vector store uses Cloudflare Vectorize with 768-dimensional embeddings.

\`\`\`ts
export const CANONICAL_VECTOR_PROFILE = {
  id: "canonical-content-v2",
  dimensions: 768,
};
\`\`\`

### Isolation Policy

Each domain uses an isolated namespace:
| Namespace | Entity Type | Access Class |
|---|---|---|
| admin_ops_knowledge | admin_document | admin |
| canonical_ideas | idea | enrolled |
`;

  test("parses markdown into structural blocks preserving headings, code, and tables", () => {
    const blocks = parseSemanticBlocks(sampleMarkdown);
    expect(blocks.length).toBeGreaterThanOrEqual(4);

    const headingBlocks = blocks.filter((b) => b.type === "heading");
    expect(headingBlocks.length).toBe(3);
    expect(headingBlocks[0].headingText).toBe("System Architecture");
    expect(headingBlocks[1].headingText).toBe("Vectorize Foundation");
    expect(headingBlocks[2].headingText).toBe("Isolation Policy");

    const codeBlocks = blocks.filter((b) => b.type === "code");
    expect(codeBlocks.length).toBe(1);
    expect(codeBlocks[0].text).toContain("CANONICAL_VECTOR_PROFILE");

    const tableBlocks = blocks.filter((b) => b.type === "table");
    expect(tableBlocks.length).toBe(1);
    expect(tableBlocks[0].text).toContain("admin_ops_knowledge");
  });

  test("produces identical chunk IDs, hashes, and manifest across repeated runs", () => {
    const sourceContent = {
      id: "doc:architecture",
      sourcePath: "docs/ARCHITECTURE.md",
      sourceType: "doc" as const,
      title: "Architecture and System Boundaries",
      rawContent: sampleMarkdown,
      normalizedContent: sampleMarkdown,
      contentHash: "1234567890abcdef".repeat(4),
      isVirtual: false,
    };

    const run1 = chunkAdminKnowledgeSource(sourceContent, { maxChunkSize: 500 });
    const run2 = chunkAdminKnowledgeSource(sourceContent, { maxChunkSize: 500 });

    expect(run1.chunkCount).toBe(run2.chunkCount);
    expect(run1.manifestHash).toBe(run2.manifestHash);
    expect(run1.chunks).toHaveLength(run2.chunks.length);

    for (let i = 0; i < run1.chunks.length; i++) {
      expect(run1.chunks[i].id).toBe(run2.chunks[i].id);
      expect(run1.chunks[i].contentHash).toBe(run2.chunks[i].contentHash);
      expect(run1.chunks[i].locator).toBe(run2.chunks[i].locator);
      expect(run1.chunks[i].headingHierarchy).toEqual(run2.chunks[i].headingHierarchy);
      expect(run1.chunks[i].startOffset).toBe(run2.chunks[i].startOffset);
      expect(run1.chunks[i].endOffset).toBe(run2.chunks[i].endOffset);
    }
  });

  test("preserves heading hierarchy in chunk breadcrumbs", () => {
    const sourceContent = {
      id: "doc:architecture",
      sourcePath: "docs/ARCHITECTURE.md",
      sourceType: "doc" as const,
      title: "Architecture and System Boundaries",
      rawContent: sampleMarkdown,
      normalizedContent: sampleMarkdown,
      contentHash: "1234567890abcdef".repeat(4),
      isVirtual: false,
    };

    const manifest = chunkAdminKnowledgeSource(sourceContent, { maxChunkSize: 200 });
    expect(manifest.chunkCount).toBeGreaterThanOrEqual(2);

    const isolationChunk = manifest.chunks.find((c) =>
      c.content.includes("admin_ops_knowledge")
    );
    expect(isolationChunk).toBeDefined();
    expect(isolationChunk?.headingHierarchy).toContain("System Architecture");
    expect(isolationChunk?.headingHierarchy).toContain("Vectorize Foundation");
    expect(isolationChunk?.headingHierarchy).toContain("Isolation Policy");
  });
});
