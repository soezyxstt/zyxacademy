"use client";

import { prefersAppReducedMotion } from "@/components/appearance-preferences";

import { useStudentExperience } from "@/components/student-experience-provider";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import { useSearchParams, usePathname } from "next/navigation";
import { 
  Download, 
  ExternalLink, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Minimize2, 
  ChevronLeft, 
  ChevronRight, 
  BookOpen, 
  Layers, 
  Search, 
  Bookmark, 
  BookmarkCheck, 
  FileText, 
  NotebookPen, 
  CheckCircle2, 
  PanelLeftClose, 
  PanelLeft, 
  PanelRightClose,
  PanelRight,
  Trash2,
  X,
  Check,
  Menu,
  Circle,
} from "lucide-react";
import { SearchBar } from "@/components/ui/search-bar";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useScrollProgress } from "@/hooks/useScrollProgress";
// Fixture imports removed
import { getYoutubeEmbedUrl } from "@/lib/youtube";
import type { CourseMaterial } from "@/lib/student-course-fixtures";
import { cn } from "@/lib/utils";
import { getViewablePdfUrl } from "@/lib/pdf-utils";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { useTutor } from "@/components/course/tutor-drawer";
import { TermPopover } from "@/components/course/term-popover";
import { matchTerm, type TermIndexEntry } from "@/lib/term-match";
import { isZyraSelectionAskEnabled, normalizeZyraSelection } from "@/lib/zyra/murid";
import { formatReaderTocTitle } from "@/lib/materials/reader-toc";
import { isLearnerReaderMode, type MaterialReaderMode } from "@/lib/materials/reader-mode";
import { useTranslations } from "@/lib/i18n/client";
import type { CourseAccessTier } from "@/lib/student/course-access";
import type { StudentCourseAccessTier } from "@/lib/course-utils";
import { ChapterSummarySheet } from "@/components/course/chapter-summary-sheet";
import { useMaterialReadingProgress } from "@/hooks/use-material-reading-progress";
import { useQueryAccountCurrent } from "@/hooks/use-query-account";
import { saveTextMaterialOffline } from "@/lib/offline/reading-cache";
import { ShareLinkButton } from "@/components/share-link-button";
import { hapticSelection } from "@/lib/native/haptics";
import { openAuthorizedFile, saveAuthorizedFile } from "@/lib/native/files";

type MaterialViewerProps = {
  material: CourseMaterial;
  studentId?: string;
  /** Chapter to summarize. When absent, the Summarize action is hidden. */
  chapterId?: string;
  /** P3 grounded-tutor feature flag, resolved on the server. */
  ragEnabled?: boolean;
  /** Free readers do not have access to the enrolled-only summary action. */
  accessTier?: CourseAccessTier | StudentCourseAccessTier;
  /** EIF E3: course concept term index for the interactive material popover. */
  termIndex?: TermIndexEntry[];
  /** EIF E3: interactive material popover selection gate, defaults to true. */
  materialLiveEnabled?: boolean;
  course?: { title: string } | null;
  mode?: MaterialReaderMode;
  backHref?: string;
  hideHeader?: boolean;
  /** Free Diktat access is inline-only and must not expose a download action. */
  canDownload?: boolean;
};

type ThemeMode = "light" | "sepia" | "cream" | "dark";

// Highlight helper component to visually underline searched terms
function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query || !query.trim()) return <span>{text}</span>;
  
  const escapedQuery = escapeRegExp(query.trim());
  const parts = text.split(new RegExp(`(${escapedQuery})`, "gi"));
  
  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === query.trim().toLowerCase() ? (
          <mark 
            key={i} 
            className="bg-amber-300/60 dark:bg-amber-700/80 text-amber-950 dark:text-amber-100 rounded-sm px-0.5 border-b border-amber-500 font-medium transition-all duration-200"
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </span>
  );
}

// Full page contents for Calculus exam with highlighting hooks
const getMockPageContent = (pageNum: number, query: string) => {
  const highlight = (text: string) => <Highlight text={text} query={query} />;

  switch (pageNum) {
    case 1:
      return (
        <div className="space-y-8 text-center py-8">
          <div className="mx-auto size-16 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary mb-2 font-bold text-h5">ITB</div>
          <h2 className="font-heading text-h5 font-bold tracking-tight">
            {highlight("UJIAN TENGAH SEMESTER (UTS) II")}
          </h2>
          <h3 className="font-heading text-body-base font-semibold text-muted-foreground mt-1">
            {highlight("MA1101 KALKULUS I")}
          </h3>
          
          <div className="w-12 h-0.5 bg-brand-primary/30 mx-auto my-6" />

          <p className="text-body-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            {highlight("Fakultas Matematika dan Ilmu Pengetahuan Alam (FMIPA)")}<br />
            {highlight("Institut Teknologi Bandung")}
          </p>
          
          <div className="mt-8 rounded-2xl bg-muted/40 p-5 inline-block text-left text-body-xs font-mono border border-border/60 backdrop-blur-xs space-y-1">
            <div><span className="text-muted-foreground">Tahun Akademik:</span> {highlight("2024/2025")}</div>
            <div><span className="text-muted-foreground">Durasi Ujian:</span> {highlight("120 Menit")}</div>
            <div><span className="text-muted-foreground">Sifat Ujian:</span> {highlight("Tutup Buku (Closed Book)")}</div>
          </div>
        </div>
      );
    case 2:
      return (
        <div className="space-y-4 text-left">
          <h3 className="font-heading text-body-sm font-bold text-brand-primary border-b border-border pb-1">
            {highlight("1. Limit Fungsi Secara Intuitif")}
          </h3>
          <p className="text-body-sm leading-relaxed">
            {highlight("Mengatakan bahwa lim x → c f(x) = L berarti bahwa bilamana x dekat tetapi berbeda dari c, maka f(x) dekat ke L.")}
          </p>
          
          <h4 className="font-semibold text-body-xs uppercase tracking-wider text-muted-foreground mt-4 mb-2">
            {highlight("Teorema Limit Utama:")}
          </h4>
          <div className="bg-muted/30 p-4 rounded-xl border border-border/80 space-y-2 text-body-xs font-mono leading-relaxed">
            <div>1. {highlight("lim x → c k = k")}</div>
            <div>2. {highlight("lim x → c x = c")}</div>
            <div>3. {highlight("lim x → c [k · f(x)] = k · lim x → c f(x)")}</div>
            <div>4. {highlight("lim x → c [f(x) ± g(x)] = lim x → c f(x) ± lim x → c g(x)")}</div>
          </div>

          <div className="p-3.5 bg-brand-primary/5 rounded-xl border border-brand-primary/10 text-body-xs leading-relaxed mt-4">
            <span className="font-semibold block text-brand-primary mb-1">{highlight("Definisi Presisi (Limit ε-δ):")}</span>
            {highlight("lim x → c f(x) = L berarti bahwa untuk setiap ε > 0, terdapat δ > 0 sedemikian rupa sehingga: 0 < |x - c| < δ → |f(x) - L| < ε.")}
          </div>
        </div>
      );
    case 3:
      return (
        <div className="space-y-4 text-left">
          <h3 className="font-heading text-body-sm font-bold text-brand-primary border-b border-border pb-1">
            {highlight("2. Turunan Fungsi (Diferensial)")}
          </h3>
          <p className="text-body-sm leading-relaxed">
            {highlight("Turunan fungsi f di titik x dinyatakan dengan f'(x), yang menyatakan laju perubahan nilai fungsi di titik tersebut.")}
          </p>

          <h4 className="font-semibold text-body-xs uppercase tracking-wider text-muted-foreground mt-4 mb-2">
            {highlight("Aturan-Aturan Turunan Dasar:")}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-body-xs font-mono">
            <div className="bg-muted/30 p-3 rounded-lg border border-border/60">
              <span className="font-semibold text-brand-primary block text-[10px] uppercase mb-0.5">{highlight("Aturan Pangkat")}</span>
              {highlight("d/dx (xⁿ) = n·xⁿ⁻¹")}
            </div>
            <div className="bg-muted/30 p-3 rounded-lg border border-border/60">
              <span className="font-semibold text-brand-primary block text-[10px] uppercase mb-0.5">{highlight("Aturan Perkalian")}</span>
              {highlight("d/dx (u·v) = u'v + uv'")}
            </div>
            <div className="bg-muted/30 p-3 rounded-lg border border-border/60">
              <span className="font-semibold text-brand-primary block text-[10px] uppercase mb-0.5">{highlight("Aturan Pembagian")}</span>
              {highlight("d/dx (u/v) = (u'v - uv') / v²")}
            </div>
            <div className="bg-muted/30 p-3 rounded-lg border border-border/60">
              <span className="font-semibold text-brand-primary block text-[10px] uppercase mb-0.5">{highlight("Aturan Rantai")}</span>
              {highlight("d/dx (f(g(x))) = f'(g(x))·g'(x)")}
            </div>
          </div>

          <h4 className="font-semibold text-body-xs uppercase tracking-wider text-muted-foreground mt-4 mb-2">
            {highlight("Turunan Fungsi Trigonometri:")}
          </h4>
          <ul className="grid grid-cols-3 gap-2 text-body-xs text-muted-foreground font-mono bg-muted/10 p-2.5 rounded-lg border border-border/40">
            <li>{highlight("d/dx (sin x) = cos x")}</li>
            <li>{highlight("d/dx (cos x) = -sin x")}</li>
            <li>{highlight("d/dx (tan x) = sec² x")}</li>
          </ul>
        </div>
      );
    case 4:
      return (
        <div className="space-y-4 text-left">
          <h3 className="font-heading text-body-sm font-bold text-brand-primary border-b border-border pb-1">
            {highlight("3. Latihan Soal Evaluatif")}
          </h3>
          
          <div className="space-y-3">
            <div className="p-3 bg-muted/30 border border-border/80 rounded-xl">
              <span className="font-semibold text-[10px] uppercase tracking-wider text-brand-primary block">{highlight("Soal 1 (Limit)")}</span>
              <p className="text-body-sm text-foreground mt-1 font-sans">
                {highlight("Tentukanlah nilai limit berikut ini:")}<br />
                <span className="font-mono font-semibold block mt-1 bg-muted/40 p-1.5 rounded text-center border border-border/40">
                  {highlight("lim x → 0 (cos(4x) - 1) / (x · tan(2x))")}
                </span>
              </p>
            </div>

            <div className="p-3 bg-muted/30 border border-border/80 rounded-xl">
              <span className="font-semibold text-[10px] uppercase tracking-wider text-brand-primary block">{highlight("Soal 2 (Optimalisasi)")}</span>
              <p className="text-body-sm mt-1">
                {highlight("Diberikan f(x) = x³ - 3x² - 9x + 5. Cari interval di mana fungsi tersebut naik dan interval di mana fungsi tersebut turun!")}
              </p>
            </div>

            <div className="p-3 bg-muted/30 border border-border/80 rounded-xl">
              <span className="font-semibold text-[10px] uppercase tracking-wider text-brand-primary block">{highlight("Soal 3 (Analitis)")}</span>
              <p className="text-body-sm mt-1">
                {highlight("Tunjukkan menggunakan definisi ε-δ bahwa limit x → 2 dari (3x - 1) adalah 5!")}
              </p>
            </div>
          </div>
        </div>
      );
    default:
      return null;
  }
};

