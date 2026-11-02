import { describe, expect, test } from "bun:test";
import {
  OpsAiProvenanceSourceSchema,
  OpsAiCitationAvailabilitySchema,
  OpsAiCitationSchema,
  OpsAiStepStatusSchema,
  OpsAiStepTypeSchema,
  OpsAiWorkStepSchema,
  OpsAiActionProposalTypeSchema,
  OpsAiProposalStatusSchema,
  OpsAiPreconditionSnapshotSchema,
  OpsAiProposalPreviewSchema,
  OpsAiActionProposalV2Schema,
  OpsAiErrorCodeSchema,
  OpsAiErrorDataSchema,
  OpsAiMessageMetadataSchema,
  OpsAiToolClassSchema,
  OPS_AI_TOOL_SECURITY_REGISTRY,
  OPS_AI_POLICY_BOUNDS,
  OPS_AI_THREAT_MODEL,
  assertNoModelCallableMutation,
  validateOpsAiCitation,
  validateOpsAiWorkStep,
  validateOpsAiProposal,
  validateOpsAiErrorData,
  containsSecretLikePattern,
  evaluateProposalExecutionEligibility,
  verifyCitationBinding,
  sanitizeUserSearchProjection,
  type OpsAiUIMessage,
  type OpsAiCitation,
  type OpsAiWorkStep,
  type OpsAiActionProposalV2,
  type OpsAiErrorData,
} from "@/lib/admin-ops-ai/contracts";
import {
  type OpsAiMessage,
  type OpsAiDocumentSource,
  type OpsAiActionProposal,
} from "@/lib/admin-ops-ai/types";

describe("Ops AI v2 Contracts - Provenance, Citation Identity and Availability", () => {
  test("accepts all four defined provenance source values", () => {
    const validSources = [
      "semantic-rag",
      "live-tool",
      "database-read",
      "system-context",
    ];

    for (const source of validSources) {
      expect(OpsAiProvenanceSourceSchema.safeParse(source).success).toBe(true);
    }

    expect(OpsAiProvenanceSourceSchema.safeParse("untrusted-web").success).toBe(false);
    expect(OpsAiProvenanceSourceSchema.safeParse("").success).toBe(false);
  });

  test("accepts all four citation availability states", () => {
    const validStates = ["available", "stale", "missing", "invalid"];
    for (const state of validStates) {
      expect(OpsAiCitationAvailabilitySchema.safeParse(state).success).toBe(true);
    }
    expect(OpsAiCitationAvailabilitySchema.safeParse("expired").success).toBe(false);
  });

  test("validates citation with mandatory sourceId, runId, stepId, availability and optional toolCallId", () => {
    const citationWithToolCall: OpsAiCitation = {
      id: "cite-evt-101",
      sourceId: "src-doc-users-schema",
      source: "live-tool",
      availability: "available",
      runId: "run-abc-123",
      stepId: "step-1",
      toolCallId: "call-xyz-456",
      title: "Schema Introspection: user table",
      snippet: "Columns: id, name, role, createdAt",
      score: 0.95,
      timestamp: 1725240000000,
    };

    const result = validateOpsAiCitation(citationWithToolCall);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    const citationWithoutToolCall: OpsAiCitation = {
      id: "cite-evt-102",
      sourceId: "src-doc-ops-runbook#cache",
      source: "semantic-rag",
      availability: "stale",
      runId: "run-abc-123",
      stepId: "step-2",
      title: "Runbook Rollback SOP",
      filePath: "docs/operations/zyra-ops-runbooks.md",
      section: "Emergency Cache Purge",
      snippet: "Gunakan token aktivasi dengan format Zyx-...",
    };

    const resultWithout = validateOpsAiCitation(citationWithoutToolCall);
    expect(resultWithout.valid).toBe(true);
  });

  test("rejects citations missing mandatory sourceId, runId, stepId, or invalid availability", () => {
    const missingSourceId = {
      id: "cite-evt-103",
      // missing sourceId
      source: "database-read",
      availability: "available",
      runId: "run-abc-123",
      stepId: "step-3",
      title: "Database Summary",
      snippet: "user count: 120",
    };
    expect(validateOpsAiCitation(missingSourceId).valid).toBe(false);

    const missingRunId = {
      id: "cite-evt-104",
      sourceId: "src-db-summary",
      source: "database-read",
      availability: "available",
      // missing runId
      stepId: "step-3",
      title: "Database Summary",
      snippet: "user count: 120",
    };
    expect(validateOpsAiCitation(missingRunId).valid).toBe(false);

    const badAvailability = {
      id: "cite-evt-105",
      sourceId: "src-db-summary",
      source: "database-read",
      availability: "unknown_state",
      runId: "run-abc-123",
      stepId: "step-3",
      title: "Database Summary",
      snippet: "user count: 120",
    };
    expect(validateOpsAiCitation(badAvailability).valid).toBe(false);
  });
});

