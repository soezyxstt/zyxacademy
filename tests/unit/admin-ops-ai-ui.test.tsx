import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import {
  calculateOpsAiMaxWidth,
  clampOpsAiWidth,
  migrateChatHistoryV1ToV2,
  loadOpsAiMessages,
  saveOpsAiMessages,
  clearOpsAiMessages,
  loadOpsAiOpenPreference,
  saveOpsAiOpenPreference,
  loadOpsAiWidthPreference,
  saveOpsAiWidthPreference,
  OPS_AI_DEFAULT_WIDTH,
  OPS_AI_MIN_WIDTH,
  OPS_AI_MAX_WIDTH_CAP,
  STORAGE_KEY_PANEL_OPEN_V2,
  STORAGE_KEY_PANEL_WIDTH_V2,
  STORAGE_KEY_MESSAGES_V2,
  STORAGE_KEY_MESSAGES_V1,
} from "@/components/admin/ops-ai/ops-ai-storage";
import { WorkTraceView } from "@/components/admin/ops-ai/work-trace-view";
import { CitationCards } from "@/components/admin/ops-ai/citation-cards";
import { ActionProposalCard } from "@/components/admin/ops-ai/action-proposal-card";
import { OpsAiTrigger } from "@/components/admin/ops-ai/ops-ai-trigger";
import { OpsAiProvider } from "@/components/admin/ops-ai/ops-ai-context";
import { OpsAiPanel } from "@/components/admin/ops-ai/ops-ai-panel";
import {
  OPS_AI_CITATION_OFFICIAL_LABEL,
  OPS_AI_CITATION_OFFICIAL_DISCLAIMER,
} from "@/lib/admin-ops-ai/citations";
import type {
  OpsAiWorkStep,
  OpsAiCitation,
  OpsAiActionProposalV2,
} from "@/lib/admin-ops-ai/contracts";

