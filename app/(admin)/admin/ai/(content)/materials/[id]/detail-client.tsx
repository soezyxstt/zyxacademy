"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MarkdownRenderer, VisualRenderer } from "@/components/course/markdown-renderer";
import { cn, cleanSummary } from "@/lib/utils";
import { MathText } from "@/components/course/math-text";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft,
  BookOpen,
  Layers,
  AlertTriangle,
  Loader2,
  Sparkles,
  Edit2,
  Info,
  X,
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  Check
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  triggerBulkChapterGenerationAction,
  updateKOAction,
  toggleChapterPublishAction,
  regenerateWebsiteMaterialAction,
  getChapterAssetGenProgressAction,
  saveWebsiteMaterialAction
} from "./actions";
import { parseCanonicalMarkdown } from "@/lib/markdown-compiler";

interface Instance {
  id: string;
  title: string;
  courseId: string;
  sourceType: string;
  summary: string;
  keywords: unknown;
  pineconeSyncStatus: string;
  lastSyncError: string | null;
  createdAt: Date;
}

interface Course {
  id: string;
  title: string;
}

interface Chapter {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  orderIndex: number;
  status: string;
  assetGenStatus?: string;
  assetGenFlashcardsTotal?: number;
  assetGenFlashcardsCurrent?: number;
  assetGenQuestionsTotal?: number;
  assetGenQuestionsCurrent?: number;
  assetGenError?: string | null;
}

interface KnowledgeObject {
  id: string;
  courseId: string;
  mtdId: string;
  chapterId: string;
  conceptId: string;
  learningOrder: number;
  title: string;
  conceptName: string;
  content: string;
  type: "definition" | "formula" | "example" | "misconception" | "exercise" | "summary" | "objective" | "concept_overview" | string;
  difficulty: "easy" | "medium" | "hard";
  bloomLevel: "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";
  tags: unknown;
  importance: "high" | "medium" | "low";
  pineconeVectorId: string | null;
  status: string;
}

interface WebsiteMaterial {
  id: string;
  courseId: string;
  chapterId: string;
  sourceMtdId: string;
  sourceMtdVersion: number;
  isStale: boolean;
  generationHash: string;
  title: string;
  slug: string;
  canonicalMarkdown: string;
  structuredContent: unknown;
  contentVersion: number;
  status: string;
}

interface Props {
  instance: Instance;
  course: Course;
  chapters: Chapter[];
  knowledgeObjects: KnowledgeObject[];
  websiteMaterials: WebsiteMaterial[];
}

function getNodeRawName(node: any) {
  if (node.stepNumber !== undefined && node.stepNumber !== null) {
    return `Langkah ${node.stepNumber}: ${node.label}`;
  }
  return node.label;
}

export function serializeASTToMarkdown(blocks: any[]): string {
  return blocks.map(block => {
    if (!block) return "";
    switch (block.type) {
      case "p":
        return block.content || "";
      case "h":
        return `${"#".repeat(block.level || 2)} ${block.content || ""}`;
      case "blockquote":
        return (block.content || "").split("\n").map((l: string) => `> ${l}`).join("\n");
      case "code":
        return `\`\`\`${block.language || ""}\n${block.content || ""}\n\`\`\``;
      case "hr":
        return "---";
      case "list":
        return (block.items || []).map((item: any) => `${item.ordered ? "1." : "-"} ${item.text || ""}`).join("\n");
      case "table": {
        const headers = (block.headers || []).join(" | ");
        const separators = (block.headers || []).map(() => "---").join(" | ");
        const rows = (block.rows || []).map((row: any) => `| ${(row || []).join(" | ")} |`).join("\n");
        return `| ${headers} |\n| ${separators} |\n${rows}`;
      }
      case "learning_objective": {
        const attr = block.metadata?.bloomLevel ? ` {bloomLevel="${block.metadata.bloomLevel}"}` : "";
        const body = (block.content?.objectives || []).map((o: string) => `- ${o}`).join("\n");
        return `:::learning_objective${attr}\n${body}\n:::`;
      }
      case "concept": {
        const attrs: string[] = [];
        if (block.metadata?.koId) attrs.push(`ref="${block.metadata.koId}"`);
        if (block.content?.title) attrs.push(`title="${block.content.title}"`);
        const attrStr = attrs.length > 0 ? ` {${attrs.join(", ")}}` : "";
        return `:::concept${attrStr}\n${block.content?.bodyMarkdown || ""}\n:::`;
      }
      case "formula": {
        const attrs: string[] = [];
        if (block.metadata?.koId) attrs.push(`ref="${block.metadata.koId}"`);
        if (block.content?.title) attrs.push(`title="${block.content.title}"`);
        const attrStr = attrs.length > 0 ? ` {${attrs.join(", ")}}` : "";
        
        let lines: string[] = [];
        lines.push(`:::formula${attrStr}`);
        lines.push(`$$`);
        lines.push(block.content?.latex || "");
        lines.push(`$$`);
        
        if (block.content?.interpretation) {
          lines.push(`Interpretasi:`);
          lines.push(block.content.interpretation);
        }
        
        if (block.content?.symbols && block.content.symbols.length > 0) {
          lines.push(`| Simbol | Satuan | Keterangan |`);
          lines.push(`| --- | --- | --- |`);
          block.content.symbols.forEach((sym: any) => {
            lines.push(`| ${sym.symbol || ""} | ${sym.unit || ""} | ${sym.definition || ""} |`);
          });
        }
        lines.push(`:::`);
        return lines.join("\n");
      }
      case "formula_reference": {
        const attrs: string[] = [];
        if (block.metadata?.linkedFormulaBlockId) attrs.push(`linkedFormulaBlockId="${block.metadata.linkedFormulaBlockId}"`);
        if (block.content?.label) attrs.push(`label="${block.content.label}"`);
        const attrStr = attrs.length > 0 ? ` {${attrs.join(", ")}}` : "";
        return `:::formula_reference${attrStr}\n$$\n${block.content?.latex || ""}\n$$\n:::`;
      }
      case "engineering_insight": {
        const attrs: string[] = [];
        if (block.metadata?.discipline) attrs.push(`discipline="${block.metadata.discipline}"`);
        if (block.content?.title) attrs.push(`title="${block.content.title}"`);
        const attrStr = attrs.length > 0 ? ` {${attrs.join(", ")}}` : "";
        return `:::engineering_insight${attrStr}\n${block.content?.applicationMarkdown || ""}\n:::`;
      }
      case "example": {
        const attrs: string[] = [];
        if (block.metadata?.difficulty) attrs.push(`difficulty="${block.metadata.difficulty}"`);
        if (block.metadata?.koId) attrs.push(`ref="${block.metadata.koId}"`);
        const attrStr = attrs.length > 0 ? ` {${attrs.join(", ")}}` : "";
        
        let lines: string[] = [];
        lines.push(`:::example${attrStr}`);
        lines.push(`#### Problem`);
        lines.push(block.content?.problemStatement || "");
        lines.push(`#### Solution`);
        (block.content?.solutionSteps || []).forEach((step: any) => {
          lines.push(`${step.stepIndex}. **${step.label || ""}**: ${step.explanationMarkdown || ""}`);
        });
        lines.push(`:::`);
        return lines.join("\n");
      }
      case "misconception": {
        const attrs: string[] = [];
        if (block.metadata?.koId) attrs.push(`ref="${block.metadata.koId}"`);
        const attrStr = attrs.length > 0 ? ` {${attrs.join(", ")}}` : "";
        
        let lines: string[] = [];
        lines.push(`:::misconception${attrStr}`);
        lines.push(`#### Misconception`);
        lines.push(block.content?.myth || "");
        lines.push(`#### Correction`);
        lines.push(block.content?.correctionMarkdown || "");
        if (block.content?.physicalRationaleMarkdown && block.content.physicalRationaleMarkdown !== block.content.correctionMarkdown) {
          lines.push(``);
          lines.push(block.content.physicalRationaleMarkdown);
        }
        lines.push(`:::`);
        return lines.join("\n");
      }
      case "exercise": {
        const attrs: string[] = [];
        if (block.metadata?.questionId) attrs.push(`questionId="${block.metadata.questionId}"`);
        const attrStr = attrs.length > 0 ? ` {${attrs.join(", ")}}` : "";
        return `:::exercise${attrStr}\n${block.content?.questionMarkdown || ""}\n:::`;
      }
      case "summary": {
        return `:::summary\n${(block.content?.bullets || []).map((b: string) => `- ${b}`).join("\n")}\n:::`;
      }
      case "warning":
      case "note": {
        const attrs: string[] = [];
        if (block.metadata?.collapsible) attrs.push(`collapsible="true"`);
        if (block.content?.title) attrs.push(`title="${block.content.title}"`);
        const attrStr = attrs.length > 0 ? ` {${attrs.join(", ")}}` : "";
        return `:::${block.type}${attrStr}\n${block.content?.messageMarkdown || ""}\n:::`;
      }
      case "glossary_term": {
        const attrStr = block.content?.term ? ` {term="${block.content.term}"}` : "";
        return `:::glossary_term${attrStr}\n${block.content?.definition || ""}\n:::`;
      }
      case "visual": {
        const attrs: string[] = [];
        if (block.title) attrs.push(`title="${block.title}"`);
        if (block.caption) attrs.push(`caption="${block.caption}"`);
        const attrStr = attrs.length > 0 ? ` {${attrs.join(", ")}}` : "";
        
        let lines: string[] = [];
        lines.push(`:::${block.visualType}${attrStr}`);
        
        if (block.visualType === "chart") {
          lines.push(`chartType: ${block.data?.chartType || "line"}`);
          if (block.data?.xLabel) lines.push(`xLabel: ${block.data.xLabel}`);
          if (block.data?.yLabel) lines.push(`yLabel: ${block.data.yLabel}`);
          lines.push(`data:`);
          (block.data?.data || []).forEach((pt: any) => {
            lines.push(`  - [${pt[0]}, ${pt[1]}]`);
          });
        } else if (block.visualType === "graph") {
          lines.push(`equation: ${block.data?.functions?.[0] || ""}`);
          if (block.data?.functions && block.data.functions.length > 1) {
            lines.push(`functions:`);
            block.data.functions.forEach((fn: string) => {
              lines.push(`  - ${fn}`);
            });
          }
          if (block.data?.domain) {
            lines.push(`domain: [${block.data.domain.min}, ${block.data.domain.max}]`);
          }
          if (block.data?.samples) {
            lines.push(`samples: ${block.data.samples}`);
          }
        } else if (block.visualType === "flowchart" || block.visualType === "diagram") {
          (block.data?.edges || []).forEach((edge: any) => {
            const sourceNode = block.data.nodes?.find((n: any) => n.id === edge.source) || { label: edge.source };
            const targetNode = block.data.nodes?.find((n: any) => n.id === edge.target) || { label: edge.target };
            const sourceName = getNodeRawName(sourceNode);
            const targetName = getNodeRawName(targetNode);
            const edgeLabel = edge.label ? ` -- "${edge.label}"` : "";
            lines.push(`${sourceName}${edgeLabel} --> ${targetName}`);
          });
        }
        
        lines.push(`:::`);
        return lines.join("\n");
      }
      default:
        return "";
    }
  }).filter(Boolean).join("\n\n");
}

const LATEX_TOOLBAR = [
  { label: "a/b", code: "\\frac{a}{b}", title: "Fraksi / Pembagian" },
  { label: "x^y", code: "x^{y}", title: "Pangkat / Eksponen" },
  { label: "√x", code: "\\sqrt{x}", title: "Akar Kuadrat" },
  { label: "lim", code: "\\lim_{x \\to c}", title: "Limit Pendekatan" },
  { label: "∫", code: "\\int_{a}^{b} f(x)\\,dx", title: "Integral Tentu" },
  { label: "Σ", code: "\\sum_{i=1}^{n}", title: "Penjumlahan Sigma" },
  { label: "dy/dx", code: "\\frac{dy}{dx}", title: "Derivatif / Turunan" },
  { label: "α", code: "\\alpha", title: "Alpha" },
  { label: "β", code: "\\beta", title: "Beta" },
  { label: "θ", code: "\\theta", title: "Theta" },
  { label: "∞", code: "\\infty", title: "Tak Hingga" },
  { label: "×", code: "\\times", title: "Perkalian Silang" },
  { label: "π", code: "\\pi", title: "Pi" },
  { label: "Δ", code: "\\Delta", title: "Delta / Perubahan" },
];