describe("Ops AI v2 Contracts - Work-Step Lifecycle and Runtime States", () => {
  test("validates work step runtime states: queued, running, completed, failed, cancelled", () => {
    const runtimeStates = ["queued", "running", "completed", "failed", "cancelled"] as const;

    for (const status of runtimeStates) {
      expect(OpsAiStepStatusSchema.safeParse(status).success).toBe(true);
    }

    // "pending" was replaced by "queued"
    expect(OpsAiStepStatusSchema.safeParse("pending").success).toBe(false);
  });

  test("validates work step representations for completed, failed, and cancelled", () => {
    const completedStep: OpsAiWorkStep = {
      stepId: "step-001",
      runId: "run-100",
      stepIndex: 0,
      stepType: "reasoning",
      status: "completed",
      title: "Menganalisis skema basis data",
      detail: "Selesai membaca 5 tabel utama.",
      durationMs: 450,
      startedAt: 1725240000000,
      finishedAt: 1725240000450,
    };
    expect(validateOpsAiWorkStep(completedStep).valid).toBe(true);

    const failedStep: OpsAiWorkStep = {
      stepId: "step-002",
      runId: "run-100",
      stepIndex: 1,
      stepType: "tool_call",
      status: "failed",
      title: "Pencarian knowledge base",
      toolName: "retrieve_admin_knowledge",
      toolCallId: "call-kb-1",
      durationMs: 1200,
      retryable: true,
      error: "Timeout saat menghubungi upstream Vectorize.",
      startedAt: 1725240001000,
      finishedAt: 1725240002200,
    };
    expect(validateOpsAiWorkStep(failedStep).valid).toBe(true);

    const cancelledStep: OpsAiWorkStep = {
      stepId: "step-003",
      runId: "run-100",
      stepIndex: 2,
      stepType: "synthesis",
      status: "cancelled",
      title: "Sintesis jawaban akhir",
      detail: "Dibatalkan karena pengguna menutup drawer.",
      durationMs: 50,
      retryable: false,
      startedAt: 1725240002500,
      finishedAt: 1725240002550,
    };
    expect(validateOpsAiWorkStep(cancelledStep).valid).toBe(true);
  });

  test("rejects invalid step duration or negative step index", () => {
    const negativeDuration = {
      stepId: "step-004",
      runId: "run-100",
      stepIndex: 0,
      stepType: "reasoning",
      status: "completed",
      title: "Analisis",
      durationMs: -100, // Invalid negative duration
      startedAt: 1725240000000,
    };
    expect(validateOpsAiWorkStep(negativeDuration).valid).toBe(false);
  });
});

describe("Ops AI v2 Contracts - Action Proposals, Previews, and Browser Isolation", () => {
  test("V2 proposal enum strictly forbids feature flag toggling", () => {
    expect(OpsAiActionProposalTypeSchema.safeParse("create_token").success).toBe(true);
    expect(OpsAiActionProposalTypeSchema.safeParse("navigate_page").success).toBe(true);
    expect(OpsAiActionProposalTypeSchema.safeParse("trigger_job").success).toBe(true);
    expect(OpsAiActionProposalTypeSchema.safeParse("toggle_feature_flag").success).toBe(false);
    expect(OpsAiActionProposalTypeSchema.safeParse("toggle_flag").success).toBe(false);
  });

  test("proves public proposal part uses non-authoritative preview and does not expose executable params", () => {
    const publicProposal: OpsAiActionProposalV2 = {
      id: "prop-public-201",
      runId: "run-100",
      stepId: "step-2",
      type: "create_token",
      title: "Buat Token Aktivasi Kelompok",
      description: "Membuat 1 token pendaftaran untuk kalkulus-1 dengan kapasitas 5.",
      preview: {
        summary: "1 token baru (kalkulus-1, kuota 5, paket reguler)",
        targetEntity: "kalkulus-1",
        fields: [
          { label: "Mata Kuliah", value: "kalkulus-1" },
          { label: "Kapasitas", value: "5 orang" },
          { label: "Paket", value: "reguler_15" },
        ],
      },
      status: "pending",
      preconditions: {
        version: 1,
        contentHash: "a".repeat(64),
        stateFingerprint: "course:kalkulus-1:active",
      },
      createdAt: 1725240000000,
      expiresAt: 1725241800000,
    };

    const result = validateOpsAiProposal(publicProposal);
    expect(result.valid).toBe(true);

    // Verify type contract does not have executable params field
    expect((publicProposal as any).params).toBeUndefined();
    expect(publicProposal.preview.summary).toBeDefined();
    expect(publicProposal.preview.fields?.length).toBe(3);
  });
});

