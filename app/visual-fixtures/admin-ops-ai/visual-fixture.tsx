"use client";

import React, { useEffect } from "react";
import { OpsAiProvider, useOpsAiContext } from "@/components/admin/ops-ai/ops-ai-context";
import { OpsAiPanel } from "@/components/admin/ops-ai/ops-ai-panel";
import { OpsAiTrigger } from "@/components/admin/ops-ai/ops-ai-trigger";
import { AdminStatStrip, AdminStatStripItem } from "@/components/admin/stat-card";
import {
  saveOpsAiMessages,
  saveOpsAiOpenPreference,
  saveOpsAiWidthPreference,
  type OpsAiMessageV2,
} from "@/components/admin/ops-ai/ops-ai-storage";

interface FixtureProps {
  state: string;
  initialWidth?: number;
}

function FixtureContent({ state }: { state: string }) {
  const { openPanel, closePanel, setWidth } = useOpsAiContext();

  useEffect(() => {
    if (state === "closed") {
      closePanel();
      saveOpsAiOpenPreference(false);
      return;
    }

    openPanel();
    saveOpsAiOpenPreference(true);

    if (state === "min-width") {
      setWidth(360);
      saveOpsAiWidthPreference(360);
    } else if (state === "wide-width") {
      setWidth(640);
      saveOpsAiWidthPreference(640);
    }

    if (state === "empty") {
      saveOpsAiMessages([]);
    } else if (state === "worktrace") {
      const mockMsg: OpsAiMessageV2 = {
        id: "msg-trace-1",
        role: "assistant",
        content: "Saya sedang memeriksa skema dan log operasional sistem.",
        createdAt: Date.now() - 5000,
        workSteps: [
          {
            stepId: "step-1",
            runId: "run-fixture",
            stepIndex: 0,
            stepType: "reasoning",
            status: "completed",
            title: "Analisis konteks permintaan admin",
            detail: "Membaca konteks rute aktif /admin dan parameter yang diberikan.",
            startedAt: Date.now() - 5000,
            finishedAt: Date.now() - 4800,
            durationMs: 200,
          },
          {
            stepId: "step-2",
            runId: "run-fixture",
            stepIndex: 1,
            stepType: "retrieval",
            status: "completed",
            title: "Pencarian pengetahuan admin: 'token aktivasi'",
            detail: "Ditemukan 3 potongan dokumen relevan pada namespace admin_ops_knowledge.",
            startedAt: Date.now() - 4800,
            finishedAt: Date.now() - 4200,
            durationMs: 600,
          },
          {
            stepId: "step-3",
            runId: "run-fixture",
            stepIndex: 2,
            stepType: "tool_call",
            status: "running",
            title: "Eksekusi tool read-only: inspect_schema",
            startedAt: Date.now() - 4200,
          },
        ],
      };
      saveOpsAiMessages([mockMsg]);
    } else if (state === "citations") {
      const mockMsg: OpsAiMessageV2 = {
        id: "msg-cite-1",
        role: "assistant",
        content:
          "Berdasarkan dokumentasi resmi Zyx Academy [1], format token aktivasi menggunakan pola `Zyx-XXXXXXXX-{capacity}-{courseIds.length}` [2]. Token ini memiliki masa berlaku default 30 hari.",
        createdAt: Date.now() - 10000,
        citations: [
          {
            id: "cite-1",
            sourceId: "docs/architecture.md",
            source: "semantic-rag",
            availability: "available",
            runId: "run-fixture",
            stepId: "step-1",
            title: "Arsitektur Sistem Token Aktivasi",
            filePath: "docs/ARCHITECTURE.md",
            section: "Token Generation & Verification",
            snippet: "Token aktivasi diterbitkan dengan prefix resmi Zyx dan kapasitas kelompok terikat.",
            timestamp: Date.now(),
          },
          {
            id: "cite-2",
            sourceId: "docs/agents.md",
            source: "semantic-rag",
            availability: "stale",
            runId: "run-fixture",
            stepId: "step-2",
            title: "Daftar Aturan Naming Zyx Academy",
            filePath: "AGENTS.md",
            section: "Naming and writing",
            snippet: "Format token prefixes use Zyx-XXXXXXXX-{capacity}-{courseIds.length}.",
            timestamp: Date.now(),
          },
        ],
      };
      saveOpsAiMessages([mockMsg]);
    } else if (state === "proposal") {
      const mockMsg: OpsAiMessageV2 = {
        id: "msg-prop-1",
        role: "assistant",
        content:
          "Saya telah menyiapkan proposal pembuatan token aktivasi untuk mata kuliah Matematika I dan Kalkulus dengan kapasitas 5 siswa. Silakan tinjau dan konfirmasi melalui kartu aksi di bawah.",
        createdAt: Date.now() - 20000,
        proposals: [
          {
            id: "prop-sample-token-123",
            runId: "run-fixture",
            stepId: "step-prop",
            type: "create_token",
            title: "Buat Token Aktivasi Kelompok (5 Kuota)",
            description: "Membuat token baru untuk mata kuliah Matematika I dan Kalkulus.",
            preview: {
              summary: "Token pendaftaran kelompok 5 kuota dengan paket reguler_15.",
              fields: [
                { label: "Mata Kuliah", value: "matematika-1, kalkulus-1" },
                { label: "Kapasitas", value: "5 orang" },
                { label: "Paket", value: "reguler_15" },
                { label: "Masa Berlaku", value: "30 hari" },
              ],
            },
            status: "pending",
            createdAt: Date.now() - 60000,
            expiresAt: Date.now() + 1800000,
          },
        ],
      };
      saveOpsAiMessages([mockMsg]);
    } else if (state === "error") {
      const mockMsg: OpsAiMessageV2 = {
        id: "msg-err-1",
        role: "assistant",
        content: "Maaf, terjadi kesalahan saat menghubungi layanan AI.",
        createdAt: Date.now() - 3000,
        error: {
          code: "PROVIDER_UNAVAILABLE",
          message: "Layanan AI sedang mengalami penurunan performa.",
          retryable: true,
          timestamp: Date.now(),
        },
      };
      saveOpsAiMessages([mockMsg]);
    }
  }, [state, openPanel, closePanel, setWidth]);

  return (
    <div className="relative flex min-h-screen flex-row overflow-x-clip bg-background text-foreground font-sans">
      {/* Mock Admin Sidebar */}
      <aside className="w-64 border-r border-border bg-card p-4 hidden lg:flex flex-col justify-between shrink-0">
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="size-6 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs">
              Z
            </div>
            <span className="font-heading text-body-sm font-bold">Zyx Admin</span>
          </div>
          <nav className="space-y-1 text-body-sm">
            <div className="rounded-md bg-muted px-3 py-2 font-medium">Dashboard</div>
            <div className="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted/50">Mata Kuliah</div>
            <div className="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted/50">Token Aktivasi</div>
            <div className="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted/50">Pengguna</div>
            <div className="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted/50">Feature Flags</div>
          </nav>
        </div>
        <div className="border-t border-border pt-3">
          <OpsAiTrigger variant="sidebar" />
        </div>
      </aside>

      {/* Main Admin Content: Must shrink smoothly when OpsAiPanel expands */}
      <main
        id="main-content"
        tabIndex={-1}
        className="relative z-10 min-w-0 flex-1 px-4 py-8 focus:outline-none sm:px-6 lg:px-8 transition-[width] duration-75 space-y-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-h5 text-foreground">Ringkasan Operasional</h1>
            <p className="text-body-xs text-muted-foreground">Panel monitoring sistem dan data akademik Zyx.</p>
          </div>
          <OpsAiTrigger variant="header" />
        </div>

        {/* Mock KPI Stat Strip */}
        <AdminStatStrip className="sm:grid-cols-2 xl:grid-cols-4">
          <AdminStatStripItem label="Total pengguna" value="1.420" caption="+12% minggu ini" />
          <AdminStatStripItem label="Mata kuliah aktif" value="18" caption="4 semester berjalan" />
          <AdminStatStripItem label="Token digunakan" value="342 / 500" caption="68.4% rasio aktivasi" />
          <AdminStatStripItem label="Pencarian knowledge" value="89" caption="Vectorize terisolasi" />
        </AdminStatStrip>

        {/* Mock Content Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border font-heading text-body-sm font-bold">
            Aktivitas Terkini
          </div>
          <div className="divide-y divide-border text-body-sm">
            <div className="px-4 py-3 flex items-center justify-between">
              <span>Token Zyx-MTH1-005 dibuat oleh admin</span>
              <span className="text-body-xs text-muted-foreground">5 menit lalu</span>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <span>Sinkronisasi dokumen operasional 4 chunks</span>
              <span className="text-body-xs text-muted-foreground">1 jam lalu</span>
            </div>
            <div className="px-4 py-3 flex items-center justify-between">
              <span>Feature flag FEATURE_PKA diaktifkan</span>
              <span className="text-body-xs text-muted-foreground">3 jam lalu</span>
            </div>
          </div>
        </div>
      </main>

      {/* Floating Trigger Button */}
      <OpsAiTrigger variant="floating" />

      {/* Ops AI Desktop Participant / Mobile Overlay */}
      <OpsAiPanel />
    </div>
  );
}

export function AdminOpsAiVisualFixture({ state, initialWidth }: FixtureProps) {
  const isOpen = state !== "closed";
  const effectiveWidth =
    state === "min-width" ? 360 : state === "wide-width" ? 640 : initialWidth;

  return (
    <OpsAiProvider initialOpen={isOpen} initialWidth={effectiveWidth}>
      <FixtureContent state={state} />
    </OpsAiProvider>
  );
}