export function MaterialDetailClient({
  instance,
  course,
  chapters: initialChapters,
  knowledgeObjects: initialKOs,
  websiteMaterials: initialWebMaterials
}: Props) {
  const router = useRouter();
  const [chaptersList, setChaptersList] = useState<Chapter[]>(initialChapters);
  const [kos, setKOs] = useState<KnowledgeObject[]>(initialKOs);
  const [webMats, setWebMats] = useState<WebsiteMaterial[]>(initialWebMaterials);

  const [activeChapterId] = useState<string | null>(
    initialChapters.length > 0 ? initialChapters[0].id : null
  );
  const [activeTab, setActiveTab] = useState<"mastery" | "formulas" | "glossary" | "graph" | "all-kos" | "website-material">("mastery");
  const [expandedMUs, setExpandedMUs] = useState<Record<string, boolean>>({});

  // Selected state for drawers
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [isKODrawerOpen, setIsKODrawerOpen] = useState(false);
  const [editingKO, setEditingKO] = useState<KnowledgeObject | null>(null);

  // Progress monitoring state
  const [progressStates, setProgressStates] = useState<Record<string, any>>({});
  const intervalsRef = useRef<Record<string, NodeJS.Timeout>>({});

  // Loading states
  const [loadingChapterId, setLoadingChapterId] = useState<string | null>(null);
  const [savingKOId, setSavingKOId] = useState<string | null>(null);
  const [showStaleDiff, setShowStaleDiff] = useState<string | null>(null); // Chapter ID to show Diff modal

  // Website Material visual editor states
  const [editorMode, setEditorMode] = useState<"visual" | "raw">("visual");
  const [blocks, setBlocks] = useState<any[]>([]);
  const [rawMarkdown, setRawMarkdown] = useState("");
  const [editingBlockIndex, setEditingBlockIndex] = useState<number | null>(null);
  const [editingBlockData, setEditingBlockData] = useState<any | null>(null);
  const [savingWebMat, setSavingWebMat] = useState(false);
  const [showAddBlockDropdown, setShowAddBlockDropdown] = useState<number | null>(null);

  // Edit KO Form State
  const [koForm, setKOForm] = useState({
    title: "",
    conceptName: "",
    content: "",
    type: "definition" as any,
    difficulty: "medium" as any,
    bloomLevel: "understand" as any,
    importance: "medium" as any,
  });

  const cleanTitle = instance.title.replace(/^\[DRAF\]\s*/, "");

  // Find website material for a chapter
  const getWebMatForChapter = (chapterId: string) => {
    return webMats.find(wm => wm.chapterId === chapterId);
  };

  // Find KOs for a chapter
  const getKOsForChapter = (chapterId: string) => {
    return kos.filter(ko => ko.chapterId === chapterId && ko.status === "active");
  };

  const startPolling = (chapterId: string) => {
    if (intervalsRef.current[chapterId]) return;

    const interval = setInterval(async () => {
      try {
        const res = await getChapterAssetGenProgressAction(chapterId);
        if (res.success && res.progress) {
          const prog = res.progress;
          setProgressStates(prev => ({ ...prev, [chapterId]: prog }));
          
          if (prog.status === "completed" || prog.status === "failed") {
            clearInterval(interval);
            delete intervalsRef.current[chapterId];
            
            // Sync with local state list
            setChaptersList(prev =>
              prev.map(c =>
                c.id === chapterId
                  ? {
                      ...c,
                      assetGenStatus: prog.status,
                      assetGenFlashcardsTotal: prog.flashcardsTotal,
                      assetGenFlashcardsCurrent: prog.flashcardsCurrent,
                      assetGenQuestionsTotal: prog.questionsTotal,
                      assetGenQuestionsCurrent: prog.questionsCurrent,
                      assetGenError: prog.error,
                    }
                  : c
              )
            );

            if (prog.status === "completed") {
              toast.success("Pembuatan kuis, flashcards, dan penyelarasan materi telah selesai!");
              router.refresh();
            } else {
              toast.error(`Gagal membuat aset: ${prog.error || "Unknown error"}`);
            }
          }
        }
      } catch (err) {
        console.error("Error polling progress:", err);
      }
    }, 2000);

    intervalsRef.current[chapterId] = interval;
  };

  useEffect(() => {
    // Start polling for any chapter that is currently in "generating" status
    chaptersList.forEach(chapter => {
      if (chapter.assetGenStatus === "generating") {
        startPolling(chapter.id);
      }
    });

    const current = intervalsRef.current;
    return () => {
      Object.values(current).forEach(clearInterval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const webMat = webMats.find(wm => wm.chapterId === activeChapterId);
    if (webMat) {
      setRawMarkdown(webMat.canonicalMarkdown);
      try {
        const parsed = parseCanonicalMarkdown(webMat.canonicalMarkdown);
        setBlocks(parsed);
      } catch (err) {
        console.error("Error parsing canonical markdown:", err);
      }
    } else {
      setBlocks([]);
      setRawMarkdown("");
    }
  }, [activeChapterId, webMats]);

  const handleTriggerBulkGeneration = async (chapterId: string) => {
    setLoadingChapterId(chapterId + "-bulk");
    try {
      const res = await triggerBulkChapterGenerationAction(chapterId);
      if (res.success) {
        toast.success(
          "Proses pembuatan kuis, flashcards, dan penyelarasan materi telah berhasil dijadwalkan di latar belakang!"
        );
        // Instantly mark local state as generating
        setChaptersList(prev =>
          prev.map(c =>
            c.id === chapterId
              ? {
                  ...c,
                  assetGenStatus: "generating",
                  assetGenFlashcardsTotal: 0,
                  assetGenFlashcardsCurrent: 0,
                  assetGenQuestionsTotal: 0,
                  assetGenQuestionsCurrent: 0,
                  assetGenError: null,
                }
              : c
          )
        );
        // Start client-side polling immediately
        startPolling(chapterId);
      } else {
        toast.error(`Gagal memulai pembuatan aset: ${res.error}`);
      }
    } catch {
      toast.error("Kesalahan jaringan.");
    } finally {
      setLoadingChapterId(null);
    }
  };

  const handleTogglePublish = async (chapterId: string, currentStatus: string) => {
    setLoadingChapterId(chapterId + "-publish");
    const nextPublish = currentStatus !== "published";
    try {
      const res = await toggleChapterPublishAction(chapterId, nextPublish);
      if (res.success) {
        toast.success(nextPublish ? "Bab telah dipublikasikan!" : "Bab dikembalikan ke Draf.");
        // Update local state
        setChaptersList(prev => prev.map(c => c.id === chapterId ? { ...c, status: nextPublish ? "published" : "draft" } : c));
        setWebMats(prev => prev.map(wm => wm.chapterId === chapterId ? { ...wm, status: nextPublish ? "published" : "draft" } : wm));
      } else {
        toast.error(`Gagal memperbarui status publikasi: ${res.error}`);
      }
    } catch {
      toast.error("Kesalahan jaringan.");
    } finally {
      setLoadingChapterId(null);
    }
  };

  const handleSyncMaterial = async (chapterId: string) => {
    setLoadingChapterId(chapterId + "-sync");
    try {
      const res = await regenerateWebsiteMaterialAction(chapterId);
      if (res.success) {
        toast.success("Materi Website berhasil disinkronkan!");
        setWebMats(prev => prev.map(wm => wm.chapterId === chapterId ? { ...wm, isStale: false } : wm));
        setShowStaleDiff(null);
      } else {
        toast.error(`Gagal mensinkronkan materi: ${res.error}`);
      }
    } catch {
      toast.error("Kesalahan jaringan.");
    } finally {
      setLoadingChapterId(null);
    }
  };

  const _handleOpenKODrawer = (chapter: Chapter) => {
    setSelectedChapter(chapter);
    setIsKODrawerOpen(true);
  };

  const handleStartEditKO = (ko: KnowledgeObject) => {
    setEditingKO(ko);
    setKOForm({
      title: ko.title,
      conceptName: ko.conceptName,
      content: ko.content,
      type: ko.type,
      difficulty: ko.difficulty,
      bloomLevel: ko.bloomLevel,
      importance: ko.importance,
    });
  };

  const handleSaveKO = async () => {
    if (!editingKO) return;
    setSavingKOId(editingKO.id);
    try {
      const res = await updateKOAction(editingKO.id, koForm);
      if (res.success) {
        toast.success("Objek Pengetahuan berhasil diperbarui.");
        
        // Update local KO state
        setKOs(prev => prev.map(k => k.id === editingKO.id ? { ...k, ...koForm } : k));
        
        // Mark matching website material as stale in local state
        setWebMats(prev => prev.map(wm => wm.chapterId === editingKO.chapterId ? { ...wm, isStale: true } : wm));
        
        setEditingKO(null);
      } else {
        toast.error(`Gagal menyimpan Objek Pengetahuan: ${res.error}`);
      }
    } catch {
      toast.error("Kesalahan jaringan.");
    } finally {
      setSavingKOId(null);
    }
  };

  const createNewBlock = (type: string) => {
    const id = `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    switch (type) {
      case "p":
        return { id, type: "p", content: "Paragraf baru..." };
      case "h":
        return { id, type: "h", level: 2, content: "Sub-judul baru" };
      case "concept":
        return { id, type: "concept", metadata: { koId: "" }, content: { title: "Konsep Baru", bodyMarkdown: "Penjelasan..." } };
      case "formula":
        return { id, type: "formula", metadata: {}, content: { title: "Rumus Baru", latex: "E = m c^2", interpretation: "", symbols: [] } };
      case "example":
        return { id, type: "example", metadata: { difficulty: "medium" }, content: { problemStatement: "Soal...", solutionSteps: [] } };
      case "misconception":
        return { id, type: "misconception", metadata: { koId: "" }, content: { myth: "Mitos...", correctionMarkdown: "Koreksi...", physicalRationaleMarkdown: "" } };
      case "visual-flowchart":
      case "visual-diagram":
        return {
          id,
          type: "visual",
          visualType: type === "visual-flowchart" ? "flowchart" : "diagram",
          version: 1,
          title: "Diagram Baru",
          caption: "Deskripsi",
          data: { edges: [], nodes: [] }
        };
      case "visual-chart":
        return {
          id,
          type: "visual",
          visualType: "chart",
          version: 1,
          title: "Bagan Baru",
          caption: "Deskripsi",
          data: { chartType: "line", data: [] }
        };
      case "visual-graph":
        return {
          id,
          type: "visual",
          visualType: "graph",
          version: 1,
          title: "Plot Fungsi",
          caption: "Deskripsi",
          data: { functions: ["x^2"], domain: { min: -10, max: 10 }, samples: 200 }
        };
      default:
        return { id, type: "p", content: "" };
    }
  };

  const handleSaveWebMat = async (chapterId: string) => {
    let markdownToSave = "";
    if (editorMode === "visual") {
      markdownToSave = serializeASTToMarkdown(blocks);
    } else {
      markdownToSave = rawMarkdown;
    }

    if (!markdownToSave.trim()) {
      toast.error("Konten materi tidak boleh kosong.");
      return;
    }

    setSavingWebMat(true);
    try {
      const res = await saveWebsiteMaterialAction(chapterId, markdownToSave);
      if (res.success) {
        toast.success("Materi Website berhasil disimpan & dikompilasi!");
        
        // Update local webMats state
        setWebMats(prev => prev.map(wm => wm.chapterId === chapterId ? { 
          ...wm, 
          canonicalMarkdown: markdownToSave,
          isStale: false 
        } : wm));
        
        // Reload parser
        try {
          const parsed = parseCanonicalMarkdown(markdownToSave);
          setBlocks(parsed);
        } catch {}
        
        router.refresh();
      } else {
        toast.error(`Gagal menyimpan materi: ${res.error || "Kesalahan kompilasi"}`);
      }
    } catch {
      toast.error("Kesalahan jaringan.");
    } finally {
      setSavingWebMat(false);
    }
  };

  const moveBlock = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === blocks.length - 1) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const newBlocks = [...blocks];
    const temp = newBlocks[index];
    newBlocks[index] = newBlocks[targetIndex];
    newBlocks[targetIndex] = temp;
    setBlocks(newBlocks);
  };

  const deleteBlock = (index: number) => {
    const newBlocks = blocks.filter((_, i) => i !== index);
    setBlocks(newBlocks);
    toast.success("Blok berhasil dihapus.");
  };

  const addBlock = (index: number, type: string) => {
    const newBlock = createNewBlock(type);
    const newBlocks = [...blocks];
    newBlocks.splice(index, 0, newBlock);
    setBlocks(newBlocks);
    setShowAddBlockDropdown(null);
    toast.success("Blok baru berhasil ditambahkan.");
    
    // Auto edit the newly created block
    handleStartEditBlock(index);
  };

  const handleStartEditBlock = (index: number) => {
    setEditingBlockIndex(index);
    setEditingBlockData(JSON.parse(JSON.stringify(blocks[index])));
  };

  const handleSaveBlock = () => {
    if (editingBlockIndex === null || !editingBlockData) return;
    const newBlocks = [...blocks];
    newBlocks[editingBlockIndex] = editingBlockData;
    setBlocks(newBlocks);
    setEditingBlockIndex(null);
    setEditingBlockData(null);
    toast.success("Perubahan blok disimpan di editor.");
  };

  const renderChapterSidebar = (chapterId: string) => {
    const chapter = chaptersList.find(c => c.id === chapterId);
    if (!chapter) return null;

    const chapterKOs = getKOsForChapter(chapterId);
    const webMat = getWebMatForChapter(chapterId);
    const status = webMat?.status ?? "draft";

    const concepts = chapterKOs.filter(ko => ko.type === "concept_overview" || ko.type === "definition");
    const formulas = chapterKOs.filter(ko => ko.type === "formula");
    const exercises = chapterKOs.filter(ko => ko.type === "exercise");

    const masteryUnits = concepts.map((concept, index) => {
      const supporting = chapterKOs.filter(ko => 
        ko.id !== concept.id && 
        ko.conceptName.toLowerCase().trim() === concept.conceptName.toLowerCase().trim()
      );
      
      const difficulty = concept.difficulty;
      const threshold = difficulty === "easy" ? 75 : difficulty === "medium" ? 70 : 60;
      
      return {
        id: concept.id || `mu-${index}`,
        concept,
        supporting,
        difficulty,
        threshold,
        importance: concept.importance || "medium"
      };
    });

    if (masteryUnits.length === 0 && chapterKOs.length > 0) {
      masteryUnits.push({
        id: "mu-fallback",
        concept: {
          id: "fallback-concept",
          conceptId: "ko-fallback-concept",
          title: "Konsep Utama Bab",
          conceptName: "Umum",
          content: "Penjelasan konsep umum bab ini.",
          type: "concept_overview",
          difficulty: "medium",
          bloomLevel: "understand",
          importance: "medium",
          courseId: chapter.courseId,
          mtdId: instance.id,
          chapterId: chapter.id,
          learningOrder: 1,
          tags: [],
          pineconeVectorId: null,
          status: "active"
        },
        supporting: chapterKOs,
        difficulty: "medium",
        threshold: 70,
        importance: "medium"
      });
    }

    const estimatedFlashcards = masteryUnits.length * 3;
    const estimatedQuestions = formulas.length * 2 || 6;

    const currentProgress = progressStates[chapter.id] || {
      status: chapter.assetGenStatus || "idle",
      flashcardsTotal: chapter.assetGenFlashcardsTotal || 0,
      flashcardsCurrent: chapter.assetGenFlashcardsCurrent || 0,
      questionsTotal: chapter.assetGenQuestionsTotal || 0,
      questionsCurrent: chapter.assetGenQuestionsCurrent || 0,
      error: chapter.assetGenError || null
    };

    const totalItems = (currentProgress.flashcardsTotal || 0) + (currentProgress.questionsTotal || 0);
    const currentItems = (currentProgress.flashcardsCurrent || 0) + (currentProgress.questionsCurrent || 0);
    const percentage = totalItems > 0 ? Math.round((currentItems / totalItems) * 100) : 0;

    return (
      <div className="space-y-6 text-left">
        {/* SECTION 1: INFO BAB */}
        <div className="space-y-3 pb-6 border-b border-border/60">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="font-mono text-[10px] font-bold text-primary uppercase tracking-wider">BAB {chapter.orderIndex}</span>
              <h2 className="font-heading text-body-lg font-bold text-foreground mt-0.5">{chapter.title}</h2>
            </div>
            <Button
              variant={status === "published" ? "outline" : "default"}
              size="xs"
              className="rounded-md text-[10px] font-bold h-7 cursor-pointer shrink-0"
              disabled={loadingChapterId === chapter.id + "-publish"}
              onClick={() => handleTogglePublish(chapter.id, status)}
            >
              {loadingChapterId === chapter.id + "-publish" && (
                <Loader2 className="size-3 mr-1 animate-spin" />
              )}
              {status === "published" ? "Arsipkan" : "Publikasikan"}
            </Button>
          </div>
          
          <p className="text-xs text-muted-foreground leading-relaxed">
            Diagnosis pedagogis bab ini berdasarkan muatan objek pengetahuan yang terdaftar.
          </p>

          <div className="p-3 bg-muted/30 border border-border/60 rounded-lg text-xs leading-relaxed text-muted-foreground">
            <div className="flex gap-2">
              <Info className="size-3.5 shrink-0 mt-0.5 text-primary" />
              <div>
                <span className="font-bold text-foreground block text-[11px] mb-0.5">Kesimpulan Rekomendasi Pedagogis</span>
                Bab ini mengandung <span className="font-semibold text-foreground">{masteryUnits.length} Mastery Unit</span> ({masteryUnits.filter(m => m.difficulty === "easy").length} Fundamental, {masteryUnits.filter(m => m.difficulty === "medium").length} Intermediate, {masteryUnits.filter(m => m.difficulty === "hard").length} Advanced).
                {formulas.length > 0 && ` Ditemukan ${formulas.length} rumus penting. `}
                {exercises.length === 0 && formulas.length > 0 ? (
                  <span className="text-rose-600 font-semibold">Terdapat formula penting yang belum memiliki latihan pendukung. Rekomendasi: generate latihan kustom.</span>
                ) : "Seluruh cakupan materi telah didukung oleh latihan yang memadai."}
              </div>
            </div>
          </div>

          {/* Compact stats grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 bg-muted/20 border border-border/40 rounded-lg space-y-0.5">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider block font-bold">Beban Belajar</span>
              <span className="text-body-base font-bold text-foreground block">45m</span>
            </div>
            <div className="p-2.5 bg-muted/20 border border-border/40 rounded-lg space-y-0.5">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider block font-bold">Kerapatan</span>
              <span className="text-body-base font-bold text-amber-600 block">Tinggi</span>
            </div>
            <div className="p-2.5 bg-muted/20 border border-border/40 rounded-lg space-y-0.5">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider block font-bold">Total Aset</span>
              <span className="text-body-sm font-bold text-foreground block truncate">
                {estimatedFlashcards}FC·{estimatedQuestions}Q
              </span>
            </div>
          </div>
        </div>

        {/* SECTION 2: ASSET GENERATION CENTER */}
        <div className="space-y-3 pb-6 border-b border-border/60">
          <div className="space-y-0.5">
            <h3 className="font-heading text-body-sm font-bold text-foreground flex items-center gap-1.5">
              <Sparkles className="size-4 text-primary shrink-0" />
              Asset Generation Center
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Hasilkan kuis dan kartu memori secara massal berdasarkan kelayakan.
            </p>
          </div>

          {currentProgress.status === "generating" && (
            <div className="p-3 bg-muted/10 border border-border rounded-lg space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold">
                <span className="text-foreground">
                  {currentProgress.flashcardsCurrent < currentProgress.flashcardsTotal || currentProgress.flashcardsTotal === 0 ? (
                    "Membuat Kartu..."
                  ) : (
                    `Kuis: ${currentProgress.questionsCurrent} / ${currentProgress.questionsTotal}`
                  )}
                </span>
                <span className="text-primary font-mono">{percentage}%</span>
              </div>
              <div className="w-full bg-muted rounded-md h-1.5 overflow-hidden border border-border">
                <div 
                  className="bg-primary h-full transition-all duration-500 rounded-md" 
                  style={{ width: `${percentage}%` }} 
                />
              </div>
            </div>
          )}

          {currentProgress.status === "failed" && currentProgress.error && (
            <div className="p-2.5 bg-status-error/5 border border-status-error/20 rounded-lg text-[10px] text-status-error leading-relaxed font-mono">
              Error: {currentProgress.error}
            </div>
          )}

          <Button
            variant={currentProgress.status === "completed" ? "outline" : "default"}
            className={cn(
              "w-full rounded-lg gap-1.5 font-bold text-[11px] h-8.5 cursor-pointer",
              currentProgress.status === "completed" ? "" : "text-white"
            )}
            disabled={currentProgress.status === "generating"}
            onClick={() => handleTriggerBulkGeneration(chapter.id)}
          >
            {currentProgress.status === "generating" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Sparkles className="size-3" />
            )}
            {currentProgress.status === "completed"
              ? "Generate Ulang Aset"
              : currentProgress.status === "generating"
                ? "Memproses..."
                : "Generate All Recommended Assets"}
          </Button>
        </div>
      </div>
    );
  };

  const renderChapterWorkspace = (chapterId: string) => {
    const chapter = chaptersList.find(c => c.id === chapterId);
    if (!chapter) return null;

    const chapterKOs = getKOsForChapter(chapterId);
    const webMat = getWebMatForChapter(chapterId);
    const isStale = webMat?.isStale ?? false;
    const _status = webMat?.status ?? "draft";

    // Group KOs into Mastery Units based on conceptName
    const concepts = chapterKOs.filter(ko => ko.type === "concept_overview" || ko.type === "definition");
    const formulas = chapterKOs.filter(ko => ko.type === "formula");
    // Glossary shows all definitional-type KOs: definition, objective, and summary
    const glossaryKOs = chapterKOs.filter(ko =>
      ko.type === "definition" || ko.type === "objective" || ko.type === "summary"
    );

    interface GlossaryTermItem {
      id: string;
      term: string;
      definition: string;
      source: "document" | "extracted";
    }

    // Extract glossary terms defined as blocks inside the website material structured AST
    const astBlocks = (webMat && Array.isArray(webMat.structuredContent))
      ? (webMat.structuredContent as any[])
      : [];
    
    const docGlossary: GlossaryTermItem[] = astBlocks
      .filter(block => block.type === "glossary_term")
      .map(block => ({
        id: block.id,
        term: block.content?.term || "",
        definition: block.content?.definition || "",
        source: "document"
      }));

    const koGlossary: GlossaryTermItem[] = glossaryKOs.map(ko => ({
      id: ko.id,
      term: ko.title,
      definition: ko.content,
      source: "extracted"
    }));

    const allGlossaryTerms: GlossaryTermItem[] = [...docGlossary];
    koGlossary.forEach(koTerm => {
      const exists = docGlossary.some(doc => doc.term.toLowerCase().trim() === koTerm.term.toLowerCase().trim());
      if (!exists) {
        allGlossaryTerms.push(koTerm);
      }
    });
    const _misconceptions = chapterKOs.filter(ko => ko.type === "misconception");
    const _examples = chapterKOs.filter(ko => ko.type === "example");
    const _exercises = chapterKOs.filter(ko => ko.type === "exercise");
    
    const masteryUnits = concepts.map((concept, index) => {
      const supporting = chapterKOs.filter(ko => 
        ko.id !== concept.id && 
        ko.conceptName.toLowerCase().trim() === concept.conceptName.toLowerCase().trim()
      );
      
      const difficulty = concept.difficulty;
      const threshold = difficulty === "easy" ? 75 : difficulty === "medium" ? 70 : 60;
      
      return {
        id: concept.id || `mu-${index}`,
        concept,
        supporting,
        difficulty,
        threshold,
        importance: concept.importance || "medium"
      };
    });

    if (masteryUnits.length === 0 && chapterKOs.length > 0) {
      masteryUnits.push({
        id: "mu-fallback",
        concept: {
          id: "fallback-concept",
          conceptId: "ko-fallback-concept",
          title: "Konsep Utama Bab",
          conceptName: "Umum",
          content: "Penjelasan konsep umum bab ini.",
          type: "concept_overview",
          difficulty: "medium",
          bloomLevel: "understand",
          importance: "medium",
          courseId: chapter.courseId,
          mtdId: instance.id,
          chapterId: chapter.id,
          learningOrder: 1,
          tags: [],
          pineconeVectorId: null,
          status: "active"
        },
        supporting: chapterKOs,
        difficulty: "medium",
        threshold: 70,
        importance: "medium"
      });
    }

    const _estimatedFlashcards = masteryUnits.length * 3;
    const _estimatedQuestions = formulas.length * 2 || 6;

    return (
      <div className="space-y-6 text-left">
        {/* Diff/Stale Warning box if stale */}
        {isStale && (
          <div className="p-4 rounded-lg bg-status-error/10 border border-status-error/20 text-left space-y-3">
            <div className="flex gap-2 text-status-error">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-body-sm font-bold">Aset Website Out-of-Sync</h4>
                <p className="text-xs text-status-error/90 mt-0.5 leading-relaxed">
                  Tutor melakukan perubahan pada Objek Pengetahuan (KO) di bab ini. Modul ajar siswa saat ini menggunakan data lama. Klik &quot;Bandingkan &amp; Sinkronkan&quot; untuk menyelaraskan.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                className="rounded-md text-xs bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer"
                onClick={() => setShowStaleDiff(chapter.id)}
              >
                Bandingkan &amp; Sinkronkan
              </Button>
            </div>
          </div>
        )}

        {/* Workspace Tab Bar */}
        <div className="border-b border-border">
          <div className="flex gap-2">
            {[
              { id: "mastery", label: "Mastery Units" },
              { id: "formulas", label: "Formulas" },
              { id: "glossary", label: `Glossary (${allGlossaryTerms.length})` },
              { id: "graph", label: "Knowledge Graph" },
              { id: "all-kos", label: `All KOs (${chapterKOs.length})` },
              { id: "website-material", label: "Materi Website" }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "px-4 py-2 text-xs font-bold transition-all border-b-2 -mb-[2px] cursor-pointer",
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Contents */}
        <div className="space-y-4">
          
          {/* TAB 1: MASTERY UNITS */}
          {activeTab === "mastery" && (
            <div className="space-y-4">
              {masteryUnits.map(mu => {
                const isExpanded = !!expandedMUs[mu.id];
                return (
                  <div key={mu.id} className="border border-border rounded-xl overflow-hidden bg-card shadow-xs">
                    <div 
                      className="px-5 py-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-muted/10 transition-colors"
                      onClick={() => setExpandedMUs(prev => ({ ...prev, [mu.id]: !prev[mu.id] }))}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-body-base font-bold text-foreground">{mu.concept.conceptName}</span>
                          <span className={cn(
                            "text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase border",
                            mu.difficulty === "easy"
                              ? "bg-status-success/10 text-status-success border-status-success/20"
                              : mu.difficulty === "medium"
                                ? "bg-status-warning/10 text-status-warning border-status-warning/20"
                                : "bg-status-error/10 text-status-error border-status-error/20"
                          )}>
                            {mu.difficulty}
                          </span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground border border-border uppercase">
                            Bloom: {mu.concept.bloomLevel}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {mu.supporting.length} Aset Pendukung (Formula/Miskonsepsi/Contoh) · Nilai Ambang Batas: <span className="font-semibold text-foreground">{mu.threshold}%</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="xs"
                          className="rounded-md font-semibold text-xs h-8 px-3 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedChapter(chapter);
                            handleStartEditKO(mu.concept);
                            setIsKODrawerOpen(true);
                          }}
                        >
                          Edit Konsep
                        </Button>
                        <span className="text-muted-foreground font-mono text-xs select-none">
                          {isExpanded ? "[Tutup]" : "[Buka]"}
                        </span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-5 pb-5 pt-3 border-t border-border bg-muted/5 space-y-4">
                        <div className="space-y-1.5 p-4 bg-background border border-border rounded-lg">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold">Penjelasan Konsep</span>
                          <MathText className="text-body-sm text-foreground block leading-relaxed" as="div">
                            {mu.concept.content}
                          </MathText>
                        </div>

                        {mu.supporting.length > 0 ? (
                          <div className="space-y-3">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold">Aset Pendukung Mastery</span>
                            
                            <div className="grid gap-3">
                              {mu.supporting.map(ko => (
                                <div key={ko.id} className="p-3.5 bg-background border border-border rounded-lg space-y-2">
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-2">
                                      <span className="inline-block font-mono text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase border border-border font-bold">
                                        {ko.type}
                                      </span>
                                      <span className="text-body-xs font-bold text-foreground">{ko.title}</span>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="xs"
                                      className="rounded-md font-semibold text-[10px] h-6 px-2 cursor-pointer"
                                      onClick={() => {
                                        setSelectedChapter(chapter);
                                        handleStartEditKO(ko);
                                        setIsKODrawerOpen(true);
                                      }}
                                    >
                                      Edit KO
                                    </Button>
                                  </div>

                                  <div className="text-xs text-muted-foreground leading-relaxed pl-1.5 border-l border-border">
                                    <MathText as="div">{ko.content}</MathText>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">Belum ada aset pendukung (seperti rumus atau latihan) yang dikaitkan dengan konsep ini.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 2: FORMULAS */}
          {activeTab === "formulas" && (
            <div className="grid gap-4 sm:grid-cols-2">
              {formulas.length > 0 ? (
                formulas.map(ko => (
                  <div key={ko.id} className="bg-card border border-border rounded-xl p-5 space-y-3 shadow-xs">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-semibold">{ko.conceptName}</span>
                        <h4 className="text-body-sm font-bold text-foreground mt-0.5">{ko.title}</h4>
                      </div>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="rounded-md font-semibold text-xs h-7 px-2 cursor-pointer"
                        onClick={() => {
                          setSelectedChapter(chapter);
                          handleStartEditKO(ko);
                          setIsKODrawerOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                    </div>

                    <div className="p-3 bg-muted/10 border border-border/80 rounded-lg text-sm text-foreground overflow-x-auto">
                      <MathText as="div">{ko.content}</MathText>
                    </div>
                  </div>
                ))
              ) : (
                <div className="sm:col-span-2 py-8 text-center text-muted-foreground italic border border-dashed border-border rounded-xl bg-card">
                  Tidak ditemukan rumus matematika khusus dalam bab ini.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: GLOSSARY */}
          {activeTab === "glossary" && (
            <div className="border border-border rounded-xl bg-card overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-body-sm">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="px-5 py-3 font-semibold text-foreground text-xs uppercase tracking-wider text-left">Istilah / Term</th>
                      <th className="px-5 py-3 font-semibold text-foreground text-xs uppercase tracking-wider text-left">Sumber</th>
                      <th className="px-5 py-3 font-semibold text-foreground text-xs uppercase tracking-wider text-left">Definisi & Penjelasan</th>
                      <th className="px-5 py-3 font-semibold text-foreground text-xs uppercase tracking-wider w-20 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {allGlossaryTerms.length > 0 ? (
                      allGlossaryTerms.map(term => (
                        <tr key={term.id} className="hover:bg-muted/10 transition-colors">
                          <td className="px-5 py-4 font-bold text-foreground align-top whitespace-nowrap">{term.term}</td>
                          <td className="px-5 py-4 align-top">
                            <span className={cn(
                              "inline-block font-mono text-[9px] px-1.5 py-0.5 rounded border uppercase",
                              term.source === "document"
                                ? "bg-brand-primary/10 text-brand-primary border-brand-primary/20"
                                : "bg-muted text-muted-foreground border-border"
                            )}>
                              {term.source === "document" ? "Dokumen" : "Ekstraksi AI"}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-muted-foreground leading-relaxed align-top">
                            <MathText as="div">{term.definition}</MathText>
                          </td>
                          <td className="px-5 py-4 align-top text-center whitespace-nowrap">
                            {term.source === "extracted" ? (
                              <Button
                                variant="ghost"
                                size="xs"
                                className="rounded-md font-semibold text-xs h-7 px-2 cursor-pointer"
                                onClick={() => {
                                  const ko = glossaryKOs.find(k => k.id === term.id);
                                  if (ko) {
                                    setSelectedChapter(chapter);
                                    handleStartEditKO(ko);
                                    setIsKODrawerOpen(true);
                                  }
                                }}
                              >
                                Edit
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground italic select-none">Bawaan Dokumen</span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground italic">
                          Tidak ada glosarium terdaftar di bab ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: KNOWLEDGE GRAPH */}
          {activeTab === "graph" && (
            <div className="space-y-4">
              <div className="bg-card border border-border rounded-xl p-5 shadow-xs space-y-4">
                <div>
                  <h3 className="font-heading text-body-sm font-bold text-foreground uppercase tracking-wider">Jalur Prasyarat & Alur Belajar</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Urutan logis penguasaan konsep yang terstruktur dalam graf pembelajaran.</p>
                </div>
                
                <div className="relative pl-6 space-y-5 border-l-2 border-border/80 ml-2 py-1">
                  {masteryUnits.map((mu, index) => (
                    <div key={mu.id} className="relative">
                      <div className="absolute -left-[30px] top-1.5 size-4 rounded-full border-2 border-primary bg-background flex items-center justify-center">
                        <div className="size-1.5 rounded-full bg-primary" />
                      </div>
                      <div className="space-y-1 bg-muted/10 border border-border/60 p-4 rounded-lg">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-muted-foreground">LANGKAH {index + 1}</span>
                          <span className="text-body-sm font-bold text-foreground">{mu.concept.conceptName}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {index < masteryUnits.length - 1 
                            ? `Prasyarat wajib sebelum mempelajari konsep "${masteryUnits[index + 1].concept.conceptName}"` 
                            : "Gerbang keluar bab (Selesai). Siap dievaluasi."}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "all-kos" && (
            <div className="border border-border rounded-xl bg-card overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="px-4 py-3 font-semibold text-foreground text-[10px] uppercase tracking-wider text-left">Judul KO</th>
                      <th className="px-4 py-3 font-semibold text-foreground text-[10px] uppercase tracking-wider text-left">Nama Konsep</th>
                      <th className="px-4 py-3 font-semibold text-foreground text-[10px] uppercase tracking-wider text-left w-24">Tipe</th>
                      <th className="px-4 py-3 font-semibold text-foreground text-[10px] uppercase tracking-wider text-left w-20">Kesulitan</th>
                      <th className="px-4 py-3 font-semibold text-foreground text-[10px] uppercase tracking-wider text-left w-24">Bloom</th>
                      <th className="px-4 py-3 font-semibold text-foreground text-[10px] uppercase tracking-wider text-left w-20">Penting</th>
                      <th className="px-4 py-3 font-semibold text-foreground text-[10px] uppercase tracking-wider w-20 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {chapterKOs.map(ko => (
                      <tr key={ko.id} className="hover:bg-muted/10 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground truncate max-w-[200px]" title={ko.title}>{ko.title}</td>
                        <td className="px-4 py-3 text-muted-foreground truncate max-w-[150px]" title={ko.conceptName}>{ko.conceptName}</td>
                        <td className="px-4 py-3 align-middle font-mono text-[10px] text-muted-foreground uppercase">{ko.type}</td>
                        <td className="px-4 py-3 align-middle">
                          <span className={cn(
                            "inline-block font-mono text-[9px] px-1.5 py-0.5 rounded border uppercase",
                            ko.difficulty === "easy"
                              ? "bg-status-success/10 text-status-success border-status-success/20"
                              : ko.difficulty === "medium"
                                ? "bg-status-warning/10 text-status-warning border-status-warning/20"
                                : "bg-status-error/10 text-status-error border-status-error/20"
                          )}>
                            {ko.difficulty}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-middle text-muted-foreground capitalize font-mono text-[10px]">{ko.bloomLevel}</td>
                        <td className="px-4 py-3 align-middle text-muted-foreground capitalize font-mono text-[10px]">{ko.importance}</td>
                        <td className="px-4 py-3 align-middle text-center">
                          <Button
                            variant="ghost"
                            size="xs"
                            className="rounded-md font-semibold text-[10px] h-7 px-2 cursor-pointer"
                            onClick={() => {
                              setSelectedChapter(chapter);
                              handleStartEditKO(ko);
                              setIsKODrawerOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "website-material" && (
            <div className="space-y-6">
              {/* Controls bar */}
              <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex items-center justify-between flex-wrap gap-4 text-left">
                <div className="flex items-center gap-3">
                  <span className="text-body-sm font-bold text-foreground">Mode Editor:</span>
                  <div className="flex bg-muted p-1 rounded-lg border border-border">
                    <button
                      type="button"
                      onClick={() => setEditorMode("visual")}
                      className={cn(
                        "px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer",
                        editorMode === "visual"
                          ? "bg-background text-primary shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Penyunting Blok (Visual)
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorMode("raw")}
                      className={cn(
                        "px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer",
                        editorMode === "raw"
                          ? "bg-background text-primary shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      Raw Markdown (Kanonik)
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="default"
                    className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5 h-9"
                    disabled={savingWebMat}
                    onClick={() => handleSaveWebMat(chapter.id)}
                  >
                    {savingWebMat ? (
                      <Loader2 className="size-4 animate-spin mr-1" />
                    ) : (
                      <Check className="size-4 mr-1" />
                    )}
                    Simpan Materi Website
                  </Button>
                </div>
              </div>

              {!webMat ? (
                <div className="py-12 text-center text-muted-foreground italic border border-dashed border-border rounded-xl bg-card">
                  Materi website belum di-generate untuk bab ini. Silakan generate kartu memori & kuis terlebih dahulu untuk memicu pembuatan materi.
                </div>
              ) : editorMode === "raw" ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-left">
                  {/* Raw Textarea */}
                  <div className="space-y-1.5">
                    <label className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                      Markdown Kanonik
                    </label>
                    <textarea
                      rows={25}
                      className="w-full rounded-xl border border-input bg-background p-4 text-body-sm font-mono leading-relaxed focus:border-primary focus:ring-1 focus:ring-primary/50"
                      value={rawMarkdown}
                      onChange={(e) => setRawMarkdown(e.target.value)}
                    />
                  </div>

                  {/* HTML Live Preview */}
                  <div className="space-y-1.5">
                    <label className="text-body-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                      Live Preview Hasil Akhir
                    </label>
                    <div className="border border-border rounded-xl p-5 bg-card overflow-y-auto max-h-[550px] space-y-4">
                      {rawMarkdown ? (
                        <MarkdownRenderer content={rawMarkdown} />
                      ) : (
                        <p className="text-muted-foreground text-body-sm italic">Belum ada konten.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 text-left">
                  {/* Blocks List */}
                  <div className="space-y-1">
                    {/* Hover-only insert at top */}
                    <div className="relative group/top flex justify-center h-2 my-1">
                      {showAddBlockDropdown === 0 ? (
                        <div className="absolute top-1 z-30 bg-background border border-border shadow-md rounded-lg p-2 flex items-center gap-1.5 flex-wrap animate-in fade-in">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase px-1.5 select-none">Sisipkan di Awal:</span>
                          {["h", "p", "concept", "formula", "example", "misconception", "visual-flowchart", "visual-diagram", "visual-chart", "visual-graph"].map((t) => (
                            <button
                              key={t}
                              type="button"
                              className="px-2 py-0.5 text-[11px] bg-muted hover:bg-primary hover:text-white rounded border border-border transition-colors font-medium cursor-pointer"
                              onClick={() => {
                                addBlock(0, t);
                                setShowAddBlockDropdown(null);
                              }}
                            >
                              {t === "h" ? "Header" : t === "p" ? "Paragraf" : t}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="p-0.5 hover:bg-muted rounded text-muted-foreground cursor-pointer"
                            onClick={() => setShowAddBlockDropdown(null)}
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="opacity-0 group-hover/top:opacity-100 transition-opacity absolute top-0 px-2 py-0.5 text-[9px] border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary rounded-md cursor-pointer"
                          onClick={() => setShowAddBlockDropdown(0)}
                        >
                          + Sisipkan di Awal
                        </button>
                      )}
                    </div>

                    {blocks.map((block, idx) => (
                      <div key={block.id || idx} className="space-y-0">
                        {/* Notion-style block wrapper */}
                        <div className="relative group rounded-xl py-1.5 px-3 border border-transparent hover:border-border/60 hover:bg-muted/10 transition-all">
                          {/* Floating badge for block type on hover */}
                          <div className="absolute -top-3 left-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-primary text-primary-foreground font-mono text-[9px] px-2 py-0.5 rounded-md uppercase font-bold select-none pointer-events-none shadow-xs">
                            {block.type === "visual" ? `visual: ${block.visualType}` : block.type} #{idx + 1}
                          </div>

                          {/* Floating actions toolbar on hover */}
                          <div className="absolute right-4 -top-3.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-background border border-border shadow-md rounded-lg p-1">
                            <Button
                              variant="ghost"
                              size="xs"
                              disabled={idx === 0}
                              className="h-7 w-7 p-0 rounded-md hover:bg-muted cursor-pointer"
                              onClick={() => moveBlock(idx, "up")}
                              title="Pindahkan Ke Atas"
                            >
                              <ChevronUp className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              disabled={idx === blocks.length - 1}
                              className="h-7 w-7 p-0 rounded-md hover:bg-muted cursor-pointer"
                              onClick={() => moveBlock(idx, "down")}
                              title="Pindahkan Ke Bawah"
                            >
                              <ChevronDown className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              className="h-7 w-7 p-0 rounded-md hover:bg-muted cursor-pointer text-emerald-600 hover:text-emerald-700 font-bold"
                              onClick={() => setShowAddBlockDropdown(showAddBlockDropdown === idx + 1 ? null : idx + 1)}
                              title="Sisipkan Blok Baru di Bawah"
                            >
                              <Plus className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              className="h-7 w-7 p-0 rounded-md hover:bg-muted cursor-pointer"
                              onClick={() => handleStartEditBlock(idx)}
                              title="Edit Blok"
                            >
                              <Edit2 className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              className="h-7 w-7 p-0 rounded-md hover:bg-rose-50 text-rose-600 hover:text-rose-700 cursor-pointer"
                              onClick={() => deleteBlock(idx)}
                              title="Hapus Blok"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>

                          {/* Floating insertion dropdown inside the block, absolutely positioned at bottom-left */}
                          {showAddBlockDropdown === idx + 1 && (
                            <div className="absolute left-4 -bottom-6 z-30 bg-background border border-border shadow-md rounded-lg p-2 flex items-center gap-1.5 flex-wrap animate-in fade-in slide-in-from-top-1">
                              <span className="text-[10px] font-bold text-muted-foreground uppercase px-1.5 select-none">Sisipkan Baru:</span>
                              {["h", "p", "concept", "formula", "example", "misconception", "visual-flowchart", "visual-diagram", "visual-chart", "visual-graph"].map((t) => (
                                <button
                                  key={t}
                                  type="button"
                                  className="px-2 py-0.5 text-[11px] bg-muted hover:bg-primary hover:text-white rounded border border-border transition-colors font-medium cursor-pointer"
                                  onClick={() => {
                                    addBlock(idx + 1, t);
                                    setShowAddBlockDropdown(null);
                                  }}
                                >
                                  {t === "h" ? "Header" : t === "p" ? "Paragraf" : t}
                                </button>
                              ))}
                              <button
                                type="button"
                                className="p-0.5 hover:bg-muted rounded text-muted-foreground cursor-pointer"
                                onClick={() => setShowAddBlockDropdown(null)}
                              >
                                <X className="size-3" />
                              </button>
                            </div>
                          )}

                          {/* Mirror student view */}
                          <div className="w-full text-left">
                            <MarkdownRenderer content={[block]} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-border flex justify-end">
                    <Button
                      variant="default"
                      className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5 h-10"
                      disabled={savingWebMat}
                      onClick={() => handleSaveWebMat(chapter.id)}
                    >
                      {savingWebMat ? (
                        <Loader2 className="size-4 animate-spin mr-1" />
                      ) : (
                        <Check className="size-4 mr-1" />
                      )}
                      Simpan Seluruh Perubahan Materi
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header breadcrumb & info bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1 text-left">
          <Button variant="ghost" size="xs" className="text-muted-foreground -ml-2 mb-1 gap-1" asChild>
            <Link href="/admin/ai/materials">
              <ArrowLeft className="size-3.5" aria-hidden />
              Kembali ke Materi
            </Link>
          </Button>
          <h1 className="font-heading text-h4 font-bold text-foreground">
            {activeChapterId 
              ? `${chaptersList.find(c => c.id === activeChapterId)?.title || "Workspace Bab"}`
              : cleanTitle}
          </h1>
          <p className="text-body-sm text-muted-foreground">
            Materi Kelas: <span className="font-semibold text-foreground">{course.title}</span> · Sumber: <span className="font-mono text-xs uppercase px-1.5 py-0.5 bg-muted rounded-md border border-border">{instance.sourceType}</span>
          </p>
        </div>
      </div>

      {activeChapterId ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left/Center: Chapter Workspace */}
          <div className="lg:col-span-2 space-y-6">
            {renderChapterWorkspace(activeChapterId)}
          </div>

          {/* Right Side: Info Panel (Notion-style, no heavy cards) */}
          <div className="space-y-6 lg:border-l lg:border-border/60 lg:pl-6">
            {renderChapterSidebar(activeChapterId)}

            {/* SECTION 3: INFO DOKUMEN UTAMA */}
            <div className="space-y-3 pb-6 border-b border-border/60 text-left">
              <h3 className="font-heading text-body-sm font-bold text-foreground flex items-center gap-1.5">
                <BookOpen className="size-4 text-primary shrink-0" />
                Info Dokumen Utama
              </h3>
              
              <div className="space-y-2.5 text-xs font-sans">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase tracking-wider font-semibold">Judul Materi</span>
                  <span className="font-semibold text-foreground mt-0.5 block">{cleanTitle}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase tracking-wider font-semibold">Kursus</span>
                  <span className="font-semibold text-foreground mt-0.5 block">{course.title}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase tracking-wider font-semibold">Sinkronisasi Vektor</span>
                  <span className={`inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-bold mt-1 border uppercase ${
                    instance.pineconeSyncStatus === "synced" 
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" 
                      : instance.pineconeSyncStatus === "pending"
                        ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                        : "bg-destructive/10 text-destructive border-destructive/20"
                  }`}>
                    {instance.pineconeSyncStatus}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase tracking-wider font-semibold">Ringkasan</span>
                  <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed line-clamp-4">{cleanSummary(instance.summary)}</p>
                </div>
              </div>
            </div>

            {/* SECTION 4: ALUR KERJA TUTOR ZYX */}
            <div className="space-y-2.5 text-left">
              <div className="flex gap-2 text-muted-foreground">
                <Info className="size-3.5 shrink-0 mt-0.5 text-primary" />
                <div>
                  <h4 className="text-[11px] font-bold text-foreground">Alur Kerja Tutor Zyx</h4>
                  <p className="text-[10px] leading-relaxed mt-1 text-muted-foreground">
                    1. Perbaiki kesalahan pengetikan atau visualisasi rumus LaTeX langsung di Inspeksi KO.<br />
                    2. Mengubah KO secara otomatis memicu tanda stale pada Website Material agar tidak terjadi inkonsistensi.<br />
                    3. Setelah memverifikasi keselarasan materi, lakukan &quot;Sinkronkan&quot; untuk me-resolve status stale.<br />
                    4. Buat Flashcard dan Soal Kuis untuk siswa setelah materi dirasa matang.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="py-12 text-center text-muted-foreground italic border border-dashed border-border rounded-xl bg-card">
          Materi ini belum terdekomposisi menjadi bab. Silakan unggah dokumen yang valid.
        </div>
      )}

      {/* DIALOG: COMPARE & SYNC STALE MATERIAL */}
      {showStaleDiff && (() => {
        const chapter = chaptersList.find(c => c.id === showStaleDiff);
        const webMat = getWebMatForChapter(showStaleDiff);
        if (!chapter || !webMat) return null;
        
        return (
          <Dialog open={!!showStaleDiff} onOpenChange={() => setShowStaleDiff(null)}>
            <DialogContent className="rounded-xl max-w-2xl border border-border">
              <DialogHeader>
                <DialogTitle className="font-heading text-h6 font-semibold flex items-center gap-2 text-rose-600">
                  <AlertTriangle className="size-5" />
                  Penyelarasan Materi Bab: {chapter.title}
                </DialogTitle>
                <DialogDescription className="text-body-sm leading-relaxed mt-1">
                  Perubahan Objek Pengetahuan (KO) telah terdeteksi. Silakan verifikasi dan sinkronkan agar website material siswa mencerminkan revisi terbaru.
                </DialogDescription>
              </DialogHeader>

              <div className="my-4 space-y-3 text-left">
                <div className="bg-muted p-4 rounded-lg border border-border space-y-2">
                  <span className="font-semibold text-xs text-muted-foreground uppercase block">Daftar KO yang Berubah</span>
                  <ul className="text-xs list-disc list-inside space-y-1 text-foreground">
                    {getKOsForChapter(chapter.id).map(ko => (
                      <li key={ko.id}>
                        <span className="font-semibold">{ko.title}</span> ({ko.type})
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Menyetujui penyelarasan ini akan memperbarui hash keandalan pembelajaran, membersihkan tanda <strong>stale</strong>, dan memastikan Zyra merujuk pada versi KO ini untuk mendampingi siswa.
                </p>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  className="rounded-lg"
                  onClick={() => setShowStaleDiff(null)}
                  disabled={loadingChapterId === chapter.id + "-sync"}
                >
                  Batal
                </Button>
                <Button
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                  disabled={loadingChapterId === chapter.id + "-sync"}
                  onClick={() => handleSyncMaterial(chapter.id)}
                >
                  {loadingChapterId === chapter.id + "-sync" ? (
                    <>
                      <Loader2 className="size-4 mr-1.5 animate-spin" />
                      Mensinkronkan...
                    </>
                  ) : (
                    "Sinkronkan Aset Sekarang"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* DIALOG: ADVANCED KNOWLEDGE OBJECT INSPECTOR DRAWER */}
      {isKODrawerOpen && selectedChapter && (
        <Dialog open={isKODrawerOpen} onOpenChange={setIsKODrawerOpen}>
          <DialogContent className="rounded-xl max-w-4xl max-h-[90vh] overflow-y-auto border border-border">
            <DialogHeader className="border-b border-border pb-4">
              <DialogTitle className="font-heading text-h6 font-semibold flex items-center gap-2">
                <Layers className="size-5 text-primary" />
                Kurator Objek Pengetahuan - Bab {selectedChapter.orderIndex}
              </DialogTitle>
              <DialogDescription className="text-body-sm leading-relaxed mt-1 text-left">
                Detail pemetaan Objek Pengetahuan (KO) untuk bab <strong>{selectedChapter.title}</strong>. Edit definisi atau perbaiki representasi rumus LaTeX di bawah ini.
              </DialogDescription>
            </DialogHeader>

            <div className="my-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
              {/* Left Column: KO List */}
              <div className="space-y-3 border-r border-border pr-6 max-h-[500px] overflow-y-auto">
                <span className="font-semibold text-xs text-muted-foreground uppercase tracking-wider block mb-1">
                  Daftar Objek Pengetahuan ({getKOsForChapter(selectedChapter.id).length})
                </span>
                
                {getKOsForChapter(selectedChapter.id).map(ko => (
                  <div 
                    key={ko.id}
                    className={`p-3 rounded-lg border transition-all cursor-pointer ${
                      editingKO?.id === ko.id 
                        ? "bg-primary/5 border-primary shadow-xs" 
                        : "border-border hover:bg-muted/50"
                    }`}
                    onClick={() => handleStartEditKO(ko)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-body-sm font-bold text-foreground line-clamp-1">{ko.title}</h4>
                        <span className="inline-block mt-1 font-mono text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground uppercase border border-border">
                          {ko.type}
                        </span>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase border ${
                        ko.difficulty === "easy"
                          ? "bg-status-success/10 text-status-success border-status-success/20"
                          : ko.difficulty === "medium"
                            ? "bg-status-warning/10 text-status-warning border-status-warning/20"
                            : "bg-status-error/10 text-status-error border-status-error/20"
                      }`}>
                        {ko.difficulty}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Right Column: KO Edit Form */}
              <div className="space-y-4">
                {editingKO ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <span className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                        Editor Objek Pengetahuan
                      </span>
                      <Button
                        variant="ghost"
                        size="xs"
                        className="rounded-md size-6 p-0"
                        onClick={() => setEditingKO(null)}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase">Nama Konsep</label>
                        <input
                          type="text"
                          className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-body-sm text-foreground shadow-xs focus:border-primary focus:ring-1 focus:ring-primary"
                          value={koForm.conceptName}
                          onChange={e => setKOForm(prev => ({ ...prev, conceptName: e.target.value }))}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase">Judul Objek</label>
                        <input
                          type="text"
                          className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-body-sm text-foreground shadow-xs focus:border-primary focus:ring-1 focus:ring-primary"
                          value={koForm.title}
                          onChange={e => setKOForm(prev => ({ ...prev, title: e.target.value }))}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-muted-foreground uppercase">Kategori</label>
                          <select
                            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-body-sm text-foreground shadow-xs focus:border-primary focus:ring-1 focus:ring-primary"
                            value={koForm.type}
                            onChange={e => setKOForm(prev => ({ ...prev, type: e.target.value as any }))}
                          >
                            <option value="definition">definition</option>
                            <option value="formula">formula</option>
                            <option value="example">example</option>
                            <option value="misconception">misconception</option>
                            <option value="exercise">exercise</option>
                            <option value="summary">summary</option>
                            <option value="objective">objective</option>
                            <option value="concept_overview">concept_overview</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-muted-foreground uppercase">Kesulitan</label>
                          <select
                            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-body-sm text-foreground shadow-xs focus:border-primary focus:ring-1 focus:ring-primary"
                            value={koForm.difficulty}
                            onChange={e => setKOForm(prev => ({ ...prev, difficulty: e.target.value as any }))}
                          >
                            <option value="easy">easy</option>
                            <option value="medium">medium</option>
                            <option value="hard">hard</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-muted-foreground uppercase">Taksonomi Bloom</label>
                          <select
                            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-body-sm text-foreground shadow-xs focus:border-primary focus:ring-1 focus:ring-primary"
                            value={koForm.bloomLevel}
                            onChange={e => setKOForm(prev => ({ ...prev, bloomLevel: e.target.value as any }))}
                          >
                            <option value="remember">remember</option>
                            <option value="understand">understand</option>
                            <option value="apply">apply</option>
                            <option value="analyze">analyze</option>
                            <option value="evaluate">evaluate</option>
                            <option value="create">create</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-muted-foreground uppercase">Tingkat Penting</label>
                          <select
                            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-body-sm text-foreground shadow-xs focus:border-primary focus:ring-1 focus:ring-primary"
                            value={koForm.importance}
                            onChange={e => setKOForm(prev => ({ ...prev, importance: e.target.value as any }))}
                          >
                            <option value="high">high</option>
                            <option value="medium">medium</option>
                            <option value="low">low</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase">Konten Penjelasan (Markdown / LaTeX)</label>
                        <textarea
                          rows={6}
                          className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs text-foreground shadow-xs focus:border-primary focus:ring-1 focus:ring-primary"
                          value={koForm.content}
                          onChange={e => setKOForm(prev => ({ ...prev, content: e.target.value }))}
                        />
                      </div>

                      <Button
                        className="w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                        disabled={savingKOId === editingKO.id}
                        onClick={handleSaveKO}
                      >
                        {savingKOId === editingKO.id ? (
                          <>
                            <Loader2 className="size-4 mr-1.5 animate-spin" />
                            Menyimpan...
                          </>
                        ) : (
                          "Simpan Perubahan KO"
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-border rounded-lg text-muted-foreground bg-muted/5">
                    <Info className="size-8 text-muted-foreground/60 mb-2" />
                    <p className="text-body-sm font-semibold">Pilih Objek Pengetahuan</p>
                    <p className="text-xs mt-0.5">Pilih salah satu KO di panel kiri untuk melihat detail atau melakukan perubahan.</p>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="border-t border-border pt-4">
              <Button
                type="button"
                className="rounded-lg"
                onClick={() => setIsKODrawerOpen(false)}
              >
                Selesai
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* DIALOG: VISUAL BLOCK EDITOR */}
      {editingBlockIndex !== null && editingBlockData && (
        <Dialog open={editingBlockIndex !== null} onOpenChange={(open) => {
          if (!open) {
            setEditingBlockIndex(null);
            setEditingBlockData(null);
          }
        }}>
          <DialogContent className="rounded-xl max-w-4xl max-h-[90vh] overflow-y-auto border border-border">
            <DialogHeader className="border-b border-border pb-4">
              <DialogTitle className="font-heading text-h6 font-semibold flex items-center gap-2">
                <Edit2 className="size-5 text-primary" />
                Edit Blok: {editingBlockData.type.toUpperCase()}
              </DialogTitle>
              <DialogDescription className="text-body-sm leading-relaxed mt-1 text-left">
                Sesuaikan data blok secara visual. Konten akan disimpan ke dokumen materi ketika Anda menekan &quot;Simpan Materi Website&quot;.
              </DialogDescription>
            </DialogHeader>

            <div className="my-6 space-y-4 text-left">
              {/* Type-specific inputs */}
              {editingBlockData.type === "h" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase">Level Header</label>
                    <select
                      className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-body-sm text-foreground shadow-xs focus:border-primary focus:ring-1 focus:ring-primary"
                      value={editingBlockData.level || 2}
                      onChange={(e) => setEditingBlockData((prev: any) => ({ ...prev, level: parseInt(e.target.value, 10) }))}
                    >
                      <option value={1}>Heading 1 (Sangat Besar)</option>
                      <option value={2}>Heading 2 (Besar)</option>
                      <option value={3}>Heading 3 (Sedang)</option>
                      <option value={4}>Heading 4 (Kecil)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase">Konten Teks</label>
                    <input
                      type="text"
                      className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-body-sm text-foreground shadow-xs focus:border-primary focus:ring-1 focus:ring-primary"
                      value={editingBlockData.content || ""}
                      onChange={(e) => setEditingBlockData((prev: any) => ({ ...prev, content: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              {(editingBlockData.type === "p" || editingBlockData.type === "blockquote") && (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-muted-foreground uppercase">Isi Teks</label>
                      <span className="text-[10px] text-muted-foreground">Markdown dan LaTeX didukung</span>
                    </div>
                    
                    {/* LaTeX Toolbar */}
                    <div className="flex gap-1 flex-wrap my-1 p-1 bg-muted/20 border border-border rounded-md">
                      {LATEX_TOOLBAR.map((tool) => (
                        <button
                          key={tool.label}
                          type="button"
                          title={tool.title}
                          className="px-2 py-1 text-xs font-mono bg-background hover:bg-muted border border-border rounded-sm transition-colors text-foreground cursor-pointer"
                          onClick={() => {
                            const textarea = document.getElementById("block-textarea-content") as HTMLTextAreaElement;
                            if (textarea) {
                              const start = textarea.selectionStart;
                              const end = textarea.selectionEnd;
                              const text = textarea.value;
                              const inserted = tool.code;
                              const val = text.substring(0, start) + inserted + text.substring(end);
                              setEditingBlockData((prev: any) => ({ ...prev, content: val }));
                              setTimeout(() => {
                                textarea.focus();
                                textarea.setSelectionRange(start + inserted.length, start + inserted.length);
                              }, 10);
                            }
                          }}
                        >
                          {tool.label}
                        </button>
                      ))}
                    </div>

                    <textarea
                      id="block-textarea-content"
                      rows={6}
                      className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-body-sm text-foreground font-sans shadow-xs focus:border-primary focus:ring-1 focus:ring-primary"
                      value={editingBlockData.content || ""}
                      onChange={(e) => setEditingBlockData((prev: any) => ({ ...prev, content: e.target.value }))}
                    />
                  </div>

                  {editingBlockData.content && (
                    <div className="p-3 bg-muted/10 border border-border rounded-lg space-y-1">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold">Pratinjau Live:</span>
                      <div className="text-body-sm text-foreground leading-relaxed">
                        <MathText as="div">{editingBlockData.content}</MathText>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {editingBlockData.type === "concept" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase">Judul Konsep</label>
                    <input
                      type="text"
                      className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-body-sm text-foreground shadow-xs focus:border-primary focus:ring-1 focus:ring-primary"
                      value={editingBlockData.content?.title || ""}
                      onChange={(e) => setEditingBlockData((prev: any) => ({
                        ...prev,
                        content: { ...prev.content, title: e.target.value }
                      }))}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase">Penjelasan Konsep</label>
                    
                    {/* LaTeX Toolbar */}
                    <div className="flex gap-1 flex-wrap my-1 p-1 bg-muted/20 border border-border rounded-md">
                      {LATEX_TOOLBAR.map((tool) => (
                        <button
                          key={tool.label}
                          type="button"
                          title={tool.title}
                          className="px-2 py-1 text-xs font-mono bg-background hover:bg-muted border border-border rounded-sm transition-colors text-foreground cursor-pointer"
                          onClick={() => {
                            const textarea = document.getElementById("block-textarea-bodyMarkdown") as HTMLTextAreaElement;
                            if (textarea) {
                              const start = textarea.selectionStart;
                              const end = textarea.selectionEnd;
                              const text = textarea.value;
                              const inserted = tool.code;
                              const val = text.substring(0, start) + inserted + text.substring(end);
                              setEditingBlockData((prev: any) => ({
                                ...prev,
                                content: { ...prev.content, bodyMarkdown: val }
                              }));
                              setTimeout(() => {
                                textarea.focus();
                                textarea.setSelectionRange(start + inserted.length, start + inserted.length);
                              }, 10);
                            }
                          }}
                        >
                          {tool.label}
                        </button>
                      ))}
                    </div>

                    <textarea
                      id="block-textarea-bodyMarkdown"
                      rows={6}
                      className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-body-sm text-foreground font-sans shadow-xs focus:border-primary focus:ring-1 focus:ring-primary"
                      value={editingBlockData.content?.bodyMarkdown || ""}
                      onChange={(e) => setEditingBlockData((prev: any) => ({
                        ...prev,
                        content: { ...prev.content, bodyMarkdown: e.target.value }
                      }))}
                    />
                  </div>
                </div>
              )}

              {editingBlockData.type === "formula" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase">Nama / Judul Rumus</label>
                    <input
                      type="text"
                      className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-body-sm text-foreground shadow-xs focus:border-primary focus:ring-1 focus:ring-primary"
                      value={editingBlockData.content?.title || ""}
                      onChange={(e) => setEditingBlockData((prev: any) => ({
                        ...prev,
                        content: { ...prev.content, title: e.target.value }
                      }))}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase">Rumus LaTeX (Tanpa Tanda Dollar)</label>
                    
                    {/* LaTeX Toolbar */}
                    <div className="flex gap-1 flex-wrap my-1 p-1 bg-muted/20 border border-border rounded-md">
                      {LATEX_TOOLBAR.map((tool) => (
                        <button
                          key={tool.label}
                          type="button"
                          title={tool.title}
                          className="px-2 py-1 text-xs font-mono bg-background hover:bg-muted border border-border rounded-sm transition-colors text-foreground cursor-pointer"
                          onClick={() => {
                            const textarea = document.getElementById("block-textarea-latex") as HTMLTextAreaElement;
                            if (textarea) {
                              const start = textarea.selectionStart;
                              const end = textarea.selectionEnd;
                              const text = textarea.value;
                              const inserted = tool.code;
                              const val = text.substring(0, start) + inserted + text.substring(end);
                              setEditingBlockData((prev: any) => ({
                                ...prev,
                                content: { ...prev.content, latex: val }
                              }));
                              setTimeout(() => {
                                textarea.focus();
                                textarea.setSelectionRange(start + inserted.length, start + inserted.length);
                              }, 10);
                            }
                          }}
                        >
                          {tool.label}
                        </button>
                      ))}
                    </div>

                    <textarea
                      id="block-textarea-latex"
                      rows={3}
                      className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono text-body-sm text-foreground shadow-xs focus:border-primary focus:ring-1 focus:ring-primary"
                      value={editingBlockData.content?.latex || ""}
                      onChange={(e) => setEditingBlockData((prev: any) => ({
                        ...prev,
                        content: { ...prev.content, latex: e.target.value }
                      }))}
                    />
                  </div>

                  {editingBlockData.content?.latex && (
                    <div className="p-4 bg-card border border-border rounded-lg flex flex-col items-center justify-center">
                      <span className="text-[10px] self-start text-muted-foreground uppercase tracking-wider block font-bold mb-2">Render Rumus Live:</span>
                      <MathText as="div" className="text-body-lg font-bold text-foreground">
                        {`$$${editingBlockData.content.latex}$$`}
                      </MathText>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase">Interpretasi / Penjelasan</label>
                    <textarea
                      rows={3}
                      className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-body-sm text-foreground shadow-xs focus:border-primary focus:ring-1 focus:ring-primary"
                      value={editingBlockData.content?.interpretation || ""}
                      onChange={(e) => setEditingBlockData((prev: any) => ({
                        ...prev,
                        content: { ...prev.content, interpretation: e.target.value }
                      }))}
                    />
                  </div>

                  {/* Symbols grid */}
                  <div className="space-y-2 border border-border rounded-lg p-3 bg-muted/5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground uppercase tracking-wider block">Daftar Variabel & Simbol</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          const syms = editingBlockData.content?.symbols || [];
                          setEditingBlockData((prev: any) => ({
                            ...prev,
                            content: {
                              ...prev.content,
                              symbols: [...syms, { symbol: "", unit: "", definition: "" }]
                            }
                          }));
                        }}
                      >
                        Tambah Baris
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {(editingBlockData.content?.symbols || []).map((sym: any, sIdx: number) => (
                        <div key={sIdx} className="grid grid-cols-[100px_100px_1fr_40px] gap-2 items-center">
                          <input
                            type="text"
                            placeholder="Simbol (e.g. v)"
                            className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground shadow-xs"
                            value={sym.symbol}
                            onChange={(e) => {
                              const newSyms = [...editingBlockData.content.symbols];
                              newSyms[sIdx].symbol = e.target.value;
                              setEditingBlockData((prev: any) => ({
                                ...prev,
                                content: { ...prev.content, symbols: newSyms }
                              }));
                            }}
                          />
                          <input
                            type="text"
                            placeholder="Satuan (e.g. m/s)"
                            className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground shadow-xs"
                            value={sym.unit || ""}
                            onChange={(e) => {
                              const newSyms = [...editingBlockData.content.symbols];
                              newSyms[sIdx].unit = e.target.value;
                              setEditingBlockData((prev: any) => ({
                                ...prev,
                                content: { ...prev.content, symbols: newSyms }
                              }));
                            }}
                          />
                          <input
                            type="text"
                            placeholder="Keterangan"
                            className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground shadow-xs"
                            value={sym.definition}
                            onChange={(e) => {
                              const newSyms = [...editingBlockData.content.symbols];
                              newSyms[sIdx].definition = e.target.value;
                              setEditingBlockData((prev: any) => ({
                                ...prev,
                                content: { ...prev.content, symbols: newSyms }
                              }));
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            className="text-rose-600 hover:bg-rose-50"
                            onClick={() => {
                              const newSyms = editingBlockData.content.symbols.filter((_: any, i: number) => i !== sIdx);
                              setEditingBlockData((prev: any) => ({
                                ...prev,
                                content: { ...prev.content, symbols: newSyms }
                              }));
                            }}
                          >
                            Hapus
                          </Button>
                        </div>
                      ))}
                      {(editingBlockData.content?.symbols || []).length === 0 && (
                        <p className="text-xs text-muted-foreground italic text-center py-2">Belum ada variabel terdaftar. Klik &quot;Tambah Baris&quot;.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {editingBlockData.type === "example" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase">Pernyataan Soal</label>
                    <textarea
                      rows={4}
                      className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-body-sm text-foreground shadow-xs focus:border-primary focus:ring-1 focus:ring-primary"
                      value={editingBlockData.content?.problemStatement || ""}
                      onChange={(e) => setEditingBlockData((prev: any) => ({
                        ...prev,
                        content: { ...prev.content, problemStatement: e.target.value }
                      }))}
                    />
                  </div>

                  <div className="space-y-2 border border-border rounded-lg p-3 bg-muted/5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground uppercase tracking-wider block">Langkah-Langkah Solusi</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          const steps = editingBlockData.content?.solutionSteps || [];
                          setEditingBlockData((prev: any) => ({
                            ...prev,
                            content: {
                              ...prev.content,
                              solutionSteps: [...steps, { stepIndex: steps.length + 1, label: `Langkah ${steps.length + 1}`, explanationMarkdown: "" }]
                            }
                          }));
                        }}
                      >
                        Tambah Langkah
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {(editingBlockData.content?.solutionSteps || []).map((step: any, sIdx: number) => (
                        <div key={sIdx} className="p-3 border border-border rounded-md bg-background space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-primary">Langkah {step.stepIndex}</span>
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                disabled={sIdx === 0}
                                onClick={() => {
                                  const steps = [...editingBlockData.content.solutionSteps];
                                  const temp = steps[sIdx];
                                  steps[sIdx] = steps[sIdx - 1];
                                  steps[sIdx - 1] = temp;
                                  // Re-index
                                  steps.forEach((s, i) => s.stepIndex = i + 1);
                                  setEditingBlockData((prev: any) => ({
                                    ...prev,
                                    content: { ...prev.content, solutionSteps: steps }
                                  }));
                                }}
                              >
                                Naik
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                disabled={sIdx === editingBlockData.content.solutionSteps.length - 1}
                                onClick={() => {
                                  const steps = [...editingBlockData.content.solutionSteps];
                                  const temp = steps[sIdx];
                                  steps[sIdx] = steps[sIdx + 1];
                                  steps[sIdx + 1] = temp;
                                  // Re-index
                                  steps.forEach((s, i) => s.stepIndex = i + 1);
                                  setEditingBlockData((prev: any) => ({
                                    ...prev,
                                    content: { ...prev.content, solutionSteps: steps }
                                  }));
                                }}
                              >
                                Turun
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                className="text-rose-600"
                                onClick={() => {
                                  const steps = editingBlockData.content.solutionSteps
                                    .filter((_: any, i: number) => i !== sIdx);
                                  steps.forEach((s: any, i: number) => s.stepIndex = i + 1);
                                  setEditingBlockData((prev: any) => ({
                                    ...prev,
                                    content: { ...prev.content, solutionSteps: steps }
                                  }));
                                }}
                              >
                                Hapus
                              </Button>
                            </div>
                          </div>

                          <div className="grid gap-2 sm:grid-cols-2">
                            <div>
                              <label className="block text-[10px] font-semibold text-muted-foreground uppercase">Label Langkah</label>
                              <input
                                type="text"
                                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground shadow-xs"
                                value={step.label}
                                onChange={(e) => {
                                  const steps = [...editingBlockData.content.solutionSteps];
                                  steps[sIdx].label = e.target.value;
                                  setEditingBlockData((prev: any) => ({
                                    ...prev,
                                    content: { ...prev.content, solutionSteps: steps }
                                  }));
                                }}
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-muted-foreground uppercase">Penjelasan / Rumus</label>
                              <textarea
                                rows={2}
                                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground shadow-xs"
                                value={step.explanationMarkdown}
                                onChange={(e) => {
                                  const steps = [...editingBlockData.content.solutionSteps];
                                  steps[sIdx].explanationMarkdown = e.target.value;
                                  setEditingBlockData((prev: any) => ({
                                    ...prev,
                                    content: { ...prev.content, solutionSteps: steps }
                                  }));
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      {(editingBlockData.content?.solutionSteps || []).length === 0 && (
                        <p className="text-xs text-muted-foreground italic text-center py-2">Belum ada langkah penyelesaian. Klik &quot;Tambah Langkah&quot;.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {editingBlockData.type === "misconception" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase">Kesalahpahaman Umum (Mitos)</label>
                    <textarea
                      rows={2}
                      className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-body-sm text-foreground shadow-xs focus:border-primary focus:ring-1 focus:ring-primary"
                      value={editingBlockData.content?.myth || ""}
                      onChange={(e) => setEditingBlockData((prev: any) => ({
                        ...prev,
                        content: { ...prev.content, myth: e.target.value }
                      }))}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase">Koreksi Ilmiah</label>
                    <textarea
                      rows={3}
                      className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-body-sm text-foreground shadow-xs focus:border-primary focus:ring-1 focus:ring-primary"
                      value={editingBlockData.content?.correctionMarkdown || ""}
                      onChange={(e) => setEditingBlockData((prev: any) => ({
                        ...prev,
                        content: { ...prev.content, correctionMarkdown: e.target.value }
                      }))}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase">Rasionalisasi Fisika (Opsional)</label>
                    <textarea
                      rows={3}
                      className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-body-sm text-foreground shadow-xs focus:border-primary focus:ring-1 focus:ring-primary"
                      value={editingBlockData.content?.physicalRationaleMarkdown || ""}
                      onChange={(e) => setEditingBlockData((prev: any) => ({
                        ...prev,
                        content: { ...prev.content, physicalRationaleMarkdown: e.target.value }
                      }))}
                    />
                  </div>
                </div>
              )}

              {editingBlockData.type === "visual" && (editingBlockData.visualType === "flowchart" || editingBlockData.visualType === "diagram") && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase">Judul Diagram</label>
                      <input
                        type="text"
                        className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-body-sm text-foreground shadow-xs"
                        value={editingBlockData.title || ""}
                        onChange={(e) => setEditingBlockData((prev: any) => ({ ...prev, title: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase">Keterangan / Caption</label>
                      <input
                        type="text"
                        className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-body-sm text-foreground shadow-xs"
                        value={editingBlockData.caption || ""}
                        onChange={(e) => setEditingBlockData((prev: any) => ({ ...prev, caption: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Visual flowchart node list */}
                  <div className="space-y-2 border border-border rounded-lg p-3 bg-muted/5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground uppercase tracking-wider block">1. Daftar Node (Elemen Diagram)</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          const nodes = editingBlockData.data?.nodes || [];
                          setEditingBlockData((prev: any) => ({
                            ...prev,
                            data: {
                              ...prev.data,
                              nodes: [...nodes, { id: `node-${Date.now()}`, label: `Node Baru`, stepNumber: undefined }]
                            }
                          }));
                        }}
                      >
                        Tambah Node
                      </Button>
                    </div>

                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                      {(editingBlockData.data?.nodes || []).map((node: any, nIdx: number) => (
                        <div key={node.id} className="grid grid-cols-[100px_1fr_80px_40px] gap-2 items-center">
                          <span className="font-mono text-[10px] text-muted-foreground truncate" title={node.id}>{node.id}</span>
                          <input
                            type="text"
                            placeholder="Label Node (e.g. Masukan)"
                            className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground shadow-xs"
                            value={node.label}
                            onChange={(e) => {
                              const newNodes = [...editingBlockData.data.nodes];
                              newNodes[nIdx].label = e.target.value;
                              
                              // Automatically derive ID from slugified label
                              const derivedId = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
                              const oldId = newNodes[nIdx].id;
                              newNodes[nIdx].id = derivedId;
                              
                              // Update any edges referencing the old ID
                              const newEdges = (editingBlockData.data.edges || []).map((edge: any) => {
                                let updated = { ...edge };
                                if (edge.source === oldId) updated.source = derivedId;
                                if (edge.target === oldId) updated.target = derivedId;
                                return updated;
                              });

                              setEditingBlockData((prev: any) => ({
                                ...prev,
                                data: { ...prev.data, nodes: newNodes, edges: newEdges }
                              }));
                            }}
                          />
                          <input
                            type="number"
                            placeholder="Step #"
                            className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground shadow-xs"
                            value={node.stepNumber !== undefined && node.stepNumber !== null ? node.stepNumber : ""}
                            onChange={(e) => {
                              const newNodes = [...editingBlockData.data.nodes];
                              newNodes[nIdx].stepNumber = e.target.value ? parseInt(e.target.value, 10) : undefined;
                              setEditingBlockData((prev: any) => ({
                                ...prev,
                                data: { ...prev.data, nodes: newNodes }
                              }));
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            className="text-rose-600 hover:bg-rose-50"
                            onClick={() => {
                              const newNodes = editingBlockData.data.nodes.filter((_: any, i: number) => i !== nIdx);
                              const oldId = node.id;
                              // Filter out edges connected to the deleted node
                              const newEdges = (editingBlockData.data.edges || []).filter((edge: any) => 
                                edge.source !== oldId && edge.target !== oldId
                              );

                              setEditingBlockData((prev: any) => ({
                                ...prev,
                                data: { ...prev.data, nodes: newNodes, edges: newEdges }
                              }));
                            }}
                          >
                            Hapus
                          </Button>
                        </div>
                      ))}
                      {(editingBlockData.data?.nodes || []).length === 0 && (
                        <p className="text-xs text-muted-foreground italic text-center py-2">Belum ada node terdaftar.</p>
                      )}
                    </div>
                  </div>

                  {/* Visual flowchart connections list */}
                  <div className="space-y-2 border border-border rounded-lg p-3 bg-muted/5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground uppercase tracking-wider block">2. Hubungan Koneksi (Alur Garis)</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled={(editingBlockData.data?.nodes || []).length < 2}
                        onClick={() => {
                          const edges = editingBlockData.data?.edges || [];
                          const nodes = editingBlockData.data?.nodes || [];
                          if (nodes.length >= 2) {
                            setEditingBlockData((prev: any) => ({
                              ...prev,
                              data: {
                                ...prev.data,
                                edges: [...edges, { source: nodes[0].id, target: nodes[1].id, label: "" }]
                              }
                            }));
                          }
                        }}
                      >
                        Tambah Koneksi
                      </Button>
                    </div>

                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                      {(editingBlockData.data?.edges || []).map((edge: any, eIdx: number) => (
                        <div key={eIdx} className="grid grid-cols-[1fr_auto_1fr_120px_40px] gap-2 items-center">
                          <select
                            className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground shadow-xs"
                            value={edge.source}
                            onChange={(e) => {
                              const newEdges = [...editingBlockData.data.edges];
                              newEdges[eIdx].source = e.target.value;
                              setEditingBlockData((prev: any) => ({
                                ...prev,
                                data: { ...prev.data, edges: newEdges }
                              }));
                            }}
                          >
                            {editingBlockData.data.nodes.map((n: any) => (
                              <option key={n.id} value={n.id}>{n.label}</option>
                            ))}
                          </select>

                          <span className="text-muted-foreground text-xs font-semibold">--&gt;</span>

                          <select
                            className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground shadow-xs"
                            value={edge.target}
                            onChange={(e) => {
                              const newEdges = [...editingBlockData.data.edges];
                              newEdges[eIdx].target = e.target.value;
                              setEditingBlockData((prev: any) => ({
                                ...prev,
                                data: { ...prev.data, edges: newEdges }
                              }));
                            }}
                          >
                            {editingBlockData.data.nodes.map((n: any) => (
                              <option key={n.id} value={n.id}>{n.label}</option>
                            ))}
                          </select>

                          <input
                            type="text"
                            placeholder="Label (e.g. Ya)"
                            className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground shadow-xs"
                            value={edge.label || ""}
                            onChange={(e) => {
                              const newEdges = [...editingBlockData.data.edges];
                              newEdges[eIdx].label = e.target.value;
                              setEditingBlockData((prev: any) => ({
                                ...prev,
                                data: { ...prev.data, edges: newEdges }
                              }));
                            }}
                          />

                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            className="text-rose-600 hover:bg-rose-50"
                            onClick={() => {
                              const newEdges = editingBlockData.data.edges.filter((_: any, i: number) => i !== eIdx);
                              setEditingBlockData((prev: any) => ({
                                ...prev,
                                data: { ...prev.data, edges: newEdges }
                              }));
                            }}
                          >
                            Hapus
                          </Button>
                        </div>
                      ))}
                      {(editingBlockData.data?.edges || []).length === 0 && (
                        <p className="text-xs text-muted-foreground italic text-center py-2">Belum ada hubungan antar node terdaftar.</p>
                      )}
                    </div>
                  </div>

                  {/* Diagram live preview using ReactFlow inside the dialog */}
                  {editingBlockData.data?.nodes?.length > 0 && (
                    <div className="border border-border rounded-lg p-3 bg-muted/10">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold mb-2">Pratinjau Diagram Live:</span>
                      <div className="h-[200px] border border-border/85 rounded bg-background">
                        <VisualRenderer
                          id="block-dialog-preview-flowchart"
                          visualType={editingBlockData.visualType}
                          data={editingBlockData.data}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {editingBlockData.type === "visual" && editingBlockData.visualType === "chart" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase">Judul Grafik</label>
                      <input
                        type="text"
                        className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-body-sm text-foreground shadow-xs"
                        value={editingBlockData.title || ""}
                        onChange={(e) => setEditingBlockData((prev: any) => ({ ...prev, title: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase">Chart Type</label>
                      <select
                        className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-body-sm text-foreground shadow-xs"
                        value={editingBlockData.data?.chartType || "line"}
                        onChange={(e) => setEditingBlockData((prev: any) => ({
                          ...prev,
                          data: { ...prev.data, chartType: e.target.value }
                        }))}
                      >
                        <option value="line">Line Chart (Garis)</option>
                        <option value="bar">Bar Chart (Batang)</option>
                        <option value="scatter">Scatter Plot (Titik sebar)</option>
                        <option value="pie">Pie Chart (Lingkaran)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase">Label X-Axis</label>
                      <input
                        type="text"
                        className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground shadow-xs"
                        value={editingBlockData.data?.xLabel || ""}
                        onChange={(e) => setEditingBlockData((prev: any) => ({
                          ...prev,
                          data: { ...prev.data, xLabel: e.target.value }
                        }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase">Label Y-Axis</label>
                      <input
                        type="text"
                        className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground shadow-xs"
                        value={editingBlockData.data?.yLabel || ""}
                        onChange={(e) => setEditingBlockData((prev: any) => ({
                          ...prev,
                          data: { ...prev.data, yLabel: e.target.value }
                        }))}
                      />
                    </div>
                  </div>

                  {/* Chart Data Table */}
                  <div className="space-y-2 border border-border rounded-lg p-3 bg-muted/5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground uppercase tracking-wider block">Titik Data Grafik</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          const dataPoints = editingBlockData.data?.data || [];
                          setEditingBlockData((prev: any) => ({
                            ...prev,
                            data: {
                              ...prev.data,
                              data: [...dataPoints, ["", 0]]
                            }
                          }));
                        }}
                      >
                        Tambah Titik
                      </Button>
                    </div>

                    <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                      {(editingBlockData.data?.data || []).map((pt: any, pIdx: number) => (
                        <div key={pIdx} className="grid grid-cols-[1fr_1fr_40px] gap-2 items-center">
                          <input
                            type="text"
                            placeholder="Nilai X (e.g. 2026 atau A)"
                            className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground shadow-xs"
                            value={pt[0]}
                            onChange={(e) => {
                              const newData = [...editingBlockData.data.data];
                              const numVal = Number(e.target.value);
                              newData[pIdx][0] = isNaN(numVal) || e.target.value === "" ? e.target.value : numVal;
                              setEditingBlockData((prev: any) => ({
                                ...prev,
                                data: { ...prev.data, data: newData }
                              }));
                            }}
                          />
                          <input
                            type="number"
                            placeholder="Nilai Y"
                            className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground shadow-xs"
                            value={pt[1]}
                            onChange={(e) => {
                              const newData = [...editingBlockData.data.data];
                              newData[pIdx][1] = Number(e.target.value);
                              setEditingBlockData((prev: any) => ({
                                ...prev,
                                data: { ...prev.data, data: newData }
                              }));
                            }}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            className="text-rose-600 hover:bg-rose-50"
                            onClick={() => {
                              const newData = editingBlockData.data.data.filter((_: any, i: number) => i !== pIdx);
                              setEditingBlockData((prev: any) => ({
                                ...prev,
                                data: { ...prev.data, data: newData }
                              }));
                            }}
                          >
                            Hapus
                          </Button>
                        </div>
                      ))}
                      {(editingBlockData.data?.data || []).length === 0 && (
                        <p className="text-xs text-muted-foreground italic text-center py-2">Belum ada titik data grafik.</p>
                      )}
                    </div>
                  </div>

                  {editingBlockData.data?.data?.length > 0 && (
                    <div className="border border-border rounded-lg p-3 bg-muted/10">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold mb-2">Pratinjau Grafik Live:</span>
                      <div className="h-[200px] bg-background p-2 rounded">
                        <VisualRenderer
                          id="block-dialog-preview-chart"
                          visualType="chart"
                          data={editingBlockData.data}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {editingBlockData.type === "visual" && editingBlockData.visualType === "graph" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase">Judul Grafik</label>
                      <input
                        type="text"
                        className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-body-sm text-foreground shadow-xs"
                        value={editingBlockData.title || ""}
                        onChange={(e) => setEditingBlockData((prev: any) => ({ ...prev, title: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase">Persamaan Fungsi (e.g. x^2 - 4)</label>
                      <input
                        type="text"
                        className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1.5 text-body-sm font-mono text-foreground shadow-xs"
                        value={editingBlockData.data?.functions?.[0] || ""}
                        onChange={(e) => setEditingBlockData((prev: any) => ({
                          ...prev,
                          data: { ...prev.data, functions: [e.target.value] }
                        }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase">Domain Min X</label>
                      <input
                        type="number"
                        className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground shadow-xs"
                        value={editingBlockData.data?.domain?.min !== undefined ? editingBlockData.data.domain.min : -10}
                        onChange={(e) => setEditingBlockData((prev: any) => ({
                          ...prev,
                          data: { ...prev.data, domain: { ...prev.data.domain, min: Number(e.target.value) } }
                        }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted-foreground uppercase">Domain Max X</label>
                      <input
                        type="number"
                        className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-1 text-xs text-foreground shadow-xs"
                        value={editingBlockData.data?.domain?.max !== undefined ? editingBlockData.data.domain.max : 10}
                        onChange={(e) => setEditingBlockData((prev: any) => ({
                          ...prev,
                          data: { ...prev.data, domain: { ...prev.data.domain, max: Number(e.target.value) } }
                        }))}
                      />
                    </div>
                  </div>

                  {editingBlockData.data?.functions?.[0] && (
                    <div className="border border-border rounded-lg p-3 bg-muted/10">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold mb-2">Pratinjau Grafik Live (Desmos):</span>
                      <div className="h-[200px] bg-background rounded overflow-hidden">
                        <VisualRenderer
                          id="block-dialog-preview-graph"
                          visualType="graph"
                          data={editingBlockData.data}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="border-t border-border pt-4">
              <Button
                type="button"
                variant="outline"
                className="rounded-lg"
                onClick={() => {
                  setEditingBlockIndex(null);
                  setEditingBlockData(null);
                }}
              >
                Batal
              </Button>
              <Button
                type="button"
                className="rounded-lg bg-primary text-primary-foreground font-semibold"
                onClick={handleSaveBlock}
              >
                Simpan di Editor
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}
