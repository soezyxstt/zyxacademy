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
import { MathText } from "@/components/course/math-text";
import { CompilerResult, ASTBlock } from "@/lib/ast-validator";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";
import { useTranslations } from "@/lib/i18n/client";

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
  const t = useTranslations("adminOps");
  const [markdown, setMarkdown] = useState(DEMO_TEMPLATES.standard);
  const [result, setResult] = useState<CompilerResult | null>(null);
  const [activeTab, setActiveTab] = useUrlTab("tab", "preview");
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
      } catch {
        toast.error(t("astInspectorUI.importError"));
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
        return `${t("astInspectorUI.headingLevel", { level: block.level })}: ${block.content}`;
      case "concept":
        return block.content.title;
      case "formula":
        return block.content.title || block.content.latex.slice(0, 40);
      case "visual":
        return `[${block.visualType.toUpperCase()}] ${block.title || block.id}`;
      case "glossary_term":
        return block.content.term;
      case "learning_objective":
        return t("astInspectorUI.objectivesCount", { count: block.content.objectives.length });
      default:
        return block.type;
    }
  };

  const getDiagnosticMessage = (diagnostic: CompilerResult["diagnostics"][number]) => {
    const message = diagnostic.message;
    switch (diagnostic.code) {
      case "AST_SCHEMA_VALIDATION_FAILED": {
        const match = message.match(/path \[(.*?)\]: (.*)$/);
        return match
          ? t("astInspectorUI.schemaViolation", { path: match[1], details: match[2] })
          : message;
      }
      case "FORMULA_IN_CONCEPT": {
        const title = message.match(/Concept block "(.*?)"/)?.[1];
        return t("astInspectorUI.formulaInConcept", { title: title || "" });
      }
      case "VISUAL_REFERENCE_INVALID": {
        const id = message.match(/visual ID "(.*?)"/)?.[1];
        return t("astInspectorUI.invalidVisualReference", { id: id || "" });
      }
      case "MISSING_GLOSSARY_TERM": {
        const term = message.match(/Term "\[\[(.*?)\]\]"/)?.[1];
        return t("astInspectorUI.missingGlossaryTerm", { term: term || "" });
      }
      case "VISUAL_BLOCK_PARSE_FALLBACK":
        return t("astInspectorUI.visualParseFallback");
      case "CONCEPT_WITHOUT_GLOSSARY": {
        const title = message.match(/Concept title "(.*?)"/)?.[1];
        return t("astInspectorUI.conceptWithoutGlossary", { title: title || "" });
      }
      case "GLOSSARY_NEVER_REFERENCED": {
        const term = message.match(/Glossary term "(.*?)"/)?.[1];
        return t("astInspectorUI.glossaryNeverReferenced", { term: term || "" });
      }
      case "UNUSED_VISUAL_BLOCK": {
        const id = message.match(/Visual block "(.*?)"/)?.[1];
        return t("astInspectorUI.unusedVisualBlock", { id: id || "" });
      }
      case "VISUAL_TOO_FAR": {
        const match = message.match(/\[\[visual:(.*?)\]\].*located (\d+) blocks/);
        return t("astInspectorUI.visualTooFar", { id: match?.[1] || "", distance: match?.[2] || "" });
      }
      default:
        return message;
    }
  };

  const getDiagnosticRecommendation = (diagnostic: CompilerResult["diagnostics"][number]) => {
    switch (diagnostic.code) {
      case "AST_SCHEMA_VALIDATION_FAILED": return t("astInspectorUI.schemaRecommendation");
      case "FORMULA_IN_CONCEPT": return t("astInspectorUI.formulaRecommendation");
      case "VISUAL_REFERENCE_INVALID": return t("astInspectorUI.visualReferenceRecommendation");
      case "MISSING_GLOSSARY_TERM": return t("astInspectorUI.glossaryRecommendation");
      case "VISUAL_BLOCK_PARSE_FALLBACK": return t("astInspectorUI.visualParseRecommendation");
      case "CONCEPT_WITHOUT_GLOSSARY": return t("astInspectorUI.addGlossaryRecommendation");
      case "GLOSSARY_NEVER_REFERENCED": return t("astInspectorUI.referenceGlossaryRecommendation");
      case "UNUSED_VISUAL_BLOCK": return t("astInspectorUI.referenceVisualRecommendation");
      case "VISUAL_TOO_FAR": return t("astInspectorUI.moveVisualRecommendation");
      default: return diagnostic.recommendation;
    }
  };

  return (
    <div className="w-full">
      <div className="flex flex-col h-[calc(100vh-250px)] bg-background text-foreground overflow-hidden font-sans border border-border rounded-xl shadow-xs">
        {/* DUAL PANE */}
        <div className="flex flex-1 flex-col overflow-auto md:flex-row md:overflow-hidden">
          {/* LEFT PANE: EDITOR */}
          <div className="flex min-h-80 w-full flex-col border-b border-border bg-card md:w-1/2 md:border-b-0 md:border-r">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-muted/40 border-b border-border">
              <span className="text-body-xs font-mono font-semibold text-muted-foreground flex items-center gap-1.5">
                <Terminal className="size-3.5" />
                <span>canonical-markdown.md</span>
              </span>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-body-xs text-muted-foreground font-medium">{t("astInspectorUI.demo")}</span>
                <Button size="sm" variant="outline"
                  type="button"
                  onClick={() => loadTemplate("standard")}
                  className="px-2 py-1 rounded-md border border-border text-body-xs font-medium hover:bg-muted bg-background transition-colors cursor-pointer"
                >
                  {t("astInspectorUI.standard")}
                </Button>
                <Button size="sm" variant="outline"
                  type="button"
                  onClick={() => loadTemplate("leakage")}
                  className="px-2 py-1 rounded-md border border-border text-body-xs font-medium hover:bg-muted bg-background transition-colors cursor-pointer"
                >
                  {t("astInspectorUI.leakage")}
                </Button>
                <Button size="sm" variant="outline"
                  type="button"
                  onClick={() => loadTemplate("visual")}
                  className="px-2 py-1 rounded-md border border-border text-body-xs font-medium hover:bg-muted bg-background transition-colors cursor-pointer"
                >
                  {t("astInspectorUI.visual")}
                </Button>

                <div className="w-px h-4 bg-border mx-1" />

                <label className="flex items-center gap-1 px-2 py-1 rounded-md border border-border text-body-xs font-medium hover:bg-muted bg-background cursor-pointer transition-colors">
                  <Upload className="size-3" />
                  <span>{t("astInspectorUI.import")}</span>
                  <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                </label>

                <Button size="sm" variant="outline"
                  type="button"
                  onClick={handleExport}
                  disabled={!result}
                  className="flex items-center gap-1 px-2 py-1 rounded-md border border-border text-body-xs font-medium hover:bg-muted bg-background disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <Download className="size-3" />
                  <span>{t("astInspectorUI.export")}</span>
                </Button>
              </div>

              <Button size="sm" variant="outline"
                type="button"
                onClick={handleCompile}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-brand-primary text-white text-body-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
              >
                <Play className="size-3" />
                <span>{t("astInspectorUI.compile")}</span>
              </Button>
            </div>
            <div className="flex-1 p-4 overflow-hidden relative">
              <Textarea
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                className="w-full h-full p-4 font-mono text-body-sm leading-relaxed bg-card text-foreground rounded-xl border border-border/80 focus:outline-none focus:ring-1 focus:ring-brand-primary resize-none overflow-y-auto"
                placeholder={t("astInspectorUI.markdownPlaceholder")}
              />
            </div>
          </div>

        {/* RIGHT PANE: VIEWER */}
        <div className="w-full min-h-80 flex flex-col bg-background md:w-1/2">
          {/* TABS */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              {[
                { id: "preview", label: t("astInspectorUI.livePreview"), icon: <Eye className="size-3.5" /> },
                { id: "block-explorer", label: t("astInspectorUI.blockExplorer"), icon: <List className="size-3.5" /> },
                { id: "diagnostics", label: t("astInspectorUI.diagnostics"), icon: <AlertTriangle className="size-3.5" /> },
                { id: "json", label: t("astInspectorUI.astJson"), icon: <FileCode className="size-3.5" /> },
                { id: "pipeline", label: t("astInspectorUI.pipeline"), icon: <Layers className="size-3.5" /> },
                { id: "stats", label: t("astInspectorUI.statsQuality"), icon: <BookOpen className="size-3.5" /> },
              ].map((item) => (
                <TabsTrigger key={item.id} value={item.id}>
                  {item.icon}
                  <span>{item.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* TAB CONTENTS */}
          <div className="flex-1 overflow-y-auto p-6">
            {!result ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <RefreshCw className="size-8 animate-spin mb-2" />
                <p className="text-body-sm">{t("astInspectorUI.noCompileResult")}</p>
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
                  <div className="divide-y divide-border">
                    <h3 className="font-heading text-body-base font-bold mb-4">{t("astInspectorUI.blockList")}</h3>
                    {result.ast.blocks.map((block, idx) => {
                      const isExpanded = !!expandedBlocks[block.id];
                      const isCanonical = ![
                        "p", "h", "list", "blockquote", "table", "code", "hr"
                      ].includes(block.type);

                      return (
                        <div
                          key={block.id || idx}
                          className="border-b border-border bg-card overflow-hidden"
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
                                "px-2 py-0.5 rounded text-body-2xs font-bold uppercase",
                                isCanonical
                                  ? "bg-brand-primary/15 text-brand-primary"
                                  : "bg-muted text-muted-foreground"
                              )}>
                                {block.type}
                              </span>
                              <span className="text-body-sm font-semibold text-foreground truncate max-w-md">
                                <MathText as="span">{getBlockSummary(block)}</MathText>
                              </span>
                            </div>
                            <span className="text-body-xs text-muted-foreground">
                              {isExpanded ? t("astInspectorUI.hide") : t("astInspectorUI.showJson")}
                            </span>
                          </div>

                          {isExpanded && (
                            <div className="border-t border-border bg-muted/30 p-4 overflow-x-auto">
                              <pre className="font-mono text-body-xs text-foreground">
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
                      <h3 className="font-heading text-body-base font-bold">{t("astInspectorUI.complianceDiagnostics")}</h3>
                      <span className={cn(
                        "px-2.5 py-1 rounded text-body-xs font-bold",
                        result.diagnostics.some(d => d.severity === "error")
                          ? "bg-status-error/15 text-status-error"
                          : result.diagnostics.some(d => d.severity === "warning")
                          ? "bg-status-warning/15 text-status-warning"
                          : "bg-status-success/15 text-status-success"
                      )}>
                        {t("astInspectorUI.diagnosticsFound", { count: result.diagnostics.length })}
                      </span>
                    </div>

                    {result.diagnostics.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-8 border border-dashed border-border rounded-xl bg-card text-center">
                        <CheckCircle className="size-8 text-status-success mb-2" />
                        <h4 className="font-bold text-body-sm text-foreground">{t("astInspectorUI.perfectDocument")}</h4>
                        <p className="text-body-xs text-muted-foreground mt-0.5">{t("astInspectorUI.noDiagnostics")}</p>
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
                                  "text-body-2xs font-bold uppercase font-heading tracking-wider",
                                  diag.severity === "error" ? "text-status-error" : "text-status-warning"
                                )}>
                                  {diag.severity === "error" ? t("astInspectorUI.error") : diag.severity === "warning" ? t("astInspectorUI.warning") : t("astInspectorUI.info")}
                                </span>
                                <span className="text-body-xs font-mono text-muted-foreground">
                                  [{diag.code}]
                                </span>
                              </div>
                              <p className="text-body-sm font-semibold text-foreground">
                                {getDiagnosticMessage(diag)}
                              </p>
                              {diag.blockId && (
                              <p className="text-body-xs text-muted-foreground font-mono mt-1">
                                  {t("astInspectorUI.blockId")}: {diag.blockId}
                                </p>
                              )}
                              {diag.recommendation && (
                                <div className="mt-3 p-3 rounded-lg bg-background border border-border/80 text-body-xs text-foreground/90 font-sans">
                              <strong className="text-brand-primary block mb-0.5">{t("astInspectorUI.autoFixRecommendation")}</strong>
                                  {getDiagnosticRecommendation(diag)}
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
                      <Button size="sm" variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(result.ast, null, 2));
                          toast.success(t("astInspectorUI.jsonCopied"));
                        }}
                        className="px-2 py-1 rounded-md bg-card hover:bg-muted border border-border text-body-2xs font-semibold cursor-pointer"
                      >
                        {t("astInspectorUI.copyJson")}
                      </Button>
                    </div>
                    <pre className="p-4 bg-muted/30 text-foreground rounded-xl border border-border overflow-x-auto text-body-xs font-mono leading-relaxed">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </div>
                )}

                {/* 5. PIPELINE VIEWER (Point 7) */}
                {activeTab === "pipeline" && (
                  <div className="space-y-6">
                    <h3 className="font-heading text-body-base font-bold mb-4">{t("astInspectorUI.compilerStages")}</h3>
                    {[
                      {
                        title: t("astInspectorUI.parseTitle"),
                        desc: t("astInspectorUI.parseDescription", { count: result.ast.blocks.length }),
                        status: t("astInspectorUI.complete"),
                        details: t("astInspectorUI.parseDetails")
                      },
                      {
                        title: t("astInspectorUI.normalizeTitle"),
                        desc: t("astInspectorUI.normalizeDescription"),
                        status: t("astInspectorUI.complete"),
                        details: t("astInspectorUI.normalizeDetails")
                      },
                      {
                        title: t("astInspectorUI.validateTitle"),
                        desc: t("astInspectorUI.validateDescription"),
                        status: result.diagnostics.some(d => d.code === "AST_SCHEMA_VALIDATION_FAILED") ? t("astInspectorUI.failed") : t("astInspectorUI.valid"),
                        details: t("astInspectorUI.validateDetails")
                      },
                      {
                        title: t("astInspectorUI.diagnosticsTitle"),
                        desc: t("astInspectorUI.diagnosticsDescription"),
                        status: t("astInspectorUI.diagnosticsFound", { count: result.diagnostics.length }),
                        details: t("astInspectorUI.diagnosticsDetails")
                      },
                      {
                        title: t("astInspectorUI.statsTitle"),
                        desc: t("astInspectorUI.statsDescription"),
                        status: t("astInspectorUI.scoreStatus", { score: result.stats.quality.score }),
                        details: t("astInspectorUI.statsDetails", { conceptLength: result.stats.averageConceptLength, glossaryCoverage: result.stats.quality.breakdown.glossaryCoverage })
                      },
                    ].map((step, idx) => (
                      <div key={idx} className="flex gap-4 items-start relative pb-6 last:pb-0">
                        {idx < 4 && (
                          <div className="absolute left-[17px] top-[30px] bottom-0 w-0.5 bg-border" />
                        )}
                        <div className="size-9 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-body-sm font-mono shrink-0 select-none z-10">
                          {idx + 1}
                        </div>
                        <div className="flex-1 border-b border-border pb-3 text-left">
                          <div className="flex items-center justify-between mb-1.5">
                            <h4 className="font-heading text-body-sm font-bold text-foreground">{step.title}</h4>
                            <span className="text-body-2xs font-bold px-2 py-0.5 rounded bg-muted text-muted-foreground select-none">
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
                        <h4 className="font-heading text-body-base font-bold text-foreground">{t("astInspectorUI.qualityScore")}</h4>
                        <p className="text-body-sm text-muted-foreground">{t("astInspectorUI.qualityDescription")}</p>
                      </div>
                      <div className="flex items-baseline gap-1 select-none">
                        <span className="text-h1 font-bold text-brand-primary">{result.stats.quality.score}</span>
                        <span className="text-muted-foreground text-body-base">/100</span>
                      </div>
                    </div>

                    {/* Breakdown Cards */}
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: t("astInspectorUI.glossaryCoverage"), val: result.stats.quality.breakdown.glossaryCoverage, desc: t("astInspectorUI.glossaryCoverageDescription") },
                        { label: t("astInspectorUI.visualReference"), val: result.stats.quality.breakdown.visualReferenceCoverage, desc: t("astInspectorUI.visualReferenceDescription") },
                        { label: t("astInspectorUI.formulaAtomization"), val: result.stats.quality.breakdown.formulaAtomization, desc: t("astInspectorUI.formulaAtomizationDescription") },
                        { label: t("astInspectorUI.visualCoverage"), val: result.stats.quality.breakdown.visualCoverage, desc: t("astInspectorUI.visualCoverageDescription") },
                      ].map((item, idx) => (
                        <div key={idx} className="py-3 border-b border-border">
                          <div className="flex justify-between items-center mb-1 select-none">
                            <span className="text-body-xs font-semibold text-muted-foreground">{item.label}</span>
                            <span className="text-body-sm font-bold text-brand-primary">{item.val}%</span>
                          </div>
                          <div className="mb-2 h-1.5 w-full overflow-hidden rounded-md bg-muted">
                            <div className="h-full rounded-md bg-brand-primary transition-[width] duration-500 ease-out" style={{ width: `${item.val}%` }} />
                          </div>
                          <p className="text-body-xs text-muted-foreground leading-normal">{item.desc}</p>
                        </div>
                      ))}
                    </div>

                    {/* Structural Metrics */}
                    <div className="bg-card border border-border rounded-xl p-5 shadow-3xs space-y-4">
                      <h4 className="font-heading text-body-sm font-bold text-foreground">{t("astInspectorUI.structureMetrics")}</h4>
                      <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                        <div className="flex justify-between items-center border-b border-border/40 pb-2">
                          <span className="text-body-sm text-muted-foreground">{t("astInspectorUI.conceptsDetected")}</span>
                          <span className="text-body-sm font-mono font-bold">{result.stats.conceptCount}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-border/40 pb-2">
                          <span className="text-body-sm text-muted-foreground">{t("astInspectorUI.formulasDetected")}</span>
                          <span className="text-body-sm font-mono font-bold">{result.stats.formulaCount}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-border/40 pb-2">
                          <span className="text-body-sm text-muted-foreground">{t("astInspectorUI.glossaryDetected")}</span>
                          <span className="text-body-sm font-mono font-bold">{result.stats.glossaryCount}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-border/40 pb-2">
                          <span className="text-body-sm text-muted-foreground">{t("astInspectorUI.visualsDetected")}</span>
                          <span className="text-body-sm font-mono font-bold">{result.stats.visualCount}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-border/40 pb-2">
                          <span className="text-body-sm text-muted-foreground">{t("astInspectorUI.averageConceptLength")}</span>
                          <span className="text-body-sm font-mono font-bold">{t("astInspectorUI.characterCount", { count: result.stats.averageConceptLength })}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-border/40 pb-2">
                          <span className="text-body-sm text-muted-foreground">{t("astInspectorUI.averageFormulaLength")}</span>
                          <span className="text-body-sm font-mono font-bold">{t("astInspectorUI.characterCount", { count: result.stats.averageFormulaLength })}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-border/40 pb-2">
                          <span className="text-body-sm text-muted-foreground">{t("astInspectorUI.averageVisualDistance")}</span>
                          <span className="text-body-sm font-mono font-bold">{t("astInspectorUI.blockCount", { count: result.stats.averageVisualDistance })}</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-border/40 pb-2">
                          <span className="text-body-sm text-muted-foreground">{t("astInspectorUI.averageGlossaryReferences")}</span>
                          <span className="text-body-sm font-mono font-bold">{t("astInspectorUI.perTextCount", { count: result.stats.averageGlossaryReferenceCount })}</span>
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