describe("Ops AI v2 Contracts - Tool Security Classification and Approved Vocabulary", () => {
  test("tightens tool registry to approved runtime vocabulary without feature flag proposals", () => {
    const approvedTools = [
      "retrieve_admin_knowledge",
      "inspect_schema",
      "get_system_metrics",
      "navigate_admin",
      "search_users",
      "propose_create_token",
      "propose_batch_create_chapters",
      "propose_bulk_update_materials",
      "execute_confirmed_proposal",
    ];

    expect(Object.keys(OPS_AI_TOOL_SECURITY_REGISTRY).sort()).toEqual(approvedTools.sort());
    expect(OPS_AI_TOOL_SECURITY_REGISTRY["propose_toggle_flag"]).toBeUndefined();
    expect(OPS_AI_TOOL_SECURITY_REGISTRY["toggle_feature_flag"]).toBeUndefined();
  });

  test("guarantees no model-callable tool is classified as a mutation executor", () => {
    expect(() => assertNoModelCallableMutation(OPS_AI_TOOL_SECURITY_REGISTRY)).not.toThrow();

    for (const [name, tool] of Object.entries(OPS_AI_TOOL_SECURITY_REGISTRY)) {
      if (tool.isModelCallable) {
        expect(tool.allowsMutation).toBe(false);
        expect(tool.toolClass).not.toBe("confirmation-executor");
        expect(["read-only", "retrieval", "proposal-only"]).toContain(tool.toolClass);
      }
    }
  });

  test("ensures confirmation executor is strictly human-confirmed and not model callable", () => {
    const executor = OPS_AI_TOOL_SECURITY_REGISTRY.execute_confirmed_proposal;
    expect(executor).toBeDefined();
    expect(executor.toolClass).toBe("confirmation-executor");
    expect(executor.isModelCallable).toBe(false);
    expect(executor.requiresHumanConfirmation).toBe(true);
    expect(executor.allowsMutation).toBe(true);
    expect(executor.requiredRole).toBe("admin");
  });
});

describe("Ops AI v2 Contracts - Locked Program Policy Bounds", () => {
  test("locks semantic retrieval bounds to exactly 12 candidates and 6 maximum final sources", () => {
    expect(OPS_AI_POLICY_BOUNDS.retrievalCandidateCount).toBe(12);
    expect(OPS_AI_POLICY_BOUNDS.retrievalMaxFinalSources).toBe(6);
  });

  test("enforces explicit tool loop and message history bounds", () => {
    expect(OPS_AI_POLICY_BOUNDS.maxToolSteps).toBe(5);
    expect(OPS_AI_POLICY_BOUNDS.maxConsecutiveToolCalls).toBe(3);
    expect(OPS_AI_POLICY_BOUNDS.maxMessagesHistory).toBe(30);
    expect(OPS_AI_POLICY_BOUNDS.maxMessageCharLength).toBe(4000);
    expect(OPS_AI_POLICY_BOUNDS.maxTotalPromptChars).toBe(24000);
  });

  test("enforces explicit timeout and retry bounds", () => {
    expect(OPS_AI_POLICY_BOUNDS.providerTimeoutMs).toBe(45000);
    expect(OPS_AI_POLICY_BOUNDS.stepTimeoutMs).toBe(15000);
    expect(OPS_AI_POLICY_BOUNDS.streamChunkTimeoutMs).toBe(8000);
    expect(OPS_AI_POLICY_BOUNDS.maxRetryAttempts).toBe(2);
    expect(OPS_AI_POLICY_BOUNDS.retryInitialDelayMs).toBe(500);
    expect(OPS_AI_POLICY_BOUNDS.retryMaxDelayMs).toBe(3000);
    expect(OPS_AI_POLICY_BOUNDS.proposalTtlMinutes).toBe(30);
  });
});

