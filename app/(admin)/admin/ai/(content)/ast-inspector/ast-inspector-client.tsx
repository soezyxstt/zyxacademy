"use client";

import React, { useState, useEffect } from "react";
import { toast } from "@/components/ui/toast";
import { 
  Terminal, 
  FileCode, 
  CheckCircle, 
  AlertTriangle, 
  AlertCircle, 
  RefreshCw, 
  Layers, 
  Play, 
  Upload, 
  Download, 
  List, 
  Eye, 
  BookOpen
} from "lucide-react";
import { cn } from "@/lib/utils";
import { compileMarkdown } from "@/lib/markdown-compiler";
import { ASTRenderer } from "@/components/course/markdown-renderer";
import { CompilerResult, ASTBlock } from "@/lib/ast-validator";

// Demos
const DEMO_TEMPLATES = {
  standard: `# Limit Fungsi Aljabar

:::learning_objective {bloomLevel=understand}
- Memahami definisi limit fungsi aljabar secara intuitif.
- Menghitung nilai limit fungsi aljabar menggunakan metode substitusi.
:::

Di kelas matematika kali ini kita akan mempelajari konsep [[Limit]].

:::concept {koId=limit-def}
title: Definisi Limit
Limit fungsi adalah nilai hampiran yang didekati oleh fungsi ketika variabelnya mendekati nilai tertentu.
:::

:::formula {title="Rumus Limit Dasar" koId=limit-eq}
$$\\lim_{x \\to c} f(x) = L$$
- c | Keterangan | Nilai pendekatan variabel x
- L | Keterangan | Nilai limit fungsi f(x)
Interpretasi:
Ketika x bergerak mendekati c dari kedua arah kiri dan kanan, nilai fungsi f(x) bergerak mendekati L.
:::

:::engineering_insight {discipline=general}
title: Penerapan Limit di Teknik Sipil
Limit digunakan dalam analisis lendutan maksimum jembatan beton di bawah beban lalu lintas statis.
:::

:::glossary_term {term="Limit"}
Nilai batas yang didekati oleh suatu fungsi matematika seiring dengan variabel bebasnya mendekati suatu titik tertentu.
:::
`,

  leakage: `# Leakage Test (Math Leakage Heuristics)

:::concept {koId=leak-concept}
title: Konsep Kebocoran Rumus
Di dalam konsep ini kita menulis persamaan y = mx + c secara langsung tanpa blok formula. Ini Level 2 & 3 deteksi.
Juga jika kita menulis f(x) = \\frac{a}{b} maka deteksi Level 1 langsung memicu kebocoran karena adanya keyword \\\\frac.

Hal-hal seperti nilai_a = nilai_b atau file_name = test_file tidak boleh memicu kebocoran karena tidak berada dalam konteks matematika yang valid.
:::
`,

  visual: `# Alur Pembelajaran Matematika

:::concept {koId=belajar-mat}
title: Konsep Alur
Berikut adalah visualisasi diagram alur persiapan ujian matematika. Kita mereferensikan diagram ini dengan tag [[visual:persiapan-ujian]].
:::

:::flowchart {id="persiapan-ujian" title="Alur Persiapan Ujian" caption="Siklus belajar Zyx"}
Langkah 1: Baca MTD --> Langkah 2: Latihan Soal
Langkah 2: Latihan Soal -- Sukses --> Langkah 3: Ikuti Tryout
Langkah 2: Latihan Soal -- Gagal --> Langkah 1: Baca MTD
:::
`
};