const MOCK_PAGES_META = [
  {
    pageNum: 1,
    title: "Informasi Umum & Judul",
    searchText: "ujian tengah semester uts ii ma1101 kalkulus i fakultas matematika dan ilmu pengetahuan alam fmipa institut teknologi bandung tahun akademik 2024/2025 durasi ujian 120 menit sifat ujian tutup buku closed book fmipa itb",
    icon: FileText
  },
  {
    pageNum: 2,
    title: "1. Limit Fungsi Secara Intuitif & Teorema",
    searchText: "limit fungsi secara intuitif teorema limit utama definisi presisi limit epsilon delta lim x c f x l 0 x c epsilon delta",
    icon: BookOpen
  },
  {
    pageNum: 3,
    title: "2. Aturan Turunan & Turunan Trigonometri",
    searchText: "turunan fungsi diferensial laju perubahan nilai aturan pangkat perkalian pembagian aturan rantai d/dx x n u v u v u/v f g x sin x cos x tan x sec",
    icon: BookOpen
  },
  {
    pageNum: 4,
    title: "3. Latihan Soal Evaluatif UTS",
    searchText: "latihan soal evaluatif soal 1 limit cos 4x 1 x tan 2x soal 2 f x x3 3x2 9x 5 interval naik turun soal 3 definisi epsilon delta limit x 2 3x 1 adalah 5",
    icon: FileText
  }
];

interface ArticleSection {
  title: string;
  content: string;
}