describe("Ops AI v2 Contracts - Security Threat Model Coverage", () => {
  test("covers all required threat categories", () => {
    const requiredThreats = [
      "retrieved_prompt_injection",
      "proposal_replay",
      "stale_preconditions",
      "pii_leakage",
      "forged_citations",
    ] as const;

    for (const threat of requiredThreats) {
      const entry = OPS_AI_THREAT_MODEL[threat];
      expect(entry).toBeDefined();
      expect(entry.threatCategory).toBe(threat);
      expect(entry.riskDescription.length).toBeGreaterThan(10);
      expect(entry.mitigationStrategy.length).toBeGreaterThan(10);
      expect(entry.enforcementMechanism.length).toBeGreaterThan(10);
      expect(entry.testableRule.length).toBeGreaterThan(10);
    }
  });

  test("threat defense: proposal replay prevention", () => {
    const baseProposal: OpsAiActionProposalV2 = {
      id: "prop-replay-1",
      runId: "run-100",
      stepId: "step-1",
      type: "create_token",
      title: "Create token",
      description: "Create token desc",
      preview: { summary: "Token preview" },
      status: "pending",
      createdAt: 1725240000000,
      expiresAt: 1725241800000,
    };

    const validCheck = evaluateProposalExecutionEligibility({
      proposal: baseProposal,
      livePreconditionMatch: true,
      currentTimeMs: 1725240500000,
    });
    expect(validCheck.canExecute).toBe(true);

    const executedProposal: OpsAiActionProposalV2 = {
      ...baseProposal,
      status: "executed",
    };
    const executedCheck = evaluateProposalExecutionEligibility({
      proposal: executedProposal,
      livePreconditionMatch: true,
      currentTimeMs: 1725240500000,
    });
    expect(executedCheck.canExecute).toBe(false);
    expect(executedCheck.errorCode).toBe("PROPOSAL_REPLAY_DETECTED");

    const expiredCheck = evaluateProposalExecutionEligibility({
      proposal: baseProposal,
      livePreconditionMatch: true,
      currentTimeMs: 1725242000000,
    });
    expect(expiredCheck.canExecute).toBe(false);
    expect(expiredCheck.errorCode).toBe("PROPOSAL_REPLAY_DETECTED");
  });

  test("threat defense: stale precondition detection", () => {
    const proposalWithPrecondition: OpsAiActionProposalV2 = {
      id: "prop-precondition-1",
      runId: "run-100",
      stepId: "step-1",
      type: "create_token",
      title: "Create token",
      description: "Create token desc",
      preview: { summary: "Token preview" },
      status: "pending",
      preconditions: {
        version: 2,
        stateFingerprint: "course:kalkulus-1:v2",
      },
      createdAt: 1725240000000,
      expiresAt: 1725241800000,
    };

    const matchCheck = evaluateProposalExecutionEligibility({
      proposal: proposalWithPrecondition,
      livePreconditionMatch: true,
      currentTimeMs: 1725240500000,
    });
    expect(matchCheck.canExecute).toBe(true);

    const staleCheck = evaluateProposalExecutionEligibility({
      proposal: proposalWithPrecondition,
      livePreconditionMatch: false,
      currentTimeMs: 1725240500000,
    });
    expect(staleCheck.canExecute).toBe(false);
    expect(staleCheck.errorCode).toBe("STALE_PRECONDITION");
  });

  test("threat defense: PII minimum projection contract and secret screening", () => {
    expect(containsSecretLikePattern("api_key: zyx_live_123456789")).toBe(true);
    expect(containsSecretLikePattern("Authorization: Bearer sk-12345")).toBe(true);
    expect(containsSecretLikePattern("Client-Secret: my_secret")).toBe(true);
    expect(containsSecretLikePattern("Password: secretPassword123")).toBe(true);
    expect(containsSecretLikePattern("Informasi umum mengenai mata kuliah")).toBe(false);

    const rawUsers = [
      {
        id: "u-1",
        name: "Admin User",
        email: "admin@zyx.edu",
        role: "admin",
        createdAt: 1725240000000,
        passwordHash: "$2b$10$verysecretpasswordhash",
        sessionToken: "session-secret-token-123",
        creditCard: "4111-2222-3333-4444",
      },
    ];

    // Minimum projection: email omitted by default
    const minimumProjection = sanitizeUserSearchProjection(rawUsers);
    expect(minimumProjection[0]).toEqual({
      id: "u-1",
      name: "Admin User",
      role: "admin",
      createdAt: 1725240000000,
    });
    expect(minimumProjection[0].email).toBeUndefined();
    expect((minimumProjection[0] as any).passwordHash).toBeUndefined();
    expect((minimumProjection[0] as any).sessionToken).toBeUndefined();

    // Redacted email projection when explicitly enabled
    const redactedProjection = sanitizeUserSearchProjection(rawUsers, { includeRedactedEmail: true });
    expect(redactedProjection[0].email).toBe("a***@zyx.edu");
  });

  test("threat defense: forged citation verification with sourceId check", () => {
    const validRunId = "run-verified-001";
    const knownSourceIds = new Set(["src-kb-doc-1", "src-tool-schema"]);
    const knownStepIds = new Set(["step-1", "step-2"]);
    const knownToolCallIds = new Set(["call-search-1"]);

    const validCitation: OpsAiCitation = {
      id: "c-1",
      sourceId: "src-kb-doc-1",
      source: "semantic-rag",
      availability: "available",
      runId: validRunId,
      stepId: "step-1",
      title: "Doc title",
      snippet: "Doc snippet text",
    };

    expect(verifyCitationBinding({
      citation: validCitation,
      validRunId,
      knownSourceIds,
      knownStepIds,
      knownToolCallIds,
    }).valid).toBe(true);

    // Fabricated sourceId
    const forgedSourceCitation: OpsAiCitation = {
      ...validCitation,
      sourceId: "src-phantom-999",
    };
    const badSourceResult = verifyCitationBinding({
      citation: forgedSourceCitation,
      validRunId,
      knownSourceIds,
      knownStepIds,
      knownToolCallIds,
    });
    expect(badSourceResult.valid).toBe(false);
    expect(badSourceResult.reasonCode).toBe("UNKNOWN_SOURCE_ID");

    // Wrong runId
    const forgedRunCitation: OpsAiCitation = {
      ...validCitation,
      runId: "run-fake-999",
    };
    const badRunResult = verifyCitationBinding({
      citation: forgedRunCitation,
      validRunId,
      knownSourceIds,
      knownStepIds,
      knownToolCallIds,
    });
    expect(badRunResult.valid).toBe(false);
    expect(badRunResult.reasonCode).toBe("RUN_ID_MISMATCH");

    // Fabricated stepId
    const forgedStepCitation: OpsAiCitation = {
      ...validCitation,
      stepId: "step-phantom-99",
    };
    const badStepResult = verifyCitationBinding({
      citation: forgedStepCitation,
      validRunId,
      knownSourceIds,
      knownStepIds,
      knownToolCallIds,
    });
    expect(badStepResult.valid).toBe(false);
    expect(badStepResult.reasonCode).toBe("UNKNOWN_STEP_ID");
  });
});