export function ASTInspectorClient() {
  const [markdown, setMarkdown] = useState(DEMO_TEMPLATES.standard);
  const [result, setResult] = useState<CompilerResult | null>(null);
  const [activeTab, setActiveTab] = useState<"preview" | "block-explorer" | "diagnostics" | "json" | "pipeline" | "stats">("preview");
  const [expandedBlocks, setExpandedBlocks] = useState<Record<string, boolean>>({});

  const handleCompile = () => {
    try {
      const res = compileMarkdown(markdown, "chapter-debug", "course-debug");
      setResult(res);
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    handleCompile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTemplate = (key: keyof typeof DEMO_TEMPLATES) => {
    setMarkdown(DEMO_TEMPLATES[key]);
    // Run compile immediately on next tick
    setTimeout(() => {
      try {
        const res = compileMarkdown(DEMO_TEMPLATES[key], "chapter-debug", "course-debug");
        setResult(res);
      } catch (err) {
        console.error(err);
      }
    }, 0);
  };

  const toggleBlock = (blockId: string) => {
    setExpandedBlocks(prev => ({
      ...prev,
      [blockId]: !prev[blockId]
    }));
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const imported = JSON.parse(text);
        if (imported.markdown) {
          setMarkdown(imported.markdown);
          if (imported.compilerResult) {
            setResult(imported.compilerResult);
          } else {
            handleCompile();
          }
        } else if (imported.blocks) {
          // It's a raw AST
          setResult({
            ast: imported,
            diagnostics: [],
            stats: {
              conceptCount: 0, formulaCount: 0, glossaryCount: 0, visualCount: 0,
              graphCount: 0, diagramCount: 0, flowchartCount: 0, readingTime: 0,
              averageConceptLength: 0, averageFormulaLength: 0, averageVisualDistance: 0,
              averageGlossaryReferenceCount: 0,
              quality: { score: 100, breakdown: { glossaryCoverage: 100, visualCoverage: 100, formulaAtomization: 100, visualReferenceCoverage: 100 } }
            }
          });
        }
      } catch (err: any) {
        toast.error("Gagal mengimpor file: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleExport = () => {
    if (!result) return;
    const exportData = {
      markdown,
      compilerResult: result,
      compiledAt: new Date().toISOString(),
      compilerVersion: "2.1.0",
      schemaVersion: "1.0.0"
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `compiled-material-${result.ast.documentMetadata.title.toLowerCase().replace(/\s+/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getBlockSummary = (block: ASTBlock) => {
    switch (block.type) {
      case "p":
        return block.content.slice(0, 60) + (block.content.length > 60 ? "..." : "");
      case "h":
        return `Level ${block.level}: ${block.content}`;
      case "concept":
        return block.content.title;
      case "formula":
        return block.content.title || block.content.latex.slice(0, 40);
      case "visual":
        return `[${block.visualType.toUpperCase()}] ${block.title || block.id}`;
      case "glossary_term":
        return block.content.term;
      case "learning_objective":
        return `Objectives: ${block.content.objectives.length}`;
      default:
        return block.type;
    }
  };

  return (
    <div className="mx-auto w-full px-4 sm:px-6">
      <div className="flex flex-col h-[calc(100vh-250px)] bg-background text-foreground overflow-hidden font-sans border border-border rounded-xl shadow-xs">
        {/* DUAL PANE */}
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT PANE: EDITOR */}
          <div className="w-1/2 flex flex-col border-r border-border bg-card/10">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-muted/40 border-b border-border">
              <span className="text-xs font-mono font-semibold text-muted-foreground flex items-center gap-1.5">
                <Terminal className="size-3.5" />
                <span>canonical-markdown.md</span>
              </span>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-body-xs text-muted-foreground font-medium">Demo:</span>
                <button
                  type="button"
                  onClick={() => loadTemplate("standard")}
                  className="px-2 py-1 rounded-md border border-border text-body-xs font-medium hover:bg-muted bg-background transition-colors cursor-pointer"
                >
                  Standard
                </button>
                <button
                  type="button"
                  onClick={() => loadTemplate("leakage")}
                  className="px-2 py-1 rounded-md border border-border text-body-xs font-medium hover:bg-muted bg-background transition-colors cursor-pointer"
                >
                  Leakage
                </button>
                <button
                  type="button"
                  onClick={() => loadTemplate("visual")}
                  className="px-2 py-1 rounded-md border border-border text-body-xs font-medium hover:bg-muted bg-background transition-colors cursor-pointer"
                >
                  Visual
                </button>

                <div className="w-px h-4 bg-border mx-1" />

                <label className="flex items-center gap-1 px-2 py-1 rounded-md border border-border text-body-xs font-medium hover:bg-muted bg-background cursor-pointer transition-colors">
                  <Upload className="size-3" />
                  <span>Import</span>
                  <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                </label>

                <button
                  type="button"
                  onClick={handleExport}
                  disabled={!result}
                  className="flex items-center gap-1 px-2 py-1 rounded-md border border-border text-body-xs font-medium hover:bg-muted bg-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <Download className="size-3" />
                  <span>Export</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleCompile}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-brand-primary text-white text-body-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
              >
                <Play className="size-3" />
                <span>Compile</span>
              </button>
            </div>
            <div className="flex-1 p-4 overflow-hidden relative">
              <textarea
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                className="w-full h-full p-4 font-mono text-body-sm leading-relaxed bg-zinc-950 text-zinc-100 dark:bg-zinc-900/40 rounded-xl border border-border/80 focus:outline-none focus:ring-1 focus:ring-brand-primary resize-none overflow-y-auto"
                placeholder="Tulis canonical markdown di sini..."
              />
            </div>
          </div>

        {/* RIGHT PANE: VIEWER */}
        <div className="w-1/2 flex flex-col bg-background">
          {/* TABS */}
          <div className="flex items-center border-b border-border bg-muted/20 px-2 overflow-x-auto select-none">
            {[
              { id: "preview", label: "Live Preview", icon: <Eye className="size-3.5" /> },
              { id: "block-explorer", label: "Block Explorer", icon: <List className="size-3.5" /> },
              { id: "diagnostics", label: "Diagnostics", icon: <AlertTriangle className="size-3.5" /> },
              { id: "json", label: "AST JSON", icon: <FileCode className="size-3.5" /> },
              { id: "pipeline", label: "Pipeline", icon: <Layers className="size-3.5" /> },
              { id: "stats", label: "Stats & Kualitas", icon: <BookOpen className="size-3.5" /> },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-3 text-body-xs font-semibold border-b-2 transition-all",
                  activeTab === t.id
                    ? "border-brand-primary text-brand-primary bg-background/50"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* TAB CONTENTS */}
          <div className="flex-1 overflow-y-auto p-6">
            {!result ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <RefreshCw className="size-8 animate-spin mb-2" />
                <p className="text-body-sm">Belum ada hasil kompilasi. Jalankan Compile.</p>
              </div>
            ) : (
              <>
                {/* 1. LIVE PREVIEW */}
                {activeTab === "preview" && (
                  <div className="max-w-3xl mx-auto">
                    <ASTRenderer blocks={result.ast.blocks} />
                  </div>
                )}

                {/* 2. BLOCK EXPLORER (Point 6) */}
                {activeTab === "block-explorer" && (
                  <div className="space-y-3">
                    <h3 className="font-heading text-body-base font-bold mb-4">Sequential Block Explorer</h3>
                    {result.ast.blocks.map((block, idx) => {
                      const isExpanded = !!expandedBlocks[block.id];
                      const isCanonical = ![
                        "p", "h", "list", "blockquote", "table", "code", "hr"
                      ].includes(block.type);

                      return (
                        <div 
                          key={block.id || idx} 
                          className="border border-border/80 rounded-xl bg-card overflow-hidden shadow-2xs"
                        >
                          <div 
                            onClick={() => toggleBlock(block.id)}
                            className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 cursor-pointer select-none"
                          >
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-body-xs text-muted-foreground w-8">
                                [{block.globalOrderIndex}]
                              </span>
                              <span className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                isCanonical 
                                  ? "bg-brand-primary/15 text-brand-primary" 
                                  : "bg-zinc-500/15 text-zinc-500"
                              )}>
                                {block.type}
                              </span>
                              <span className="text-body-sm font-semibold text-foreground truncate max-w-md">
                                {getBlockSummary(block)}
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {isExpanded ? "Sembunyikan" : "Tampilkan JSON"}
                            </span>
                          </div>

                          {isExpanded && (
                            <div className="border-t border-border bg-zinc-950 p-4 overflow-x-auto">
                              <pre className="font-mono text-[11px] text-zinc-200">
                                {JSON.stringify(block, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 3. DIAGNOSTICS */}
                {activeTab === "diagnostics" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-heading text-body-base font-bold">Kepatuhan & Diagnostik</h3>
                      <span className={cn(
                        "px-2.5 py-1 rounded text-body-xs font-bold",
                        result.diagnostics.some(d => d.severity === "error")
                          ? "bg-status-error/15 text-status-error"
                          : result.diagnostics.some(d => d.severity === "warning")
                          ? "bg-status-warning/15 text-status-warning"
                          : "bg-status-success/15 text-status-success"
                      )}>
                        {result.diagnostics.length} Diagnostik ditemukan
                      </span>
                    </div>

                    {result.diagnostics.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-8 border border-dashed border-border rounded-xl bg-card text-center">
                        <CheckCircle className="size-8 text-status-success mb-2" />
                        <h4 className="font-bold text-body-sm text-foreground">Dokumen Sempurna</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">Tidak ada kesalahan struktural maupun kebocoran rumus.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {result.diagnostics.map((diag, idx) => (
                          <div 
                            key={idx} 
                            className={cn(
                              "p-4 rounded-xl border flex gap-3.5 leading-relaxed shadow-3xs",
                              diag.severity === "error" 
                                ? "border-status-error/20 bg-status-error/5 text-rose-950 dark:text-rose-50"
                                : diag.severity === "warning"
                                ? "border-status-warning/20 bg-status-warning/5 text-amber-950 dark:text-amber-50"
                                : "border-blue-500/20 bg-blue-500/5 text-blue-900 dark:text-blue-100"
                            )}
                          >
                            {diag.severity === "error" ? (
                              <AlertCircle className="size-5 text-status-error shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle className="size-5 text-status-warning shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1 text-left">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={cn(
                                  "text-[10px] font-bold uppercase font-heading tracking-wider",
                                  diag.severity === "error" ? "text-status-error" : "text-status-warning"
                                )}>
                                  {diag.severity}
                                </span>
                                <span className="text-xs font-mono text-muted-foreground">
                                  [{diag.code}]
                                </span>
                              </div>
                              <p className="text-body-sm font-semibold text-foreground">
                                {diag.message}
                              </p>
                              {diag.blockId && (
                                <p className="text-[11px] text-muted-foreground font-mono mt-1">
                                  Block ID: {diag.blockId}
                                </p>
                              )}
                              {diag.recommendation && (
                                <div className="mt-3 p-3 rounded-lg bg-background border border-border/80 text-body-xs text-foreground/90 font-sans">
                                  <strong className="text-brand-primary block mb-0.5">Rekomendasi Auto-Fix:</strong>
                                  {diag.recommendation}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 4. AST JSON */}
                {activeTab === "json" && (
                  <div className="relative">
                    <div className="absolute top-2 right-2 z-10">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(result.ast, null, 2));
                          toast.success("AST JSON berhasil disalin!");
                        }}
                        className="px-2 py-1.2 rounded bg-card hover:bg-muted border border-border text-[10px] font-semibold"
                      >
                        Salin JSON
                      </button>
                    </div>
                    <pre className="p-4 bg-zinc-950 text-zinc-100 dark:bg-zinc-900/40 rounded-xl border border-border overflow-x-auto text-[11px] font-mono leading-relaxed">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </div>
                )}

                {/* 5. PIPELINE VIEWER (Point 7) */}
                {activeTab === "pipeline" && (
                  <div className="space-y-6">
                    <h3 className="font-heading text-body-base font-bold mb-4">Compiler Pipeline Progression</h3>
                    {[
                      { 
                        title: "1. Parse Phase", 
                        desc: `Memecah berkas markdown mentah menjadi ${result.ast.blocks.length} blok AST mentah.`, 
                        status: "Selesai", 
                        details: "Parsing markdown token menggunakan regex ::: dan presenter markdown standard." 
                      },
                      { 
                        title: "2. Normalize Phase", 
                        desc: "Menormalisasi flowchart step numbers (e.g. Langkah 1 -> stepNumber: 1).", 
                        status: "Selesai", 
                        details: "Menyaring nama node, membersihkan label teks, dan mengekstrak relasi diagram." 
                      },
                      { 
                        title: "3. Validate Phase", 
                        desc: "Validasi data terstruktur menggunakan Zod schema di WebsiteMaterialASTSchema.", 
                        status: result.diagnostics.some(d => d.code === "AST_SCHEMA_VALIDATION_FAILED") ? "Gagal" : "Valid", 
                        details: "Melakukan verifikasi tipe data, bounds check parameter rumus, dan struktur Zod." 
                      },
                      { 
                        title: "4. Diagnostics Phase", 
                        desc: "Static analysis: leak checks, validasi glosarium, dan visual block distance.", 
                        status: `${result.diagnostics.length} Diagnostik`, 
                        details: `Menjalankan deteksi leakage level 3, validitas target [[visual:id]], dan checking [[term]] glosarium.` 
                      },
                      { 
                        title: "5. Stats Phase", 
                        desc: "Kalkulasi metrics, reading time, dan quality score breakdown.", 
                        status: `Score: ${result.stats.quality.score}/100`, 
                        details: `Menghitung Concept Length (${result.stats.averageConceptLength}ch) dan Glossary Coverage (${result.stats.quality.breakdown.glossaryCoverage}%).` 
                      },
                    ].map((step, idx) => (
                      <div key={idx} className="flex gap-4 items-start relative pb-6 last:pb-0">
                        {idx < 4 && (
                          <div className="absolute left-[17px] top-[30px] bottom-0 w-0.5 bg-border" />
                        )}
                        <div className="size-9 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-body-sm font-mono shrink-0 select-none z-10">
                          {idx + 1}
                        </div>
                        <div className="flex-1 bg-card border border-border p-4 rounded-xl shadow-3xs text-left">
                          <div className="flex items-center justify-between mb-1.5">
                            <h4 className="font-heading text-body-sm font-bold text-foreground">{step.title}</h4>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground select-none">
                              {step.status}
                            </span>
                          </div>
                          <p className="text-body-sm text-foreground/80 mb-2">{step.desc}</p>
                          <p className="text-body-xs text-muted-foreground font-mono bg-background/50 p-2 rounded-lg border border-border/40">
                            {step.details}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 6. STATS & TRANSPARENT QUALITY (Point 3 & 5) */}
                {activeTab === "stats" && (
                  <div className="space-y-6 text-left">
                    {/* Quality Score Header */}
                    <div className="bg-card border border-border rounded-xl p-6 shadow-2xs flex flex-col md:flex-row items-center gap-6 justify-between">
                      <div className="space-y-1">
                        <h4 className="font-heading text-body-lg font-bold text-foreground">Transparent Quality Score</h4>
                        <p className="text-body-sm text-muted-foreground">Representasi kepatuhan pedoman pedagogi visual Zyx.</p>
                      </div>
                      <div className="flex items-baseline gap-1 select-none">
                        <span className="text-h1 font-bold text-brand-primary">{result.stats.quality.score}</span>
                        <span className="text-muted-foreground text-body-base">/100</span>
                      </div>
                    </div>

                    {/* Breakdown Cards */}
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: "Glosarium Coverage", val: result.stats.quality.breakdown.glossaryCoverage, desc: "Persentase tag [[term]] yang didefinisikan di glosarium." },
                        { label: "Visual Reference", val: result.stats.quality.breakdown.visualReferenceCoverage, desc: "Persentase diagram visual yang ditautkan di dalam teks." },
                        { label: "Formula Atomization", val: result.stats.quality.breakdown.formulaAtomization, desc: "Kebocoran penulisan persamaan matematika langsung di konsep." },
                        { label: "Visual Coverage", val: result.stats.quality.breakdown.visualCoverage, desc: "Tingkat pemanfaatan ilustrasi visual dalam dokumen." },
                      ].map((item, idx) => (
                        <div key={idx} className="bg-card border border-border/80 rounded-xl p-4 shadow-3xs">
                          <div className="flex justify-between items-center mb-1 select-none">
                            <span className="text-body-xs font-semibold text-muted-foreground">{item.label}</span>
                            <span className="text-body-sm font-bold text-brand-primary">{item.val}%</span>
                          </div>
                          <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden mb-2">
                            <div className="bg-brand-primary h-full rounded-full" style={{ width: `${item.val}%` }} />
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-normal">{item.desc}</p>
                        </div>
                      ))}
                    </div>

                    {/* Structural Metrics */}
                    <div className="bg-card border border-border rounded-xl p-5 shadow-3xs space-y-4">
                      <h4 className="font-heading text-body-sm font-bold text-foreground">Structural Metrics & Stats</h4>
                      <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                        <div className="flex justify-between items-center border-b border-border/40 pb-2">
                          <span className="text-body-sm text-muted-foreground">Konsep Terdeteksi</span>
                          <span className="text-body-sm font-mono font-bold">{result.stats.conceptCount}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-border/40 pb-2">
                          <span className="text-body-sm text-muted-foreground">Formula Terdeteksi</span>
                          <span className="text-body-sm font-mono font-bold">{result.stats.formulaCount}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-border/40 pb-2">
                          <span className="text-body-sm text-muted-foreground">Glosarium Terdeteksi</span>
                          <span className="text-body-sm font-mono font-bold">{result.stats.glossaryCount}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-border/40 pb-2">
                          <span className="text-body-sm text-muted-foreground">Visual Diagram Terdeteksi</span>
                          <span className="text-body-sm font-mono font-bold">{result.stats.visualCount}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-border/40 pb-2">
                          <span className="text-body-sm text-muted-foreground">Rata-rata Panjang Konsep</span>
                          <span className="text-body-sm font-mono font-bold">{result.stats.averageConceptLength} karakter</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-border/40 pb-2">
                          <span className="text-body-sm text-muted-foreground">Rata-rata Panjang Rumus</span>
                          <span className="text-body-sm font-mono font-bold">{result.stats.averageFormulaLength} karakter</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-border/40 pb-2">
                          <span className="text-body-sm text-muted-foreground">Rata-rata Jarak Visual (Blok)</span>
                          <span className="text-body-sm font-mono font-bold">{result.stats.averageVisualDistance} blok</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-border/40 pb-2">
                          <span className="text-body-sm text-muted-foreground">Rata-rata Glosarium Ref</span>
                          <span className="text-body-sm font-mono font-bold">{result.stats.averageGlossaryReferenceCount} per text</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