function parseArticleSections(body: string, defaultTitle: string): { chapterTitle: string; sections: ArticleSection[] } {
  if (!body) return { chapterTitle: defaultTitle, sections: [] };

  const hasSections = body.includes("##") || body.includes("###");
  if (!hasSections) {
    return {
      chapterTitle: defaultTitle,
      sections: [{ title: "Materi", content: body }]
    };
  }

  // 1. Extract Chapter Title
  let chapterTitle = defaultTitle;
  let cleanBody = body;

  const h1Match = body.match(/^#\s+([^\n]+)/m);
  if (h1Match) {
    chapterTitle = h1Match[1].trim();
    const headerIndex = body.indexOf(h1Match[0]);
    if (headerIndex !== -1) {
      const endOfHeading = body.indexOf("\n", headerIndex);
      cleanBody = body.slice(endOfHeading !== -1 ? endOfHeading : headerIndex);
    }
  } else {
    const firstHeaderMatch = body.match(/##\s+Bab\s+\d+:\s+([^\n]+)/i) || body.match(/##\s+([^\n]+)/);
    if (firstHeaderMatch) {
      chapterTitle = firstHeaderMatch[0].replace(/^##\s+/, "").trim();
      const headerIndex = body.indexOf(firstHeaderMatch[0]);
      if (headerIndex !== -1) {
        const endOfHeading = body.indexOf("\n", headerIndex);
        cleanBody = body.slice(endOfHeading !== -1 ? endOfHeading : headerIndex);
      }
    }
  }

  // Clean top-level dividers
  cleanBody = cleanBody.replace(/^[\s\r\n]*---[\s\r\n]*/, "");

  // 2. Remove Metadata blocks
  cleanBody = cleanBody
    .replace(/#### Knowledge Graph Metadata[\s\S]*?(?=(?:---|\r?\n###|\r?\n##|\r?\n####|$))/g, "")
    .replace(/#### Metadata[\s\S]*?(?=(?:---|\r?\n###|\r?\n##|\r?\n####|$))/g, "");

  // Remove Concept Hierarchy block completely
  cleanBody = cleanBody.replace(/##\s+Concept\s+Hierarchy[\s\S]*?(?=(?:---|\r?\n###|\r?\n##|\r?\n####|$))/gi, "");

  // 3. Parse into blocks
  interface HeadingBlock {
    level: 2 | 3;
    title: string;
    contentLines: string[];
  }

  const blocks: HeadingBlock[] = [];
  let currentBlock: HeadingBlock | null = null;
  let introLines: string[] = [];

  const lines = cleanBody.split(/\r?\n/);
  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.*)/);
    const h3Match = line.match(/^###\s+(.*)/);

    if (h2Match) {
      currentBlock = {
        level: 2,
        title: h2Match[1].trim(),
        contentLines: []
      };
      blocks.push(currentBlock);
    } else if (h3Match) {
      currentBlock = {
        level: 3,
        title: h3Match[1].trim(),
        contentLines: []
      };
      blocks.push(currentBlock);
    } else {
      if (currentBlock) {
        currentBlock.contentLines.push(line);
      } else {
        introLines.push(line);
      }
    }
  }

  const sections: ArticleSection[] = [];
  const formulaSections: ArticleSection[] = [];
  let currentH2Intro: string = introLines.join("\n").trim();

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.level === 2) {
      let hasH3UnderIt = false;
      for (let j = i + 1; j < blocks.length; j++) {
        if (blocks[j].level === 2) break;
        if (blocks[j].level === 3) {
          hasH3UnderIt = true;
          break;
        }
      }

      if (hasH3UnderIt) {
        const blockContent = block.contentLines.join("\n").trim();
        if (blockContent) {
          if (currentH2Intro) {
            currentH2Intro += "\n\n" + blockContent;
          } else {
            currentH2Intro = blockContent;
          }
        }
      } else {
        let content = block.contentLines.join("\n").trim();
        if (currentH2Intro) {
          content = currentH2Intro + "\n\n" + content;
          currentH2Intro = "";
        }

        if (/^F-\d+/i.test(block.title)) {
          const subHeading = `### ${block.title}\n\n`;
          formulaSections.push({ title: block.title, content: subHeading + content });
        } else {
          sections.push({ title: block.title, content });
        }
      }
    } else if (block.level === 3) {
      let content = block.contentLines.join("\n").trim();
      if (currentH2Intro) {
        content = currentH2Intro + "\n\n" + content;
        currentH2Intro = "";
      }

      if (/^F-\d+/i.test(block.title)) {
        const subHeading = `### ${block.title}\n\n`;
        formulaSections.push({ title: block.title, content: subHeading + content });
      } else {
        sections.push({ title: block.title, content });
      }
    }
  }

  if (formulaSections.length > 0) {
    const groupedContent = formulaSections.map(fs => fs.content).join("\n\n---\n\n");
    sections.push({
      title: "Daftar Rumus",
      content: groupedContent
    });
  }

  return { chapterTitle, sections };
}

function shortenSubbabLabel(title: string): string {
  return title
    .replace(/^(?:Konsep|Subbab|Bab)\s+\d+:\s*/i, "")
    .replace(/^\d+\.\s*/, "");
}

const getConceptTags = (courseId: string, materialTitle: string) => {
  if (courseId === "calc-1") {
    if (materialTitle.toLowerCase().includes("turunan")) {
      return ["Turunan", "Aturan Rantai", "Diferensial"];
    }
    return ["Limit", "Kekontinuan", "Fungsi"];
  }
  if (courseId === "physics-1") {
    return ["Vektor", "Besaran", "Satuan"];
  }
  return ["Kalkulus", "Sains"];
};

export function MaterialViewer(props: MaterialViewerProps) {
  const currentAccount = useQueryAccountCurrent(props.studentId ?? "");
  if (props.studentId && !currentAccount) return null;
  return <MaterialViewerContent key={JSON.stringify([props.studentId ?? "preview", props.material.courseId, props.material.id])} {...props} />;
}

function MaterialViewerContent({
  material,
  studentId,
  chapterId,
  ragEnabled,
  accessTier,
  termIndex,
  materialLiveEnabled,
  course,
  mode = "learner",
  hideHeader = false,
  canDownload = true,
}: MaterialViewerProps) {
  const t = useTranslations("learning");
  const common = useTranslations("common");
  const learnerMode = isLearnerReaderMode(mode);
  const experience = useStudentExperience();
  const demo = experience.mode === "demo";

  useEffect(() => {
    if (demo || !studentId || !learnerMode) return;
    if (material.kind !== "article" || !material.body?.trim()) return;
    void saveTextMaterialOffline(studentId, material, course?.title);
  }, [demo, studentId, learnerMode, material, course?.title]);
  const revision = experience.baseline.find(item => item.courseId === material.courseId)?.revision ?? "fictional";
  const storage = useMemo(() => {
    const fallback = new Map<string,string>();
    const prefix = demo ? `demo:${material.courseId}:${revision}:` : "";
    return {
      getItem: (key: string) => { try { return (demo ? window.sessionStorage : window.localStorage).getItem(prefix + key); } catch { return fallback.get(key) ?? null; } },
      setItem: (key: string, value: string) => { try { (demo ? window.sessionStorage : window.localStorage).setItem(prefix + key,value); } catch { fallback.set(key,value); } },
    };
  }, [demo, material.courseId, revision]);
  const [viewerType, setViewerType] = useState<"custom" | "chrome">("chrome");
  const [showDemoViewer, setShowDemoViewer] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const isDev = window.location.hostname === "localhost" || 
                    window.location.hostname === "127.0.0.1" || 
                    process.env.NODE_ENV === "development";
      const hasFlag = params.get("demo") === "true" || params.get("mock") === "true";
      setShowDemoViewer(isDev || hasFlag);
    }
  }, []);

  // Lock body scroll and set viewport properties when MaterialViewer is active in learner mode
  useEffect(() => {
    if (!learnerMode) return;
    document.documentElement.classList.add("material-viewer-locked");
    return () => {
      document.documentElement.classList.remove("material-viewer-locked");
    };
  }, [learnerMode]);

  // Navigation hooks
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Article states
  const initialSection = parseInt(searchParams?.get("section") || "0", 10);
  const [activeSectionIdx, setActiveSectionIdx] = useState(isNaN(initialSection) ? 0 : initialSection);
  const [showOutlineSheet, setShowOutlineSheet] = useState(false);
  const [isArticleTocOpen, setIsArticleTocOpen] = useState(true);
  const [articleTocSearchQuery, setArticleTocSearchQuery] = useState("");

  // Sync URL -> State (e.g. back/forward navigation)
  useEffect(() => {
    const sectionStr = searchParams?.get("section");
    const sectionFromUrl = sectionStr ? parseInt(sectionStr, 10) : 0;
    if (sectionFromUrl !== activeSectionIdx) {
      setActiveSectionIdx(sectionFromUrl);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, material.id]);

  // Sync State -> URL
  useEffect(() => {
    const currentUrlSection = searchParams?.get("section") || "0";
    if (currentUrlSection !== activeSectionIdx.toString()) {
      const params = new URLSearchParams(searchParams?.toString() || "");
      if (activeSectionIdx === 0) {
        params.delete("section");
      } else {
        params.set("section", activeSectionIdx.toString());
      }
      const newQuery = params.toString();
      const newUrl = newQuery ? `${pathname}?${newQuery}` : pathname;
      window.history.replaceState(null, "", newUrl);
    }
  }, [activeSectionIdx, pathname, searchParams]);

  const { chapterTitle, sections: articleSections } = useMemo(() => {
    return parseArticleSections(material.body || "", material.title);
  }, [material.body, material.title]);

  // Scroll-spy observer for continuous diktat / article sections
  useEffect(() => {
    if (material.kind !== "article" || articleSections.length === 0) return;
    const scrollContainer = articleScrollRef.current;
    if (!scrollContainer) return;

    const sectionElements = articleSections
      .map((_, idx) => document.getElementById(`diktat-section-${idx}`))
      .filter(Boolean) as HTMLElement[];

    if (!sectionElements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries.filter((e) => e.isIntersecting);
        if (intersecting.length > 0) {
          const sorted = intersecting.sort(
            (a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top)
          );
          const idxAttr = sorted[0].target.getAttribute("data-section-idx");
          if (idxAttr != null) {
            const newIdx = parseInt(idxAttr, 10);
            if (!isNaN(newIdx) && newIdx !== activeSectionIdx) {
              setActiveSectionIdx(newIdx);
            }
          }
        }
      },
      {
        root: scrollContainer,
        rootMargin: "-10% 0px -60% 0px",
        threshold: [0, 0.2, 0.5],
      },
    );

    for (const el of sectionElements) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [articleSections, material.kind, activeSectionIdx]);

  // Scroll to target section on initial load if query param present
  useEffect(() => {
    if (material.kind !== "article" || articleSections.length === 0) return;
    const sectionParam = searchParams?.get("section");
    if (sectionParam != null) {
      const targetIdx = parseInt(sectionParam, 10);
      if (!isNaN(targetIdx) && targetIdx >= 0 && targetIdx < articleSections.length) {
        const timer = setTimeout(() => {
          const el = document.getElementById(`diktat-section-${targetIdx}`);
          if (el) {
            el.scrollIntoView({ behavior: prefersAppReducedMotion() ? "auto" : "smooth", block: "start" });
          }
        }, 250);
        return () => clearTimeout(timer);
      }
    }
  }, [articleSections.length, material.kind, searchParams]);

  const visibleArticleSections = useMemo(() => {
    const query = articleTocSearchQuery.trim().toLocaleLowerCase("id");
    if (query.length < 2) return articleSections.map((section, index) => ({ section, index }));
    return articleSections
      .map((section, index) => ({ section, index }))
      .filter(({ section }) => `${section.title}\n${section.content}`.toLocaleLowerCase("id").includes(query));
  }, [articleSections, articleTocSearchQuery]);
  
  // Custom PDF states
  const initialPage = parseInt(searchParams?.get("page") || "1", 10);
  const [page, setPage] = useState<number>(isNaN(initialPage) ? 1 : initialPage);
  const [zoom, setZoom] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("light");
  
  // Sync page state with URL
  useEffect(() => {
    const currentUrlPage = searchParams?.get("page");
    if (currentUrlPage !== page.toString() && !(currentUrlPage == null && page === 1)) {
      const params = new URLSearchParams(searchParams?.toString() || "");
      if (page === 1) {
        params.delete("page");
      } else {
        params.set("page", page.toString());
      }
      const newQuery = params.toString();
      const newUrl = newQuery ? `${pathname}?${newQuery}` : pathname;
      window.history.replaceState(null, "", newUrl);
    }
  }, [page, pathname, searchParams]);
  
  // Interactive Sidebar states
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"outline" | "thumbnails" | "search" | "notes">("outline");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeHighlightQuery, setActiveHighlightQuery] = useState("");
  const [readingProgress, setReadingProgress] = useState(0);
  const [visitedPages, setVisitedPages] = useState<Set<number>>(new Set([1]));

  // Personal notes and bookmarks (localStorage backed)
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [activeNoteText, setActiveNoteText] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);

  const viewerRef = useRef<HTMLDivElement>(null);
  const noteSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const articleScrollRef = useRef<HTMLDivElement>(null);
  const articleProgress = useScrollProgress(articleScrollRef);
  const { done, markDone, markingDone } = useMaterialReadingProgress({
    material, studentId, learnerMode,
    sectionCount: articleSections.length,
    sectionIndex: activeSectionIdx,
    sectionTitle: articleSections[activeSectionIdx]?.title,
    page,
  });
  const progressPercent = useMemo(() => {
    if (material.kind === "article") return articleProgress;
    // PDFs and other kinds are binary: completed or not. The mock page counter
    // (readingProgress) only drives the dev-only integrated viewer's own bar.
    return done ? 100 : 0;
  }, [material.kind, articleProgress, done]);

  const { openExplain, openChatWithQuestion } = useTutor();
  const selectionAskEnabled = isZyraSelectionAskEnabled();
  const [selectedText, setSelectedText] = useState("");
  const [selectionCoords, setSelectionCoords] = useState<{ top: number; left: number } | null>(null);
  const popoverActiveRef = useRef(false);

  // E3: match the current selection to a course concept (client-side, instant).
  const matchedConcept = useMemo(() => {
    if (!materialLiveEnabled || !termIndex || termIndex.length === 0 || !selectedText) return null;
    return matchTerm(termIndex, selectedText)?.conceptName ?? null;
  }, [materialLiveEnabled, termIndex, selectedText]);

  // E3: shared tutor escalation (used by the legacy button and the term popover).
  const dismissPopover = () => {
    window.getSelection()?.removeAllRanges();
    setSelectedText("");
    setSelectionCoords(null);
    popoverActiveRef.current = false;
  };

  const runTutorExplain = (query: string) => {
    if (!learnerMode) return;
    dismissPopover();
    if (demo || selectionAskEnabled) {
      const selection = normalizeZyraSelection(query);
      if (selection.length >= 3) {
        openChatWithQuestion(t("reader.askSelection", { title: material.title, selection }));
        return;
      }
    }
    toast.promise(
      (async () => {
        const { findKoForMaterialSectionAction } = await import("@/app/actions/tutor");
        const res = await findKoForMaterialSectionAction(material.courseId, query);
        if (res.success && res.koId) {
          openExplain(res.koId, "content");
        } else {
          openExplain("ko-101", "content");
        }
      })(),
      {
        loading: t("reader.analyzingConcept"),
        success: t("reader.zyraReady"),
        error: t("reader.conceptFailed"),
      },
    );
  };

  useEffect(() => {
    if (!learnerMode) return;
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        setSelectedText("");
        setSelectionCoords(null);
        return;
      }

      const text = selection.toString().trim();
      const anchorNode = selection.anchorNode;
      if (!anchorNode) return;

      const isInsideViewer = viewerRef.current?.contains(anchorNode) || 
                             document.getElementById("article-paper-content")?.contains(anchorNode);

      if (!isInsideViewer) {
        setSelectedText("");
        setSelectionCoords(null);
        return;
      }

      if (text.length < 3) {
        setSelectedText("");
        setSelectionCoords(null);
        popoverActiveRef.current = false;
        return;
      }

      try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        setSelectionCoords({
          top: rect.top - 45,
          left: rect.left + rect.width / 2,
        });
        setSelectedText(text);
        popoverActiveRef.current = true;
      } catch {
        // Safe fallback
      }
    };

    const handleScroll = () => {
      if (popoverActiveRef.current) {
        setSelectedText("");
        setSelectionCoords(null);
        popoverActiveRef.current = false;
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [learnerMode]);

  // Load personalization states from localStorage
  useEffect(() => {
    if (!learnerMode) return;
    try {
      const storedNotes = storage.getItem(`zyx-notes-${material.id}`);
      const storedBookmarks = storage.getItem(`zyx-bookmarks-${material.id}`);
      const storedTheme = storage.getItem(`zyx-reader-theme`);
      const storedSidebar = storage.getItem(`zyx-reader-sidebar`);

      if (storedNotes) setNotes(JSON.parse(storedNotes));
      if (storedBookmarks) setBookmarks(JSON.parse(storedBookmarks));
      if (storedTheme) setTheme(storedTheme as ThemeMode);
      if (storedSidebar) setShowSidebar(storedSidebar === "true");
    } catch (e) {
      console.error("Could not load reader configurations from localStorage", e);
    }
  }, [learnerMode, material.id, storage]);

  // Handle active note loading when page changes
  useEffect(() => {
    setActiveNoteText(notes[page] || "");
  }, [page, notes]);

  // Update visited pages tracking and overall progress
  useEffect(() => {
    setVisitedPages((prev) => {
      const updated = new Set(prev);
      updated.add(page);
      return updated;
    });
  }, [page]);

  useEffect(() => {
    const total = MOCK_PAGES_META.length;
    const progress = Math.round((visitedPages.size / total) * 100);
    setReadingProgress(progress);
    
    // Auto complete triggers when reading all pages
    if (learnerMode && progress === 100 && !done) {
      toast(t("reader.allPagesRead"), {
        description: t("reader.markDoneToSave"),
        action: {
          label: t("reader.finish"),
          onClick: () => markDone()
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learnerMode, visitedPages]);

  // Toggle Fullscreen
  function toggleFullscreen() {
    if (!viewerRef.current) return;

    if (!isFullscreen) {
      if (viewerRef.current.requestFullscreen) {
        viewerRef.current.requestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      setIsFullscreen(false);
    }
  }

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Save Bookmarks
  const toggleBookmark = (pNum: number) => {
    if (!learnerMode) return;
    let newBookmarks = [...bookmarks];
    if (newBookmarks.includes(pNum)) {
      newBookmarks = newBookmarks.filter((p) => p !== pNum);
      toast.success(t("reader.bookmarkRemoved", { page: pNum }));
    } else {
      newBookmarks.push(pNum);
      newBookmarks.sort((a, b) => a - b);
      toast.success(t("reader.bookmarkAdded", { page: pNum }));
    }
    setBookmarks(newBookmarks);
    storage.setItem(`zyx-bookmarks-${material.id}`, JSON.stringify(newBookmarks));
    void hapticSelection();
  };

  // Save Personal Note
  const saveNote = (noteText: string) => {
    if (!learnerMode) return;
    setIsSavingNote(true);
    const newNotes = { ...notes };
    if (noteText.trim() === "") {
      delete newNotes[page];
    } else {
      newNotes[page] = noteText;
    }
    setNotes(newNotes);
    storage.setItem(`zyx-notes-${material.id}`, JSON.stringify(newNotes));
    
    // Simulate minor network/disk delay for a smooth "saving..." feedback
    if (noteSaveTimerRef.current) clearTimeout(noteSaveTimerRef.current);
    noteSaveTimerRef.current = setTimeout(() => {
      setIsSavingNote(false);
    }, 400);
  };

  const deleteNote = (pNum: number) => {
    if (!learnerMode) return;
    const newNotes = { ...notes };
    delete newNotes[pNum];
    setNotes(newNotes);
    storage.setItem(`zyx-notes-${material.id}`, JSON.stringify(newNotes));
    if (pNum === page) setActiveNoteText("");
    toast.success(t("reader.noteRemoved", { page: pNum }));
  };

  // Save layout states to storage
  const handleSidebarToggle = () => {
    const nextState = !showSidebar;
    setShowSidebar(nextState);
    if (learnerMode) storage.setItem(`zyx-reader-sidebar`, String(nextState));
  };

  const _handleThemeChange = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    if (learnerMode) storage.setItem(`zyx-reader-theme`, newTheme);
  };

  // Search filter
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase().trim();
    return MOCK_PAGES_META.filter(
      (p) => p.title.toLowerCase().includes(query) || p.searchText.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Color specs mapped to state theme mode
  const currentThemeStyle = useMemo(() => {
    const styles: Record<ThemeMode, { deskBg: string; paperBg: string; text: string; border: string }> = {
      light: {
        deskBg: "bg-muted/50 border-border/80",
        paperBg: "bg-card",
        text: "text-foreground",
        border: "border-border"
      },
      sepia: {
        deskBg: "bg-reader-sepia-desk/20 border-reader-sepia-desk-border/50",
        paperBg: "bg-reader-sepia-paper",
        text: "text-reader-sepia-text",
        border: "border-reader-sepia-border"
      },
      cream: {
        deskBg: "bg-reader-cream-desk/40 border-reader-cream-desk-border/60",
        paperBg: "bg-reader-cream-paper",
        text: "text-reader-cream-text",
        border: "border-reader-cream-border"
      },
      dark: {
        deskBg: "bg-reader-dark-desk border-reader-dark-desk-border/80",
        paperBg: "bg-reader-dark-paper",
        text: "text-reader-dark-text",
        border: "border-reader-dark-border"
      }
    };
    return styles[theme];
  }, [theme]);

  // Mini wireframe thumbnail renderer
  const renderThumbnailPreview = (pageNum: number) => {
    switch (pageNum) {
      case 1:
        return (
          <div className="flex flex-col items-center justify-between p-1.5 h-full w-full">
            <div className="w-3.5 h-3.5 rounded-full bg-brand-secondary/30" />
            <div className="space-y-1 w-full flex flex-col items-center">
              <div className="h-[2px] bg-muted-foreground/30 w-10 rounded-xs" />
              <div className="h-[2px] bg-muted-foreground/30 w-7 rounded-xs" />
            </div>
            <div className="h-[2px] bg-muted w-5 rounded-xs" />
          </div>
        );
      case 2:
        return (
          <div className="flex flex-col justify-between p-1.5 h-full w-full">
            <div className="h-[3px] bg-brand-secondary/30 w-8 rounded-xs" />
            <div className="space-y-1 flex-1 py-1 flex flex-col justify-center">
              <div className="h-[2px] bg-muted-foreground/30 w-full rounded-xs" />
              <div className="h-[2px] bg-muted-foreground/30 w-5/6 rounded-xs" />
              <div className="h-[8px] bg-muted border border-border rounded-xs w-full mt-0.5" />
            </div>
            <div className="h-[2px] bg-muted w-4 rounded-xs" />
          </div>
        );
      case 3:
        return (
          <div className="flex flex-col justify-between p-1.5 h-full w-full">
            <div className="h-[3px] bg-brand-secondary/30 w-8 rounded-xs" />
            <div className="space-y-1 flex-1 py-1 flex flex-col justify-center">
              <div className="h-[2px] bg-muted-foreground/30 w-8 rounded-xs" />
              <div className="grid grid-cols-2 gap-0.5 mt-0.5">
                <div className="h-[6px] bg-muted rounded-xs border border-border" />
                <div className="h-[6px] bg-muted rounded-xs border border-border" />
              </div>
            </div>
            <div className="h-[2px] bg-muted w-4 rounded-xs" />
          </div>
        );
      case 4:
        return (
          <div className="flex flex-col justify-between p-1.5 h-full w-full">
            <div className="h-[3px] bg-brand-secondary/30 w-8 rounded-xs" />
            <div className="space-y-1 flex-1 py-1.5 flex flex-col justify-between">
              <div className="h-[4px] bg-muted border border-border rounded-xs w-full" />
              <div className="h-[4px] bg-muted border border-border rounded-xs w-full" />
              <div className="h-[4px] bg-muted border border-border rounded-xs w-full" />
            </div>
            <div className="h-[2px] bg-muted w-4 rounded-xs" />
          </div>
        );
      default:
        return null;
    }
  };

  const openUrl = getViewablePdfUrl(material.url);
  const [downloadingFile, setDownloadingFile] = useState(false);
  const [openingFile, setOpeningFile] = useState(false);

  const handleDownloadMaterial = async (targetTitle: string) => {
    if (!material.url || downloadingFile) return;
    setDownloadingFile(true);
    try {
      const result = await saveAuthorizedFile({
        url: material.url,
        fileName: `${targetTitle}.pdf`,
        title: targetTitle,
      });
      if (!result.ok && !result.cancelled) {
        toast.error(common(result.error === "unauthorized" ? "files.unauthorized" : "files.saveFailed"));
      }
    } finally {
      setDownloadingFile(false);
    }
  };

  const handleOpenMaterial = async () => {
    if (!openUrl || openingFile) return;
    setOpeningFile(true);
    try {
      const result = await openAuthorizedFile({
        url: openUrl,
        fileName: `${material.title}.pdf`,
        title: material.title,
      });
      if (!result.ok && !result.cancelled) {
        toast.error(common(result.error === "unauthorized" ? "files.unauthorized" : "files.openFailed"));
      }
    } finally {
      setOpeningFile(false);
    }
  };

  const tutorPopover = learnerMode && selectionCoords && selectedText ? (
    <div
      style={{
        position: "fixed",
        top: `${selectionCoords.top}px`,
        left: `${selectionCoords.left}px`,
        transform: "translateX(-50%)",
        zIndex: 9999,
      }}
      className="animate-fade-in"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className="relative">
        {matchedConcept ? (
          // E3: deterministic concept actions sourced from KO data (no LLM until "Tanya tutor").
          <TermPopover
            courseId={material.courseId}
            conceptName={matchedConcept}
            onAskTutor={() => runTutorExplain(matchedConcept)}
          />
        ) : (
          <Button
            type="button"
            size="sm"
            className="rounded-lg bg-brand-primary hover:bg-brand-primary/95 shadow-md flex items-center gap-1.5 h-8 font-sans text-body-xs font-semibold !text-primary-foreground px-3 border border-brand-primary/20"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              runTutorExplain(selectedText);
            }}
          >
            Tanya Zyra
          </Button>
        )}
        <button
          type="button"
          onClick={dismissPopover}
          className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-border hover:text-foreground shadow-sm transition-colors"
          aria-label={t("reader.close")}
        >
          <X className="size-3" />
        </button>
      </div>
    </div>
  ) : null;

  if (material.kind === "article" && material.body) {
    const conceptTags = getConceptTags(material.courseId, material.title);
    const summaryChapterId = !hideHeader && learnerMode && accessTier !== "free" && ragEnabled ? chapterId : undefined;
    const articleTocSearch = (
      <SearchBar
        collapsible
        type="search"
        value={articleTocSearchQuery}
        onSearch={setArticleTocSearchQuery}
        onClear={() => setArticleTocSearchQuery("")}
        aria-label={material.docCategory === "diktat" ? t("reader.searchDiktat") : t("reader.searchArticle")}
        placeholder={material.docCategory === "diktat" ? t("reader.searchDiktat") : t("reader.searchArticle")}
        variant="bordered"
        size="sm"
        containerClassName="min-w-0 flex-1"
      />
    );
    const articleTocPosition = (
      <span className="shrink-0 text-body-xs font-semibold text-muted-foreground group-has-[[data-search-expanded=true]]/toc:hidden">
        {activeSectionIdx + 1}/{articleSections.length}
      </span>
    );
    const renderArticleTocContent = () => (
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {visibleArticleSections.length === 0 ? (
          <p className="px-2 py-3 text-center text-body-xs text-muted-foreground">
            Tidak ada bagian yang cocok.
          </p>
        ) : (
          visibleArticleSections.map(({ section, index }) => {
            const isActive = index === activeSectionIdx;
            const isPassed = index < activeSectionIdx;
            return (
              <button
                key={`${section.title}-${index}`}
                type="button"
                aria-current={isActive ? "location" : undefined}
                onClick={() => {
                  setActiveSectionIdx(index);
                  setShowOutlineSheet(false);
                  const el = document.getElementById(`diktat-section-${index}`);
                  if (el) {
                    el.scrollIntoView({ behavior: prefersAppReducedMotion() ? "auto" : "smooth", block: "start" });
                  }
                }}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-body-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  isActive
                    ? "border-l-2 border-primary bg-primary/10 text-primary"
                    : "text-foreground hover:bg-muted/60",
                )}
              >
                {isPassed ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-status-success" />
                ) : isActive ? (
                  <Circle className="mt-0.5 size-4 shrink-0 fill-primary/20 text-primary" />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
                )}
                <span className="min-w-0 break-words py-0.5 font-semibold leading-snug">
                  {formatReaderTocTitle(section.title)}
                </span>
              </button>
            );
          })
        )}
      </div>
    );

    return (
      <div className="flex flex-col h-full w-full overflow-hidden bg-background">
        <Sheet open={showOutlineSheet} onOpenChange={setShowOutlineSheet}>
          {!hideHeader && learnerMode && (
            <header className="relative flex w-full shrink-0 items-center flex-wrap justify-between gap-x-2 gap-y-1 border-b border-border/80 bg-background/95 px-2 py-1 sm:px-4 backdrop-blur-sm">
              <div className="flex min-w-0 flex-1 basis-32 items-center gap-2">
                <div className="min-w-0">
                  <p className="truncate text-body-xs font-medium text-muted-foreground">
                    {course?.title ?? t("reader.courseMaterials")}
                  </p>
                  <h1 className="break-words font-heading text-body-sm font-bold text-foreground">
                    {material.title}
                  </h1>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <div className="hidden items-center gap-2 text-body-xs text-muted-foreground md:flex">
                  <div className="h-2 w-24 overflow-hidden rounded-md bg-muted">
                    <div className="h-full rounded-md bg-primary transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <span className="font-semibold text-foreground">{progressPercent}%</span>
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SheetTrigger asChild>
                        <Button variant="ghost" size="icon-lg" className="md:hidden" aria-label={t("reader.tableOfContents")}>
                          <Menu aria-hidden />
                        </Button>
                      </SheetTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{t("reader.tableOfContents")}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        className="hidden md:inline-flex"
                        aria-label={isArticleTocOpen ? t("reader.hideMenu") : t("reader.openMenu")}
                        aria-expanded={isArticleTocOpen}
                        onClick={() => setIsArticleTocOpen((open) => !open)}
                      >
                        {isArticleTocOpen ? <PanelRightClose aria-hidden /> : <PanelRight aria-hidden />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{isArticleTocOpen ? t("reader.hideMenu") : t("reader.openMenu")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {learnerMode && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={markDone}
                    aria-label={done ? t("reader.complete") : t("reader.markComplete")}
                    disabled={done || markingDone}
                    className="interactive gap-1.5 font-semibold"
                  >
                    <CheckCircle2 className={cn("size-3.5", done ? "text-emerald-500 fill-emerald-500/10" : "text-muted-foreground")} />
                    <span>{done ? t("reader.complete") : t("reader.markComplete")}</span>
                  </Button>
                )}
              </div>
              <div className="absolute bottom-0 left-0 h-1 bg-primary transition-all duration-300 ease-out" style={{ width: `${progressPercent}%` }} />
            </header>
          )}

          <SheetContent side="right" className="gap-0" aria-describedby={undefined}>
            <SheetHeader className="group/toc min-h-14 flex-row items-center gap-2 border-b border-border/80 py-2 pl-3 pr-14">
              <SheetTitle className="min-w-0 flex-1 truncate text-body-sm group-has-[[data-search-expanded=true]]/toc:sr-only">{t("reader.tableOfContents")}</SheetTitle>
              {articleTocPosition}
              {articleTocSearch}
            </SheetHeader>
            {renderArticleTocContent()}
          </SheetContent>
        </Sheet>

        <div className="flex min-h-0 flex-1 w-full">
          <div className="flex min-w-0 flex-1 flex-col">
            <div
              id="article-paper-content"
              ref={articleScrollRef}
              data-theme={theme}
              className="w-full flex-1 overflow-y-auto bg-background text-foreground transition-colors duration-300"
            >
              <div className="max-w-[75ch] mx-auto px-4 sm:px-6 lg:px-8 pt-5 sm:pt-6 pb-8 space-y-(--reading-section-gap)">
                {/* Document / Diktat Header */}
                <header className="space-y-2 border-b border-border/80 pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-body-xs font-semibold text-muted-foreground">
                      <span className="rounded-md bg-primary/10 px-2.5 py-0.5 text-primary">
                      {material.docCategory === "diktat" ? t("reader.diktatTitle") : t("reader.articleTitle")}
                      </span>
                      {course?.title && <span>· {course.title}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ShareLinkButton
                        title={chapterTitle || material.title}
                        variant="outline"
                        size="icon-lg"
                      />
                      {material.url && canDownload && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon-lg"
                                aria-label={t("reader.downloadPdf")}
                                disabled={downloadingFile}
                                onClick={() => void handleDownloadMaterial(chapterTitle || material.title)}
                              >
                                <Download aria-hidden />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t("reader.downloadPdf")}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {summaryChapterId && (
                        <ChapterSummarySheet studentId={studentId} chapterId={summaryChapterId} chapterTitle={material.title} />
                      )}
                    </div>
                  </div>
                  <h1 className="font-heading text-h3 font-bold tracking-tight text-foreground sm:text-h2">
                    {chapterTitle || material.title}
                  </h1>
                  {conceptTags && conceptTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {conceptTags.map((tag) => (
                        <span
                          key={tag}
                          className="bg-primary/5 text-primary text-body-xs font-semibold px-2 py-0.5 rounded-md"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </header>

                {/* Continuous Sections */}
                {articleSections.length > 0 ? (
                  articleSections.map((section, idx) => {
                    const isLast = idx === articleSections.length - 1;
                    return (
                      <React.Fragment key={idx}>
                        <section
                          id={`diktat-section-${idx}`}
                          data-section-idx={idx}
                          className="scroll-mt-16 space-y-(--paragraph-gap)"
                        >
                          <div className="border-b border-border/60 pb-3">
                            <span className="text-body-xs font-semibold text-primary/80">
                              Bagian {idx + 1} dari {articleSections.length}
                            </span>
                            <h2 className="font-heading text-h4 font-bold tracking-tight text-foreground sm:text-h3 mt-1">
                              {section.title}
                            </h2>
                          </div>

                          <div className="w-full">
                            <MarkdownRenderer
                              content={section.content}
                              density={material.docCategory === "diktat" ? "compact" : "default"}
                            />
                          </div>
                        </section>

                        {!isLast ? (
                          <div className="py-8 flex items-center gap-4 text-muted-foreground/50">
                            <div className="h-px flex-1 bg-border/60" />
                            <div className="flex items-center gap-1.5 text-body-xs font-semibold px-3 py-1 rounded-md bg-muted/40 border border-border/40 text-muted-foreground">
                              <CheckCircle2 className="size-3.5 text-status-success" />
                              <span>Selesai Bagian {idx + 1}</span>
                            </div>
                            <div className="h-px flex-1 bg-border/60" />
                          </div>
                        ) : null}
                      </React.Fragment>
                    );
                  })
                ) : (
                  <div className="w-full">
                    <MarkdownRenderer
                      content={material.body || ""}
                      density={material.docCategory === "diktat" ? "compact" : "default"}
                    />
                  </div>
                )}

                {/* End of Diktat milestone */}
                <div className="space-y-(--related-gap) border-t border-border/40 pt-(--section-gap) text-center">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-status-success/15 text-status-success">
                    <CheckCircle2 className="size-6 text-status-success" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="font-heading text-h5 font-bold text-foreground">
                      {material.docCategory === "diktat" ? t("reader.diktatComplete") : t("reader.materialComplete")}
                    </h2>
                    <p className="text-body-sm text-muted-foreground max-w-md mx-auto">
                      Anda telah membaca seluruh isi {material.docCategory === "diktat" ? "diktat" : "materi"} {chapterTitle || material.title}.
                    </p>
                  </div>
                  {learnerMode && (
                    <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                      <Button
                        variant="default"
                        onClick={markDone}
                        disabled={done || markingDone}
                        className="gap-2 bg-status-success hover:bg-status-success/95 text-white font-bold"
                      >
                        <CheckCircle2 className="size-4" />
                        <span>{done ? t("reader.complete") : t("reader.markAndSave")}</span>
                      </Button>
                      {material.url && canDownload && (
                        <Button
                          variant="outline"
                          asChild
                          className="gap-2 font-semibold"
                        >
                          <a href={material.url} download target="_blank" rel="noopener noreferrer">
                            <Download className="size-4" />
                            <span>{t("reader.downloadCopy")}</span>
                          </a>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          {isArticleTocOpen && (
            <aside className="hidden w-72 shrink-0 overflow-hidden border-l border-border/80 bg-card/40 md:flex md:flex-col lg:w-80">
              <div className="group/toc flex items-center gap-2 border-b border-border/70 px-3 py-1">
                <h2 className="min-w-0 flex-1 text-body-sm font-semibold group-has-[[data-search-expanded=true]]/toc:sr-only">{t("reader.tableOfContents")}</h2>
                {articleTocPosition}
                {articleTocSearch}
              </div>
              {renderArticleTocContent()}
            </aside>
          )}
        </div>
        {tutorPopover}
      </div>
    );
  }

  const pdfToolbarControls = material.kind === "pdf" ? (
    <>
      {showDemoViewer && (
        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/60 p-0.5">
          <button
            type="button"
            onClick={() => setViewerType("custom")}
            aria-pressed={viewerType === "custom"}
            className={cn(
              "px-2 py-0.5 rounded-md text-body-xs font-semibold transition-all",
              viewerType === "custom"
                ? "bg-card text-brand-primary shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Mode Interaktif
          </button>
          <button
            type="button"
            onClick={() => setViewerType("chrome")}
            aria-pressed={viewerType === "chrome"}
            className={cn(
              "px-2 py-0.5 rounded-md text-body-xs font-semibold transition-all",
              viewerType === "chrome"
                ? "bg-card text-brand-primary shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Mode Dokumen
          </button>
        </div>
      )}
      <ShareLinkButton
        title={material.title}
        variant="outline"
        size="icon-sm"
        className="size-7"
        iconClassName="size-3.5"
      />
      {material.url && (
        <TooltipProvider>
          {canDownload && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="size-7"
                  aria-label={t("reader.downloadPdf")}
                  disabled={downloadingFile}
                  onClick={() => void handleDownloadMaterial(material.title)}
                >
                  <Download className="size-3.5" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("reader.downloadPdf")}</TooltipContent>
            </Tooltip>
          )}
          {openUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className={cn("size-7", viewerType === "chrome" && "hidden md:inline-flex")}
                  aria-label={t("reader.openOriginal")}
                  disabled={openingFile}
                  onClick={() => void handleOpenMaterial()}
                >
                  <ExternalLink className="size-3.5" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("reader.openOriginal")}</TooltipContent>
            </Tooltip>
          )}
        </TooltipProvider>
      )}
    </>
  ) : null;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background font-sans">
      {/* Sticky Topbar */}
      {(!hideHeader && (learnerMode || material.kind === "pdf")) && (
        <div className="relative min-h-10 w-full border-b border-border bg-background/80 backdrop-blur-sm flex flex-wrap items-center justify-between gap-2 px-4 py-1 shrink-0">
          {learnerMode && (
            <div className="absolute bottom-0 left-0 h-1 bg-primary transition-all duration-300 ease-out" style={{ width: `${progressPercent}%` }} />
          )}
          
          <div className="flex items-center gap-2">
            {learnerMode && (
              <span className="text-body-xs text-muted-foreground font-mono font-semibold">
                {progressPercent}%
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {pdfToolbarControls}
            {learnerMode && accessTier !== "free" && ragEnabled && chapterId && (
              <ChapterSummarySheet studentId={studentId} chapterId={chapterId} chapterTitle={material.title} />
            )}
            {learnerMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={markDone}
                aria-label={done ? t("reader.complete") : t("reader.markComplete")}
                disabled={done || markingDone}
                className="h-7 text-body-sm font-semibold flex items-center gap-1.5 rounded-md interactive"
              >
                <CheckCircle2 className={cn("size-3.5", done ? "text-status-success fill-status-success/10" : "text-muted-foreground")} />
                <span>{done ? t("reader.complete") : t("reader.markComplete")}</span>
              </Button>
            )}
          </div>
        </div>
      )}
      {hideHeader && material.kind === "pdf" && (
        <div className="flex flex-wrap items-center justify-end gap-1.5 border-b border-border bg-background/80 px-3 py-1 shrink-0">
          {pdfToolbarControls}
        </div>
      )}

      {/* Main Material Display container */}
      <div className="flex-1 min-h-0 w-full relative overflow-hidden flex flex-col bg-background">
        
        {/* Render PDF Document (Integrated custom viewer or standard Chrome) */}
        {material.kind === "pdf" ? (
          <div className="flex flex-col w-full h-full relative bg-background overflow-hidden">
            {viewerType === "custom" ? (
              <div
                ref={viewerRef}
                className={cn(
                  "flex flex-1 min-h-0 bg-background overflow-hidden w-full select-none transition-all duration-300 relative",
                  isFullscreen ? "fixed inset-0 z-50 rounded-none w-screen h-screen" : "rounded-none"
                )}
              >
                {/* Custom minimalist integrated PDF reader shell */}
                {/* Sleek Reading Progress bar (topmost border) */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-border/20 z-20 overflow-hidden">
                  <div 
                    className="h-full bg-brand-primary transition-all duration-500 ease-out" 
                    style={{ width: `${readingProgress}%` }}
                  />
                </div>

                {/* PDF Document Shell split in Sidebar and Page Desk */}
                <div className="flex flex-1 overflow-hidden relative">
                  
                  {/* Collapsible Interactive Sidebar */}
                  <div 
                    className={cn(
                      "border-r border-border bg-card/95 backdrop-blur-xs flex flex-col shrink-0 transition-all duration-350 z-10",
                      showSidebar 
                        ? "w-80 translate-x-0 relative" 
                        : "w-0 -translate-x-full absolute md:relative overflow-hidden border-r-0"
                    )}
                  >
                    {/* Sidebar Header with dynamic controls */}
                    <div className="px-4 pt-4 pb-3 border-b border-border flex items-center justify-between">
                      <span className="text-body-xs font-heading font-bold text-foreground">
                        Index & Dokumen
                      </span>
                      <button
                        onClick={handleSidebarToggle}
                        className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground md:hidden"
                        title={t("reader.hideSidebar")}
                      >
                        <X className="size-4" />
                      </button>
                    </div>

                    {/* Sidebar Navigation Tabs */}
                    <div className="grid grid-cols-4 border-b border-border p-1 bg-muted/40 gap-0.5">
                      <button
                        onClick={() => setSidebarTab("outline")}
                        className={cn(
                          "min-h-11 min-w-0 wrap-break-word py-1.5 rounded-lg flex flex-col items-center justify-center text-body-xs font-semibold transition-all gap-0.5",
                          sidebarTab === "outline" ? "bg-card text-brand-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
                        )}
                        title={t("reader.tableOfContents")}
                      >
                        <BookOpen className="size-3.5" />
                        <span>{t("reader.outline")}</span>
                      </button>
                      <button
                        onClick={() => setSidebarTab("thumbnails")}
                        className={cn(
                          "min-h-11 min-w-0 wrap-break-word py-1.5 rounded-lg flex flex-col items-center justify-center text-body-xs font-semibold transition-all gap-0.5",
                          sidebarTab === "thumbnails" ? "bg-card text-brand-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
                        )}
                        title={t("reader.pageThumbnails")}
                      >
                        <Layers className="size-3.5" />
                        <span>{t("reader.pageThumbnails")}</span>
                      </button>
                      <button
                        onClick={() => setSidebarTab("search")}
                        className={cn(
                          "min-h-11 min-w-0 wrap-break-word py-1.5 rounded-lg flex flex-col items-center justify-center text-body-xs font-semibold transition-all gap-0.5 relative",
                          sidebarTab === "search" ? "bg-card text-brand-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
                        )}
                        title={t("reader.searchWords")}
                      >
                        <Search className="size-3.5" />
                        <span>{t("reader.searchWords")}</span>
                        {activeHighlightQuery && (
                          <span className="absolute top-1 right-3 size-1.5 rounded-full bg-brand-secondary animate-pulse" />
                        )}
                      </button>
                      <button
                        onClick={() => setSidebarTab("notes")}
                        className={cn(
                          "min-h-11 min-w-0 wrap-break-word py-1.5 rounded-lg flex flex-col items-center justify-center text-body-xs font-semibold transition-all gap-0.5 relative",
                          sidebarTab === "notes" ? "bg-card text-brand-primary shadow-xs" : "text-muted-foreground hover:text-foreground"
                        )}
                        title={t("reader.notesAndBookmarks")}
                      >
                        <NotebookPen className="size-3.5" />
                        <span>{t("reader.notes")}</span>
                        {(Object.keys(notes).length > 0 || bookmarks.length > 0) && (
                          <span className="absolute top-1 right-2 bg-brand-secondary/90 text-white rounded-md px-1 text-body-2xs font-mono leading-none">
                            {Object.keys(notes).length + bookmarks.length}
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Sidebar Tab Content panels */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-4">
                      
                      {/* Outline Tab */}
                      {sidebarTab === "outline" && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-2 px-1">
                            Struktur Materi
                          </span>
                          <TooltipProvider>
                            {MOCK_PAGES_META.map((p) => {
                              const IconComp = p.icon;
                              const hasNote = notes[p.pageNum];
                              const hasBookmark = bookmarks.includes(p.pageNum);

                              return (
                                <Tooltip key={p.pageNum}>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={() => setPage(p.pageNum)}
                                      className={cn(
                                        "w-full text-left p-2.5 rounded-md text-body-sm font-medium flex items-center justify-between border transition-all duration-200",
                                        page === p.pageNum
                                          ? "bg-accent text-accent-foreground font-medium border-border"
                                          : "border-transparent text-muted-foreground hover:bg-accent/50"
                                      )}
                                    >
                                      <div className="flex items-center gap-2 truncate pr-1">
                                        <IconComp className={cn("size-3.5 shrink-0", page === p.pageNum ? "text-accent-foreground" : "text-muted-foreground")} />
                                        <span className="truncate">{shortenSubbabLabel(p.title)}</span>
                                      </div>
                                      <div className="flex items-center gap-1 text-[10px] shrink-0">
                                        {hasBookmark && <Bookmark className="size-3 text-brand-secondary fill-brand-secondary shrink-0" />}
                                        {hasNote && <NotebookPen className="size-3 text-sky-500 shrink-0" />}
                                        <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-semibold">
                                          H{p.pageNum}
                                        </span>
                                      </div>
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="right">
                                    <p>{p.title}</p>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })}
                          </TooltipProvider>
                        </div>
                      )}

                      {/* Thumbnails Tab */}
                      {sidebarTab === "thumbnails" && (
                        <div className="grid grid-cols-2 gap-3 p-1">
                          {MOCK_PAGES_META.map((p) => (
                            <button
                              key={p.pageNum}
                              onClick={() => setPage(p.pageNum)}
                              className={cn(
                                "flex flex-col items-center p-1.5 rounded-xl border transition-all duration-200 group text-center gap-1",
                                page === p.pageNum
                                  ? "border-brand-primary bg-brand-primary/5 ring-2 ring-brand-primary/20 shadow-md"
                                  : "border-border hover:border-border-strong hover:bg-muted/30"
                              )}
                            >
                              <div className="h-20 w-16 overflow-hidden rounded-md bg-muted/40 border border-border/80 shadow-xs relative">
                                {renderThumbnailPreview(p.pageNum)}
                                {visitedPages.has(p.pageNum) && (
                                  <span className="absolute top-1 right-1 bg-emerald-500 text-white rounded-full p-0.5 scale-75 shadow-xs">
                                    <Check className="size-2 stroke-[3px]" />
                                  </span>
                                )}
                              </div>
                              <span className={cn(
                                "text-[10px] font-mono font-bold mt-1 tracking-wide",
                                page === p.pageNum ? "text-brand-primary" : "text-muted-foreground group-hover:text-foreground"
                              )}>
                                Halaman {p.pageNum}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Search / Indexing Tab */}
                      {sidebarTab === "search" && (
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground px-1">
                              Indeks Pencarian Kata
                            </label>
                            <SearchBar
                              size="sm"
                              variant="muted"
                              value={searchQuery}
                              onSearch={(val) => {
                                setSearchQuery(val);
                                setActiveHighlightQuery(val);
                              }}
                              onClear={() => {
                                setSearchQuery("");
                                setActiveHighlightQuery("");
                              }}
                              placeholder={t("reader.searchPlaceholder")}
                            />
                          </div>

                          {/* Search Matches list */}
                          {searchQuery.trim() ? (
                            <div className="space-y-2">
                              <span className="text-[10px] font-semibold text-muted-foreground px-1 block">
                                Ditemukan {searchResults.length} halaman yang cocok:
                              </span>
                              {searchResults.length > 0 ? (
                                <div className="space-y-1.5">
                                  {searchResults.map((r) => (
                                    <button
                                      key={r.pageNum}
                                      onClick={() => {
                                        setPage(r.pageNum);
                                        setActiveHighlightQuery(searchQuery);
                                      }}
                                      className={cn(
                                        "w-full text-left p-2.5 rounded-xl border text-body-xs transition-all hover:bg-muted/50 border-border/80 flex flex-col gap-1",
                                        page === r.pageNum && "bg-brand-primary/5 border-brand-primary/20"
                                      )}
                                    >
                                      <div className="flex items-center justify-between w-full font-bold">
                                        <span className="text-foreground font-heading text-body-xs truncate max-w-[180px]">
                                          {r.title}
                                        </span>
                                        <span className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded text-muted-foreground">
                                          Hal {r.pageNum}
                                        </span>
                                      </div>
                                      <p className="text-body-xs text-muted-foreground line-clamp-2 bg-muted/20 p-1.5 rounded-lg border border-border/40 font-mono">
                                        <Highlight text={r.searchText} query={searchQuery} />
                                      </p>
                                    </button>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-center py-6 text-body-xs text-muted-foreground border border-dashed border-border rounded-xl">
                                  Tidak ada kata pencarian yang cocok.
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-center py-6 text-body-xs text-muted-foreground/80 border border-dashed border-border rounded-xl font-mono leading-relaxed px-2 bg-muted/10">
                              Masukkan kata kunci di atas untuk mencari istilah penting dalam dokumen secara instan.
                            </div>
                          )}

                          {activeHighlightQuery && (
                            <div className="bg-amber-500/10 border border-amber-500/25 p-3 rounded-2xl flex items-center justify-between gap-1">
                              <div className="text-body-xs text-amber-900 dark:text-amber-200">
                                Sorotan kata <b className="font-mono font-bold bg-amber-500/20 px-1 rounded">&ldquo;{activeHighlightQuery}&rdquo;</b> aktif di halaman.
                              </div>
                              <button
                                onClick={() => setActiveHighlightQuery("")}
                                className="text-body-sm text-destructive font-semibold hover:underline flex items-center gap-0.5 shrink-0"
                              >
                                Hapus
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Notes & Bookmarks Tab */}
                      {sidebarTab === "notes" && (
                        <div className="space-y-4">
                          
                          {/* Bookmarks Section */}
                          <div className="space-y-2">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block px-1">
                              Penanda Halaman (Bookmarks)
                            </span>
                            {bookmarks.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5 p-1">
                                {bookmarks.map((pNum) => (
                                  <div
                                    key={pNum}
                                    className={cn(
                                      "flex items-center gap-1.5 text-body-xs font-medium pl-2.5 pr-1.5 py-1 rounded-md border shadow-2xs transition-all",
                                      page === pNum
                                        ? "bg-brand-primary text-primary-foreground border-brand-primary"
                                        : "bg-card text-foreground border-border hover:border-border-strong"
                                    )}
                                  >
                                    <button onClick={() => setPage(pNum)} className="font-mono font-bold">
                                      Hal {pNum}
                                    </button>
                                    <button
                                      onClick={() => toggleBookmark(pNum)}
                                      className={cn(
                                        "p-0.5 rounded-full hover:bg-black/10 text-muted-foreground",
                                        page === pNum ? "text-white/80 hover:text-white" : "hover:text-destructive"
                                      )}
                                      title={t("reader.removeBookmark")}
                                    >
                                      <X className="size-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-center py-4 text-body-xs text-muted-foreground border border-dashed border-border rounded-xl">
                                Belum ada halaman yang ditandai.
                              </div>
                            )}
                          </div>

                          {/* Page Notes Manager */}
                          <div className="space-y-2.5 pt-2 border-t border-border/80">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block px-1">
                              Catatan Halaman {page}
                            </span>
                            
                            <div className="space-y-1.5">
                              <textarea
                                value={activeNoteText}
                                onChange={(e) => {
                                  setActiveNoteText(e.target.value);
                                  saveNote(e.target.value);
                                }}
                                placeholder={t("reader.notePlaceholder")}
                                rows={4}
                                className="w-full bg-muted/40 text-body-xs border border-border rounded-xl p-2.5 focus:bg-card focus:outline-none focus:ring-1 focus:ring-brand-primary transition-all text-foreground resize-none leading-relaxed"
                              />
                              <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
                                <span>{isSavingNote ? t("reader.savingNote") : t("reader.savedInBrowser")}</span>
                                {notes[page] && (
                                  <button
                                    onClick={() => deleteNote(page)}
                                    className="text-destructive hover:text-destructive/90 font-semibold flex items-center gap-0.5 transition-colors"
                                  >
                                    <Trash2 className="size-3" /> Hapus
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* All Stored Notes List */}
                          <div className="space-y-2 pt-2 border-t border-border/80">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block px-1">
                              Semua Catatan Anda ({Object.keys(notes).length})
                            </span>
                            {Object.keys(notes).length > 0 ? (
                              <div className="space-y-2">
                                {Object.entries(notes).map(([pStr, text]) => {
                                  const pNum = parseInt(pStr);
                                  return (
                                    <div
                                      key={pNum}
                                      className={cn(
                                        "p-2.5 rounded-xl border text-body-xs transition-all flex flex-col gap-1 hover:bg-muted/30",
                                        page === pNum ? "bg-brand-primary/5 border-brand-primary/20" : "border-border/80 bg-card"
                                      )}
                                    >
                                      <div className="flex items-center justify-between">
                                        <button
                                          onClick={() => setPage(pNum)}
                                          className="font-semibold text-brand-primary hover:underline font-mono text-body-sm"
                                        >
                                          Halaman {pNum}
                                        </button>
                                        <button
                                          onClick={() => deleteNote(pNum)}
                                          className="p-1 text-muted-foreground hover:text-destructive rounded-md hover:bg-muted"
                                          title={t("reader.removeNote")}
                                        >
                                          <Trash2 className="size-3.5" />
                                        </button>
                                      </div>
                                      <p className="text-muted-foreground line-clamp-3 leading-relaxed whitespace-pre-wrap">
                                        {text}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="text-center py-4 text-body-xs text-muted-foreground border border-dashed border-border rounded-xl">
                                Belum ada catatan yang ditulis.
                              </div>
                            )}
                          </div>

                        </div>
                      )}

                    </div>
                  </div>

                  {/* Main PDF Canvas reader desk */}
                  <div className={cn("flex-1 overflow-auto flex flex-col items-center justify-start py-8 px-4 md:px-8 relative min-w-0 transition-colors duration-350 border-l", currentThemeStyle.deskBg)}>
                    
                    {/* Floating Toggle Sidebar button for desktop */}
                    {!showSidebar && (
                      <button
                        onClick={handleSidebarToggle}
                        className="absolute top-4 left-4 p-2.5 rounded-xl bg-card border border-border shadow-md text-foreground hover:bg-muted transition-all duration-200 z-10"
                        title={t("reader.showSidebar")}
                      >
                        <PanelLeft className="size-4" />
                      </button>
                    )}

                    {/* Bookmark Button directly overlaying the page canvas */}
                    <div className="w-full max-w-[620px] flex justify-end mb-2">
                        <button
                          type="button"
                          onClick={() => toggleBookmark(page)}
                          className={cn(
                            "p-1.5 rounded-md border shadow-2xs hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 text-body-xs font-semibold px-3.5 h-7",
                            bookmarks.includes(page)
                              ? "bg-brand-secondary text-white border-brand-secondary"
                              : "bg-card text-muted-foreground border-border hover:text-foreground"
                          )}
                          title={bookmarks.includes(page) ? t("reader.removeBookmark") : t("reader.bookmarkPage")}
                        >
                          {bookmarks.includes(page) ? (
                            <>
                              <BookmarkCheck className="size-3.5 text-white" />
                              <span>{t("reader.bookmarked")}</span>
                            </>
                          ) : (
                            <>
                              <Bookmark className="size-3.5" />
                              <span>{t("reader.markPage")}</span>
                            </>
                          )}
                        </button>
                      </div>

                    {/* Dynamic Scaling viewport container */}
                    <div className="flex-1 flex items-center justify-center w-full min-h-[480px]">
                      <div
                        className={cn(
                          "transition-all duration-250 ease-out origin-center rounded-2xl shadow-xl overflow-hidden border border-solid p-6 md:p-10",
                          currentThemeStyle.paperBg,
                          currentThemeStyle.text,
                          currentThemeStyle.border
                        )}
                        style={{
                          transform: `scale(${zoom / 100})`,
                          transformOrigin: "center center",
                          width: "600px",
                          maxWidth: "100%"
                        }}
                      >
                        <div className="h-full flex flex-col justify-between min-h-[400px]">
                          {/* Render customized page body */}
                          <div className="flex-1">
                            {getMockPageContent(page, activeHighlightQuery)}
                          </div>
                          
                          {/* Elegant minimalist academic footer */}
                          <div className="border-t border-border/60 pt-4 mt-6 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                            <span className="truncate max-w-[150px] sm:max-w-xs">{material.title}</span>
                            <span className="shrink-0">Halaman {page} dari {MOCK_PAGES_META.length}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Spacer for Toolbar */}
                    <div className="h-20" />

                    {/* Floating Glassmorphic Control Toolbar */}
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur-md border border-border shadow-lg rounded-2xl px-4 py-2 flex items-center gap-3.5 z-10 transition-all duration-200 hover:bg-card hover:shadow-xl w-max max-w-[90vw]">
                      
                      {/* Toggle Sidebar */}
                      <button
                        onClick={handleSidebarToggle}
                        className={cn(
                          "p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors hidden md:block",
                          showSidebar && "text-brand-primary"
                        )}
                        title={showSidebar ? t("reader.hideMenu") : t("reader.showSidebar")}
                      >
                        <PanelLeftClose className="size-4" />
                      </button>

                      <span className="w-px h-4 bg-border hidden md:block" />

                      {/* Page Controller */}
                      <div className="flex items-center gap-2">
                        <button
                          disabled={page === 1}
                          onClick={() => setPage(page - 1)}
                          className="p-1 rounded-md bg-muted/60 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        title={t("reader.previousPage")}
                        >
                          <ChevronLeft className="size-4 text-foreground" />
                        </button>
                        <span className="text-body-xs font-mono font-bold text-foreground select-none shrink-0">
                          {page} <span className="text-muted-foreground">/</span> {MOCK_PAGES_META.length}
                        </span>
                        <button
                          disabled={page === MOCK_PAGES_META.length}
                          onClick={() => setPage(page + 1)}
                          className="p-1 rounded-md bg-muted/60 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                        title={t("reader.nextPage")}
                        >
                          <ChevronRight className="size-4 text-foreground" />
                        </button>
                      </div>

                      <span className="w-px h-4 bg-border" />

                      {/* Zoom Engine */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setZoom(Math.max(50, zoom - 25))}
                          className="p-1 rounded-md bg-muted/60 hover:bg-muted transition-all"
                        title={t("reader.zoomOut")}
                        >
                          <ZoomOut className="size-3.5 text-foreground" />
                        </button>
                        <span className="font-mono text-[10px] font-bold text-foreground w-10 text-center select-none">
                          {zoom}%
                        </span>
                        <button
                          onClick={() => setZoom(Math.min(150, zoom + 25))}
                          className="p-1 rounded-md bg-muted/60 hover:bg-muted transition-all"
                        title={t("reader.zoomIn")}
                        >
                          <ZoomIn className="size-3.5 text-foreground" />
                        </button>
                      </div>

                      <span className="w-px h-4 bg-border" />

                      {/* Actions */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={toggleFullscreen}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                        title={isFullscreen ? t("reader.exitFullscreen") : t("reader.fullscreen")}
                        >
                          {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                        </button>
                        {material.url && canDownload && (
                          <a
                            href={material.url}
                            download
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                            title={t("reader.downloadPdfFile")}
                          >
                            <Download className="size-4" />
                          </a>
                        )}
                      </div>

                    </div>

                  </div>

                </div>

              </div>
            ) : (
              <div className="flex-1 min-h-0 w-full flex flex-col p-2 sm:p-4 bg-background">
                {/* Mobile / Tablet Direct PDF Launcher */}
                <div className="md:hidden flex flex-col items-center justify-center p-6 text-center border border-border bg-card rounded-xl my-auto space-y-3">
                  <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <FileText className="size-6 text-[#ea4335]" />
                  </div>
                  <h3 className="font-heading text-body-sm font-bold text-foreground">{material.title}</h3>
                  {openUrl ? (
                    <Button asChild size="sm" className="rounded-md font-semibold text-body-xs">
                      <a href={openUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-1.5 size-3.5" />
                        {t("reader.openOriginal")}
                      </a>
                    </Button>
                  ) : null}
                </div>

                {/* Native Browser PDF Viewer (iframe fallback for desktop) */}
                <div className="hidden md:flex flex-col flex-1 w-full min-h-0">
                  <div className="flex-1 w-full overflow-hidden border border-border bg-[#333] dark:bg-black-3 rounded-xl sm:rounded-2xl relative shadow-md min-h-[500px]">
                    <iframe
                      title={material.title}
                      src={material.url}
                      className="w-full h-full border-0"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {/* Fallback Material Type view (image, video, link) centered in a scrollable block */}
        {material.kind !== "pdf" && (
          <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center">
            <div className="w-full max-w-3xl">
              {/* Image Reader */}
              {material.kind === "image" && material.url ? (
                <div className="relative mx-auto max-w-2xl aspect-video w-full rounded-2xl overflow-hidden shadow-md bg-card/60 p-2 my-4">
                  <div className="relative w-full h-full rounded-xl overflow-hidden">
                    <Image
                      src={material.url}
                      unoptimized
                      alt={material.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 42rem"
                    />
                  </div>
                </div>
              ) : null}

              {/* Video Player */}
              {material.kind === "video" && material.url ? (
                <div className="space-y-4 max-w-3xl mx-auto p-4 my-2">
                  {(() => {
                    const embed = getYoutubeEmbedUrl(material.url);
                    if (embed) {
                      return (
                        <div className="aspect-video w-full overflow-hidden rounded-2xl border border-border shadow-md">
                          <iframe
                            title={material.title}
                            src={embed}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            className="w-full h-full"
                          />
                        </div>
                      );
                    }
                    return (
                      <p className="text-body-base text-muted-foreground">
                        Video tidak didukung untuk sematan langsung. Buka di tab baru.
                      </p>
                    );
                  })()}
                </div>
              ) : null}

              {/* External Link */}
              {material.kind === "link" && material.url ? (
                <div className="bg-card p-8 rounded-2xl border border-border flex flex-col sm:flex-row items-center justify-between gap-4 max-w-2xl mx-auto my-6 shadow-2xs">
                  <p className="text-body-sm text-muted-foreground text-center sm:text-left">
                    Dokumen eksternal berada di luar platform Zyx.
                  </p>
                  <Button asChild className="bg-brand-primary text-primary-foreground hover:bg-brand-primary/95 shrink-0">
                    <a href={material.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1.5 size-4" />
                      Buka Tautan Sumber
                    </a>
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        )}

      </div>

      {tutorPopover}
    </div>
  );
}