describe("Ops AI Contracts - Legacy Compatibility Preservation", () => {
  test("maintains full backwards compatibility for v1 OpsAiMessage contracts", () => {
    const v1Message: OpsAiMessage = {
      id: "msg-v1-001",
      role: "assistant",
      content: "Halo admin, ada yang bisa dibantu?",
      createdAt: 1725240000000,
      sources: [
        {
          title: "SOP Token",
          filePath: "docs/tokens.md",
          section: "Generasi Token",
          snippet: "Format token aktivasi...",
        },
      ],
      proposal: {
        id: "prop-v1-001",
        type: "toggle_feature_flag",
        title: "Toggle Flag",
        description: "Aktifkan FEATURE_PKA",
        params: { flagKey: "FEATURE_PKA", enabled: true },
        status: "pending",
      },
      toolResult: {
        toolName: "search_admin_docs",
        summary: "Ditemukan 1 dokumen",
      },
    };

    expect(v1Message.id).toBe("msg-v1-001");
    expect(v1Message.sources?.[0].title).toBe("SOP Token");
    expect(v1Message.proposal?.type).toBe("toggle_feature_flag");
  });

  test("type checks conceptual v2 OpsAiUIMessage structure", () => {
    const v2Message: OpsAiUIMessage = {
      id: "msg-v2-001",
      role: "assistant",
      metadata: {
        runId: "run-v2-100",
        stepCount: 2,
        totalTokens: 520,
        modelId: "gemini-2.5-flash",
        createdAt: 1725240000000,
      },
      parts: [
        {
          type: "text",
          text: "Berikut adalah hasil analisis skema database.",
        },
        {
          type: "data-work-step",
          id: "step-part-1",
          data: {
            stepId: "step-1",
            runId: "run-v2-100",
            stepIndex: 0,
            stepType: "reasoning",
            status: "completed",
            title: "Inspeksi struktur tabel",
            durationMs: 320,
            startedAt: 1725240000000,
            finishedAt: 1725240000320,
          },
        },
        {
          type: "data-citation",
          id: "cite-part-1",
          data: {
            id: "cite-1",
            sourceId: "src-db-schema-user",
            source: "database-read",
            availability: "available",
            runId: "run-v2-100",
            stepId: "step-1",
            title: "Database schema",
            snippet: "Tabel user memiliki kolom id, name, email...",
          },
        },
      ],
    };

    expect(v2Message.id).toBe("msg-v2-001");
    expect(v2Message.role).toBe("assistant");
    expect(v2Message.parts).toHaveLength(3);
  });
});