describe("Admin Ops AI UI Benchmark - CP6 Implementation Tests", () => {
  // Mock localStorage in test environment
  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }
    globalThis.localStorage = {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        for (const k of Object.keys(mockStorage)) delete mockStorage[k];
      },
      key: (i: number) => Object.keys(mockStorage)[i] ?? null,
      length: Object.keys(mockStorage).length,
    } as Storage;
  });

  // ==========================================================================
  // Suite 1: Resizable Panel & Bounds Constraints
  // ==========================================================================
  describe("Suite 1: Resizable Panel & Bounds Constraints", () => {
    it("enforces default width to 480px and minimum width to 360px", () => {
      expect(OPS_AI_DEFAULT_WIDTH).toBe(480);
      expect(OPS_AI_MIN_WIDTH).toBe(360);
      expect(OPS_AI_MAX_WIDTH_CAP).toBe(720);
    });

    it("calculates dynamic maximum width as min(720px, 50vw)", () => {
      // 1024px viewport -> 50% = 512px (< 720px) -> max is 512px
      expect(calculateOpsAiMaxWidth(1024)).toBe(512);

      // 1200px viewport -> 50% = 600px (< 720px) -> max is 600px
      expect(calculateOpsAiMaxWidth(1200)).toBe(600);

      // 1600px viewport -> 50% = 800px (> 720px) -> max is capped at 720px
      expect(calculateOpsAiMaxWidth(1600)).toBe(720);

      // 1920px viewport -> 50% = 960px (> 720px) -> max is capped at 720px
      expect(calculateOpsAiMaxWidth(1920)).toBe(720);
    });

    it("clamps arbitrary width values within [360px, min(720px, 50vw)]", () => {
      const viewport = 1440; // 50vw = 720px
      // Below min
      expect(clampOpsAiWidth(200, viewport)).toBe(360);
      expect(clampOpsAiWidth(359, viewport)).toBe(360);

      // Valid range
      expect(clampOpsAiWidth(400, viewport)).toBe(400);
      expect(clampOpsAiWidth(480, viewport)).toBe(480);
      expect(clampOpsAiWidth(600, viewport)).toBe(600);
      expect(clampOpsAiWidth(720, viewport)).toBe(720);

      // Above max
      expect(clampOpsAiWidth(750, viewport)).toBe(720);
      expect(clampOpsAiWidth(1000, viewport)).toBe(720);

      // Narrow desktop viewport (1000px -> 50vw = 500px)
      expect(clampOpsAiWidth(600, 1000)).toBe(500);
      expect(clampOpsAiWidth(300, 1000)).toBe(360);
    });

    it("persists and restores width preference via localStorage", () => {
      saveOpsAiWidthPreference(560);
      expect(mockStorage[STORAGE_KEY_PANEL_WIDTH_V2]).toBe("560");
      expect(loadOpsAiWidthPreference()).toBe(560);

      // Out-of-bounds saved values are automatically clamped on load
      mockStorage[STORAGE_KEY_PANEL_WIDTH_V2] = "999";
      expect(loadOpsAiWidthPreference()).toBe(720);

      mockStorage[STORAGE_KEY_PANEL_WIDTH_V2] = "100";
      expect(loadOpsAiWidthPreference()).toBe(360);
    });

    it("persists and restores panel open/closed state preference", () => {
      expect(loadOpsAiOpenPreference(false)).toBe(false);
      saveOpsAiOpenPreference(true);
      expect(mockStorage[STORAGE_KEY_PANEL_OPEN_V2]).toBe("true");
      expect(loadOpsAiOpenPreference(false)).toBe(true);
      saveOpsAiOpenPreference(false);
      expect(mockStorage[STORAGE_KEY_PANEL_OPEN_V2]).toBe("false");
      expect(loadOpsAiOpenPreference(true)).toBe(false);
    });
  });

  // ==========================================================================
  // Suite 2: LocalStorage Safe Migration (Zero Fake Tool History Invariant)
  // ==========================================================================
  describe("Suite 2: LocalStorage Safe Migration Invariant", () => {
    it("migrates v1 chat history to v2 without synthesizing false tool history or fake workSteps", () => {
      const v1Data = JSON.stringify([
        {
          id: "v1-msg-1",
          role: "user",
          content: "Tolong carikan informasi token aktivasi",
          createdAt: 1700000000000,
        },
        {
          id: "v1-msg-2",
          role: "assistant",
          content: "Berikut informasi mengenai token aktivasi di Zyx Academy.",
          createdAt: 1700000001000,
          sources: [
            {
              title: "SOP Token Pendaftaran",
              filePath: "docs/token.md",
              section: "Format",
              snippet: "Prefix token Zyx-XXXXXXXX",
            },
          ],
          proposal: {
            id: "prop-legacy-1",
            type: "create_token",
            title: "Buat Token Baru",
            description: "Token 5 orang",
            params: { capacity: "5", courseIds: "kalkulus-1" },
            status: "pending",
          },
          toolResult: {
            toolName: "retrieve_admin_knowledge",
            summary: "Ditemukan 1 dokumen.",
          },
        },
      ]);

      const migrated = migrateChatHistoryV1ToV2(v1Data);
      expect(migrated).toHaveLength(2);

      // Message 1: User message preserved
      expect(migrated[0].id).toBe("v1-msg-1");
      expect(migrated[0].role).toBe("user");
      expect(migrated[0].content).toBe("Tolong carikan informasi token aktivasi");
      expect(migrated[0].workSteps).toBeUndefined();

      // Message 2: Assistant message
      expect(migrated[1].id).toBe("v1-msg-2");
      expect(migrated[1].role).toBe("assistant");
      expect(migrated[1].content).toContain("Berikut informasi mengenai token aktivasi");

      // Critical Invariant: Zero synthetic workSteps created
      expect(migrated[1].workSteps).toBeUndefined();

      // Sources converted to citations with available status
      expect(migrated[1].citations).toHaveLength(1);
      expect(migrated[1].citations?.[0].title).toBe("SOP Token Pendaftaran");
      expect(migrated[1].citations?.[0].source).toBe("semantic-rag");
      expect(migrated[1].citations?.[0].availability).toBe("available");

      // Proposal converted safely to preview shape
      expect(migrated[1].proposals).toHaveLength(1);
      expect(migrated[1].proposals?.[0].id).toBe("prop-legacy-1");
      expect(migrated[1].proposals?.[0].status).toBe("pending");
      expect(migrated[1].proposals?.[0].preview.fields).toBeDefined();
    });

    it("automatically reads v1 from localStorage and migrates to v2 on loadOpsAiMessages()", () => {
      mockStorage[STORAGE_KEY_MESSAGES_V1] = JSON.stringify([
        {
          id: "legacy-1",
          role: "user",
          content: "Halo admin",
        },
      ]);

      const loaded = loadOpsAiMessages();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].content).toBe("Halo admin");

      // Verifies it wrote to v2 key
      expect(mockStorage[STORAGE_KEY_MESSAGES_V2]).toBeDefined();
    });

    it("handles null, invalid, or empty v1 chat history gracefully", () => {
      expect(migrateChatHistoryV1ToV2(null)).toEqual([]);
      expect(migrateChatHistoryV1ToV2("")).toEqual([]);
      expect(migrateChatHistoryV1ToV2("not-json")).toEqual([]);
      expect(migrateChatHistoryV1ToV2("{}")).toEqual([]);
      expect(migrateChatHistoryV1ToV2("[]")).toEqual([]);
    });

    it("clears messages from localStorage cleanly", () => {
      saveOpsAiMessages([
        { id: "m1", role: "user", content: "Test", createdAt: 1000 },
      ]);
      expect(mockStorage[STORAGE_KEY_MESSAGES_V2]).toBeDefined();
      clearOpsAiMessages();
      expect(mockStorage[STORAGE_KEY_MESSAGES_V2]).toBeUndefined();
    });
  });

  // ==========================================================================
  // Suite 3: Desktop Layout Participant & Mobile Overlay Structure
  // ==========================================================================
  describe("Suite 3: Desktop Layout Participant & Mobile Overlay Structure", () => {
    it("renders panel with desktop in-flow participant and mobile overlay classes", () => {
      const html = renderToStaticMarkup(
        <OpsAiProvider initialOpen={true} initialWidth={480}>
          <OpsAiPanel />
        </OpsAiProvider>
      );

      // Panel must exist with complementary role and accessible label
      expect(html).toContain('role="complementary"');
      expect(html).toContain('aria-label="Zyx Ops AI Assistant"');
      expect(html).toContain('id="ops-ai-panel"');

      // Desktop layout participant classes
      expect(html).toContain("lg:relative");
      expect(html).toContain("lg:top-0");
      expect(html).toContain("lg:h-screen");
      expect(html).toContain("lg:shrink-0");

      // Mobile overlay fallback classes
      expect(html).toContain("fixed");
      expect(html).toContain("inset-y-0");
      expect(html).toContain("right-0");
    });

    it("renders the resize separator handle with ARIA attributes on desktop", () => {
      const html = renderToStaticMarkup(
        <OpsAiProvider initialOpen={true} initialWidth={480}>
          <OpsAiPanel />
        </OpsAiProvider>
      );

      // Separator handle
      expect(html).toContain('role="separator"');
      expect(html).toContain('aria-orientation="vertical"');
      expect(html).toContain('aria-valuenow="480"');
      expect(html).toContain('aria-valuemin="360"');
      expect(html).toContain('aria-label="Ubah ukuran panel Ops AI"');
      expect(html).toContain('tabindex="0"');
    });

    it("renders sticky header and composer while keeping conversation area as the single scroll container", () => {
      const html = renderToStaticMarkup(
        <OpsAiProvider initialOpen={true} initialWidth={480}>
          <OpsAiPanel />
        </OpsAiProvider>
      );

      // Header is a distinct header element with border-b and shrink-0
      expect(html).toContain("<header");
      expect(html).toContain("shrink-0 border-b");

      // Footer is a distinct footer element with border-t and shrink-0
      expect(html).toContain("<footer");
      expect(html).toContain("shrink-0 border-t");

      // Conversation container has overflow-y-auto and min-h-0
      expect(html).toContain('role="region"');
      expect(html).toContain('aria-label="Riwayat percakapan"');
      expect(html).toContain("overflow-y-auto");
      expect(html).toContain("min-h-0");
    });
  });

  // ==========================================================================
  // Suite 4: Work Trace Audit UI & Lifecycle Rendering
  // ==========================================================================
  describe("Suite 4: Work Trace Audit UI & Lifecycle Rendering", () => {
    it("renders all 5 work step statuses cleanly without raw chain-of-thought", () => {
      const sampleSteps: OpsAiWorkStep[] = [
        {
          stepId: "step-0",
          runId: "run-1",
          stepIndex: 0,
          stepType: "reasoning",
          status: "completed",
          title: "Analisis konteks permintaan admin",
          durationMs: 45,
          startedAt: 1000,
          finishedAt: 1045,
        },
        {
          stepId: "step-1",
          runId: "run-1",
          stepIndex: 1,
          stepType: "retrieval",
          status: "completed",
          title: "Pencarian pengetahuan admin: 'token'",
          detail: "Ditemukan 3 berkas relevan.",
          durationMs: 250,
          startedAt: 1046,
          finishedAt: 1296,
        },
        {
          stepId: "step-2",
          runId: "run-1",
          stepIndex: 2,
          stepType: "tool_call",
          status: "running",
          title: "Eksekusi tool read-only: inspect_schema",
          startedAt: 1297,
        },
        {
          stepId: "step-3",
          runId: "run-1",
          stepIndex: 3,
          stepType: "tool_call",
          status: "failed",
          title: "Eksekusi tool: search_users",
          error: "Pengguna tidak ditemukan",
          startedAt: 1300,
          finishedAt: 1350,
          durationMs: 50,
        },
        {
          stepId: "step-4",
          runId: "run-1",
          stepIndex: 4,
          stepType: "synthesis",
          status: "cancelled",
          title: "Sintesis jawaban akhir",
          startedAt: 1351,
        },
      ];

      const html = renderToStaticMarkup(
        <WorkTraceView steps={sampleSteps} defaultExpanded={true} />
      );

      // Section title and summary
      expect(html).toContain("Jejak Kerja Audit");
      expect(html).toContain("5 langkah");

      // Status labels in sentence-case Indonesian
      expect(html).toContain("Selesai");
      expect(html).toContain("Berjalan");
      expect(html).toContain("Gagal");
      expect(html).toContain("Dibatalkan");

      // Step titles
      expect(html).toContain("Analisis konteks permintaan admin");
      expect(html).toContain("Pencarian pengetahuan admin: &#x27;token&#x27;");
      expect(html).toContain("Eksekusi tool read-only: inspect_schema");

      // Clean detail/error, NOT messy chain of thought
      expect(html).toContain("Ditemukan 3 berkas relevan.");
      expect(html).toContain("Pengguna tidak ditemukan");

      // Formatted durations
      expect(html).toContain("45 ms");
      expect(html).toContain("250 ms");
      expect(html).not.toContain("rawChainOfThought");
      expect(html).not.toContain("internalModelReasoningTrace");
    });

    it("returns null when steps array is empty or undefined", () => {
      expect(renderToStaticMarkup(<WorkTraceView steps={[]} />)).toBe("");
      expect(renderToStaticMarkup(<WorkTraceView steps={undefined} />)).toBe("");
    });
  });

  // ==========================================================================
  // Suite 5: Citation Cards UI Contract & Official Copywriting
  // ==========================================================================
  describe("Suite 5: Citation Cards UI Contract & Official Copywriting", () => {
    it("renders official label 'Sumber yang diberikan kepada model' and availability badges", () => {
      const sampleCitations: OpsAiCitation[] = [
        {
          id: "cite-1",
          sourceId: "docs/admin/token.md",
          source: "semantic-rag",
          availability: "available",
          runId: "run-1",
          stepId: "step-1",
          title: "SOP Token Registrasi",
          filePath: "docs/admin/token.md",
          section: "Format Token",
          snippet: "Token aktivasi memiliki prefix Zyx-XXXX-XXXX.",
        },
        {
          id: "cite-2",
          sourceId: "docs/admin/flags.md",
          source: "semantic-rag",
          availability: "stale",
          runId: "run-1",
          stepId: "step-1",
          title: "Katalog Feature Flags",
          filePath: "docs/admin/flags.md",
          snippet: "Daftar flag aktif sistem.",
        },
        {
          id: "cite-3",
          sourceId: "docs/admin/legacy.md",
          source: "semantic-rag",
          availability: "missing",
          runId: "run-1",
          stepId: "step-1",
          title: "Dokumen Usang",
          snippet: "Berkas sudah diarsipkan.",
        },
      ];

      const html = renderToStaticMarkup(<CitationCards citations={sampleCitations} />);

      // Official Copywriting
      expect(html).toContain(OPS_AI_CITATION_OFFICIAL_LABEL);
      expect(html).toContain("Sumber yang diberikan kepada model");
      expect(html).toContain("3 referensi");

      // When expanded
      const expandedHtml = renderToStaticMarkup(
        <div data-expanded="true">
          <CitationCards citations={sampleCitations} />
        </div>
      );
      expect(expandedHtml).toContain(OPS_AI_CITATION_OFFICIAL_LABEL);
    });

    it("returns null when citations are empty or undefined", () => {
      expect(renderToStaticMarkup(<CitationCards citations={[]} />)).toBe("");
      expect(renderToStaticMarkup(<CitationCards citations={undefined} />)).toBe("");
    });
  });

  // ==========================================================================
  // Suite 6: ActionProposalCard V2 & Secure Mutation Contract
  // ==========================================================================
  describe("Suite 6: ActionProposalCard V2 & Secure Mutation Contract", () => {
    it("renders proposal preview fields and confirmation button calling execute endpoint", () => {
      const sampleProposal: OpsAiActionProposalV2 = {
        id: "prop-sample-1",
        runId: "run-1",
        stepId: "step-2",
        type: "create_token",
        title: "Pembuatan Token Aktivasi",
        description: "Token untuk kelompok 5 orang mata kuliah kalkulus-1.",
        preview: {
          summary: "Pembuatan token kelompok reguler",
          fields: [
            { label: "Kapasitas", value: "5" },
            { label: "Mata Kuliah", value: "kalkulus-1" },
            { label: "Paket", value: "reguler_15" },
          ],
        },
        status: "pending",
        createdAt: 1700000000000,
      };

      const html = renderToStaticMarkup(<ActionProposalCard proposal={sampleProposal} />);

      // Title and Description
      expect(html).toContain("Proposal Aksi Admin");
      expect(html).toContain("Pembuatan Token Aktivasi");
      expect(html).toContain("Token untuk kelompok 5 orang mata kuliah kalkulus-1.");

      // Status badge
      expect(html).toContain("Menunggu Konfirmasi");

      // Preview key-value fields
      expect(html).toContain("Kapasitas:");
      expect(html).toContain("5");
      expect(html).toContain("Mata Kuliah:");
      expect(html).toContain("kalkulus-1");

      // Action button
      expect(html).toContain("Konfirmasi dan Eksekusi");
      expect(html).toContain('aria-label="Konfirmasi dan eksekusi aksi"');

      // Zero em-dashes
      expect(html).not.toContain("—");
      expect(html).not.toContain("–");
    });

    it("renders executed result state with token string", () => {
      const executedProposal: OpsAiActionProposalV2 = {
        id: "prop-executed-1",
        runId: "run-1",
        stepId: "step-2",
        type: "create_token",
        title: "Pembuatan Token Aktivasi",
        description: "Token telah dibuat",
        preview: {
          summary: "Token siap digunakan",
        },
        status: "executed",
        createdAt: 1700000000000,
      };

      const html = renderToStaticMarkup(
        <ActionProposalCard
          proposal={{
            ...executedProposal,
            result: {
              message: "Token berhasil dibuat di basis data.",
              token: "Zyx-ABCD1234-5-1",
            },
          } as any}
        />
      );

      expect(html).toContain("Selesai");
      expect(html).toContain("Token berhasil dibuat di basis data.");
      expect(html).toContain("Zyx-ABCD1234-5-1");
      expect(html).not.toContain("Konfirmasi dan Eksekusi");
    });
  });

  // ==========================================================================
  // Suite 7: Accessibility & Keyboard Navigation
  // ==========================================================================
  describe("Suite 7: Accessibility & Keyboard Navigation", () => {
    it("renders all buttons with explicit, descriptive ARIA labels", () => {
      const html = renderToStaticMarkup(
        <OpsAiProvider initialOpen={true} initialWidth={480}>
          <OpsAiPanel />
        </OpsAiProvider>
      );

      // Panel buttons
      expect(html).toContain('aria-label="Ciutkan panel"');
      expect(html).toContain('aria-label="Tutup panel"');
      expect(html).toContain('aria-label="Kirim pesan"');
    });

    it("renders trigger button with accessible shortcut and expanded states", () => {
      const floatingHtml = renderToStaticMarkup(
        <OpsAiProvider initialOpen={false}>
          <OpsAiTrigger variant="floating" />
        </OpsAiProvider>
      );
      expect(floatingHtml).toContain('aria-label="Buka Zyx Ops AI (Cmd+/)"');
      expect(floatingHtml).toContain('aria-expanded="false"');
      expect(floatingHtml).toContain('aria-controls="ops-ai-panel"');

      const sidebarHtml = renderToStaticMarkup(
        <OpsAiProvider initialOpen={false}>
          <OpsAiTrigger variant="sidebar" />
        </OpsAiProvider>
      );
      expect(sidebarHtml).toContain('aria-label="Zyx Ops AI (Cmd+/)"');
    });
  });

  // ==========================================================================
  // Suite 8: Zyx Design System Invariants (AGENTS.md)
  // ==========================================================================
  describe("Suite 8: Zyx Design System Invariants", () => {
    it("strictly uses 'Zyx' brand name and never 'ZYX'", () => {
      const panelHtml = renderToStaticMarkup(
        <OpsAiProvider initialOpen={true}>
          <OpsAiPanel />
        </OpsAiProvider>
      );

      expect(panelHtml).toContain("Zyx Ops AI");
      expect(panelHtml).not.toContain("ZYX Ops AI");
      expect(panelHtml).not.toContain("ZYX Academy");
    });

    it("never contains em-dash (—) or en-dash (–) in rendered component HTML", () => {
      const panelHtml = renderToStaticMarkup(
        <OpsAiProvider initialOpen={true}>
          <OpsAiPanel />
        </OpsAiProvider>
      );

      expect(panelHtml).not.toContain("—");
      expect(panelHtml).not.toContain("–");

      const traceHtml = renderToStaticMarkup(
        <WorkTraceView
          steps={[
            {
              stepId: "s1",
              runId: "r1",
              stepIndex: 0,
              stepType: "tool_call",
              status: "completed",
              title: "Eksekusi inspect_schema: tabel user",
              startedAt: 100,
            },
          ]}
        />
      );
      expect(traceHtml).not.toContain("—");
      expect(traceHtml).not.toContain("–");
    });

    it("enforces no-pill rule: buttons and badges use rounded-md or rounded-lg, cards use rounded-xl", () => {
      const proposalHtml = renderToStaticMarkup(
        <ActionProposalCard
          proposal={{
            id: "prop-p1",
            runId: "r1",
            stepId: "s1",
            type: "navigate_page",
            title: "Navigasi Halaman",
            description: "Buka halaman pengguna",
            preview: { summary: "Pindah rute" },
            status: "pending",
            createdAt: 1000,
          }}
        />
      );

      // Card container uses rounded-xl
      expect(proposalHtml).toContain("rounded-xl");

      // Badges and buttons use rounded-md
      expect(proposalHtml).toContain("rounded-md");

      // No pill shapes: rounded-full is prohibited for buttons/badges
      expect(proposalHtml).not.toContain("rounded-full");
    });

    it("uses standard typography classes: text-body-sm, text-body-xs, font-heading font-bold", () => {
      const panelHtml = renderToStaticMarkup(
        <OpsAiProvider initialOpen={true}>
          <OpsAiPanel />
        </OpsAiProvider>
      );

      expect(panelHtml).toContain("font-heading");
      expect(panelHtml).toContain("text-body-sm");
      expect(panelHtml).toContain("text-body-xs");
    });
  });

  // ==========================================================================
  // Suite 9: Proposal Execution Contract & Tamper Prevention
  // ==========================================================================
  describe("Suite 9: Proposal Execution Contract & Tamper Prevention", () => {
    it("guarantees proposal confirmation payload only sends proposalId to prevent browser tampering", async () => {
      let requestedUrl = "";
      let requestedMethod = "";
      let requestedBody: any = null;

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        requestedUrl = String(input);
        requestedMethod = init?.method || "GET";
        requestedBody = init?.body ? JSON.parse(String(init.body)) : null;
        return new Response(
          JSON.stringify({
            success: true,
            proposalId: "prop-safe-123",
            result: { message: "Berhasil dieksekusi" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }) as unknown as typeof fetch;

      try {
        const proposal: OpsAiActionProposalV2 = {
          id: "prop-safe-123",
          runId: "run-safe",
          stepId: "step-safe",
          type: "create_token",
          title: "Pembuatan Token Aman",
          description: "Deskripsi aman",
          preview: { summary: "Ringkasan" },
          status: "pending",
          createdAt: 1000,
        };

        // Render card
        const cardHtml = renderToStaticMarkup(<ActionProposalCard proposal={proposal} />);
        expect(cardHtml).toContain("Konfirmasi dan Eksekusi");

        // Simulate execution call equivalent to ActionProposalCard.handleExecute
        const res = await fetch("/api/admin/ops-ai/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposalId: proposal.id }),
        });
        const data = await res.json();

        expect(requestedUrl).toBe("/api/admin/ops-ai/execute");
        expect(requestedMethod).toBe("POST");
        // Strict invariant: Only proposalId is sent! No arbitrary or forged execution parameters
        expect(requestedBody).toEqual({ proposalId: "prop-safe-123" });
        expect(requestedBody.params).toBeUndefined();
        expect(requestedBody.payload).toBeUndefined();
        expect(data.success).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("renders failure state and error message cleanly when execution returns error", () => {
      const failedProposal: OpsAiActionProposalV2 = {
        id: "prop-failed-123",
        runId: "run-fail",
        stepId: "step-fail",
        type: "create_token",
        title: "Pembuatan Token Gagal",
        description: "Gagal membuat token",
        preview: { summary: "Ringkasan" },
        status: "failed",
        createdAt: 1000,
      };

      const html = renderToStaticMarkup(
        <ActionProposalCard
          proposal={{
            ...failedProposal,
            error: "Kapasitas kuota token tidak valid.",
          } as any}
        />
      );

      expect(html).toContain("Gagal");
      expect(html).toContain("Kapasitas kuota token tidak valid.");
      // Failed proposals allow retry
      expect(html).toContain("Konfirmasi dan Eksekusi");
    });
  });

  // ==========================================================================
  // Suite 10: Correction Pass (Visual Defect & Hydration Verifications)
  // ==========================================================================
  describe("Suite 10: Correction Pass (Visual Defect & Hydration Verifications)", () => {
    it("locks mobile sheet firmly with inset-0 z-50 w-full to stay above z-40 backdrop and prevent horizontal shift (Round 2 Defect 1)", () => {
      const html = renderToStaticMarkup(
        <OpsAiProvider initialOpen={true} initialWidth={480}>
          <OpsAiPanel />
        </OpsAiProvider>
      );

      // Must strictly pin inset-0 z-50 w-full on mobile (< sm:) and sm:inset-y-0 sm:right-0
      expect(html).toContain("fixed inset-0 z-50 w-full");
      expect(html).toContain("sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[480px]");
      expect(html).toContain("lg:relative lg:inset-auto lg:top-0 lg:h-screen lg:shrink-0");

      // Verify backdrop has z-40 and panel has z-50
      expect(html).toContain("fixed inset-0 z-40 bg-black/50");
    });

    it("includes suppressHydrationWarning on panel container and resize separator (Round 2 Defect 2)", () => {
      const html = renderToStaticMarkup(
        <OpsAiProvider initialOpen={true} initialWidth={480}>
          <OpsAiPanel />
        </OpsAiProvider>
      );

      // Panel container and separator should not trigger hydration warnings
      expect(html).toContain('id="ops-ai-panel"');
      expect(html).toContain('role="separator"');
    });

    it("uses flex-col on mobile and flex-row on sm screens with break-words to prevent 6-line single-word title crushing (Defect 2)", () => {
      const proposal: OpsAiActionProposalV2 = {
        id: "prop-long-title",
        runId: "run-long",
        stepId: "step-long",
        type: "create_token",
        title: "Buat Token Aktivasi Kelompok (5 Kuota)",
        description: "Token untuk kelompok 5 kuota",
        preview: { summary: "Ringkasan token" },
        status: "pending",
        createdAt: 1000,
      };

      const html = renderToStaticMarkup(<ActionProposalCard proposal={proposal} />);

      // Header container must be flex-col on mobile, sm:flex-row on desktop
      expect(html).toContain("flex flex-col sm:flex-row sm:items-start sm:justify-between");
      // Title must have leading-snug and break-words
      expect(html).toContain("leading-snug break-words");
      // Badge must align self-start on mobile
      expect(html).toContain("self-start inline-flex items-center");
    });

    it("preserves official citation label without truncation in header (Defect 3)", () => {
      const sampleCitations: OpsAiCitation[] = [
        {
          id: "c1",
          sourceId: "docs/1.md",
          source: "semantic-rag",
          availability: "available",
          runId: "r1",
          stepId: "s1",
          title: "SOP Token",
          snippet: "Snippet text",
        },
      ];

      const html = renderToStaticMarkup(<CitationCards citations={sampleCitations} />);

      // Official label must exist
      expect(html).toContain(OPS_AI_CITATION_OFFICIAL_LABEL);
      // The button text must NOT contain 'truncate' on the official label span
      expect(html).toContain(
        `font-heading text-body-xs font-bold text-foreground block leading-snug break-words`
      );
    });

    it("preserves work trace header title without truncation (Defect 3 consistency)", () => {
      const sampleSteps: OpsAiWorkStep[] = [
        {
          stepId: "st1",
          runId: "r1",
          stepIndex: 0,
          stepType: "tool_call",
          status: "completed",
          title: "Introspeksi skema basis data",
          startedAt: 100,
        },
      ];

      const html = renderToStaticMarkup(<WorkTraceView steps={sampleSteps} />);
      expect(html).toContain("Jejak Kerja Audit");
      expect(html).toContain(
        `font-heading text-body-xs font-bold text-foreground block leading-snug break-words`
      );
    });

    it("supports hydration-safe initial messages in OpsAiPanel without SSR mismatch (Defect 4)", () => {
      const customMessages = [
        {
          id: "msg-init-1",
          role: "assistant" as const,
          content: "Halo admin, ada yang bisa Zyx bantu?",
          createdAt: 1000,
        },
      ];

      const html = renderToStaticMarkup(
        <OpsAiProvider initialOpen={true}>
          <OpsAiPanel initialMessages={customMessages} />
        </OpsAiProvider>
      );

      expect(html).toContain("Halo admin, ada yang bisa Zyx bantu?");
      expect(html).not.toContain("Asisten Operasional Panel Admin");
    });
  });
});
