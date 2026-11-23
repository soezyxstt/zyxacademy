"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "nextjs-toploader/app";
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import {
  BookOpen,
  ChevronRight,
  CircleHelp,
  Compass,
  FileText,
  FolderSearch,
  GraduationCap,
  Hash,
  Home,
  Layers,
  Loader2,
  Search,
  Star,
  Tag,
  Info,
  Users,
  X,
} from "lucide-react";
import {
  getSiteSearchDocuments,
  getSiteSearchShortcutIds,
  getMarketingShortcutDocs,
  isMarketingHref,
} from "@/lib/site-search-index";
import type { SiteSearchDocument } from "@/lib/site-search-index";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import {
  getStudentSearchDocuments,
  getMarketingSearchDocuments,
} from "@/app/(student)/dashboard/search-actions";
import { StudentAccountBoundary, isStudentSocialAccount, type StudentAccountState } from "@/components/student-account-boundary";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useStudentSocial } from "@/components/gamification/social-provider";
import {
  parseSearchQueryString,
  SEARCH_PREFIX_DEFINITIONS,
} from "@/lib/search/parser";
import { rankSearchDocuments } from "@/lib/search/ranking";
import Fuse from "fuse.js";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import type { StudentIdentity } from "@/lib/gamification/social-contracts";
import { StudentIdentityContent } from "@/components/gamification/student-identity";

export interface SearchItem {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  group?: string;
  keywords?: string;
  content?: string;
}


const RECENT_STORAGE_KEY = "zyx_search_recent";
const FAVORITES_STORAGE_KEY = "zyx_search_favorites";
const MAX_RECENT_ITEMS = 8;

const CATEGORY_ORDER = [
  "Course & Modul",
  "Materi & Artikel",
  "Kuis & Evaluasi",
  "Navigasi",
  "Administrasi",
] as const;

type NormalizedCategory = (typeof CATEGORY_ORDER)[number];

function normalizeCategory(group?: string): NormalizedCategory {
  if (!group) return "Navigasi";
  const lower = group.toLowerCase();
  if (
    lower.includes("course") ||
    lower.includes("modul") ||
    lower.includes("topik")
  ) {
    return "Course & Modul";
  }
  if (
    lower.includes("materi") ||
    lower.includes("artikel") ||
    lower.includes("blog") ||
    lower.includes("diktat")
  ) {
    return "Materi & Artikel";
  }
  if (
    lower.includes("kuis") ||
    lower.includes("evaluasi") ||
    lower.includes("quiz") ||
    lower.includes("tryout") ||
    lower.includes("soal") ||
    lower.includes("ujian")
  ) {
    return "Kuis & Evaluasi";
  }
  if (
    lower.includes("admin") ||
    lower.includes("group") ||
    lower.includes("grup") ||
    lower.includes("kelompok") ||
    lower.includes("meet") ||
    lower.includes("sesi") ||
    lower.includes("user") ||
    lower.includes("pengguna") ||
    lower.includes("form") ||
    lower.includes("token") ||
    lower.includes("schedule") ||
    lower.includes("jadwal")
  ) {
    return "Administrasi";
  }
  return "Navigasi";
}

function getCategoryIcon(category: NormalizedCategory) {
  switch (category) {
    case "Course & Modul":
      return GraduationCap;
    case "Materi & Artikel":
      return BookOpen;
    case "Kuis & Evaluasi":
      return FileText;
    case "Navigasi":
      return Compass;
    case "Administrasi":
      return Users;
    default:
      return Layers;
  }
}

function categoryMessageKey(category: NormalizedCategory) {
  switch (category) {
    case "Course & Modul": return "courseModules";
    case "Materi & Artikel": return "materialsArticles";
    case "Kuis & Evaluasi": return "quizzesEvaluations";
    case "Navigasi": return "navigation";
    case "Administrasi": return "administration";
  }
}

function groupIcon(group?: string) {
  if (!group) return Layers;
  switch (group) {
    case "Halaman":
      return Home;
    case "Course":
      return GraduationCap;
    case "Materi":
      return BookOpen;
    case "Evaluasi":
      return FileText;
    default:
      return getCategoryIcon(normalizeCategory(group));
  }
}

function getNavigationSurface(href: string) {
  if (href === "/admin" || href.startsWith("/admin/")) return "Admin";
  if (href === "/tutor" || href.startsWith("/tutor/")) return "Tutor";
  if (
    href === "/dashboard" ||
    href.startsWith("/dashboard/") ||
    href === "/leaderboard" ||
    href.startsWith("/leaderboard/") ||
    href === "/calendar" ||
    href.startsWith("/calendar/") ||
    href === "/profile" ||
    href.startsWith("/profile/") ||
    href === "/settings" ||
    href.startsWith("/settings/")
  ) {
    return "Murid";
  }
  return "Publik";
}

function NavigationSurfaceBadge({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-body-2xs font-medium text-muted-foreground group-aria-selected:bg-background/80 group-aria-selected:text-foreground">
      {label}
    </span>
  );
}

interface SearchItemCluster {
  id: string;
  parent?: SiteSearchDocument;
  children: SiteSearchDocument[];
}

function clusterSearchItems(items: SiteSearchDocument[]): SearchItemCluster[] {
  const clusters: SearchItemCluster[] = [];
  const processedChildIds = new Set<string>();

  // Pass 1: Identify items that have matching children in the search results
  for (const item of items) {
    if (processedChildIds.has(item.id)) continue;

    const children = items.filter((candidate) => {
      if (candidate.id === item.id || processedChildIds.has(candidate.id)) return false;

      // Condition 1: Anchor URL matching base href
      if (
        candidate.href.includes("#") &&
        candidate.href.split("#")[0] === item.href
      ) {
        return true;
      }

      // Condition 2: Candidate subtitle matches item title
      if (
        candidate.subtitle &&
        item.title &&
        candidate.subtitle.trim().toLowerCase() === item.title.trim().toLowerCase()
      ) {
        return true;
      }

      // Condition 3: Sub-path matching
      if (
        item.href &&
        item.href !== "/" &&
        item.href !== "/courses" &&
        candidate.href.startsWith(item.href + "/")
      ) {
        return true;
      }

      return false;
    });

    if (children.length > 0) {
      for (const child of children) {
        processedChildIds.add(child.id);
      }
      clusters.push({
        id: item.id,
        parent: item,
        children,
      });
    }
  }

  // Pass 2: Remaining items that were not clustered in Pass 1
  for (const item of items) {
    if (processedChildIds.has(item.id)) continue;
    if (clusters.some((c) => c.parent?.id === item.id)) continue;

    // Check if it is an orphan section / sub-item
    const isSectionItem =
      item.href.includes("#") ||
      (item.subtitle &&
        item.subtitle !== "Halaman" &&
        item.subtitle !== "Admin" &&
        item.subtitle !== "Landing" &&
        item.subtitle !== "Akun");

    if (isSectionItem && item.subtitle) {
      clusters.push({
        id: item.id,
        parent: undefined,
        children: [item],
      });
    } else {
      clusters.push({
        id: item.id,
        parent: item,
        children: [],
      });
    }
  }

  return clusters;
}

function getStoredItems(key: string): SearchItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setStoredItems(key: string, items: SearchItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // ignore storage quota errors
  }
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;

  const cleanWords = query
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  if (cleanWords.length === 0) return <>{text}</>;

  const regex = new RegExp(`(${cleanWords.join("|")})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) => {
        const isMatch = regex.test(part);
        regex.lastIndex = 0;
        return isMatch ? (
          <span
            key={i}
            className="text-foreground underline decoration-brand-secondary/75 decoration-2 underline-offset-2"
          >
            {part}
          </span>
        ) : (
          part
        );
      })}
    </>
  );
}

const SUGGESTED_TOPICS = [
  {
    key: "calculus",
    title: "Kalkulus & Metode Numerik",
    subtitle: "Bidang studi TPB",
    href: "/courses",
    icon: GraduationCap,
    group: "Course",
  },
  {
    key: "physics",
    title: "Fisika Dasar",
    subtitle: "Bidang studi TPB",
    href: "/courses",
    icon: GraduationCap,
    group: "Course",
  },
  {
    key: "quizPractice",
    title: "Kuis & Latihan Soal",
    subtitle: "Bank soal dan evaluasi",
    href: "/courses",
    icon: FileText,
    group: "Evaluasi",
  },
  {
    key: "courseCatalog",
    title: "Katalog Course",
    subtitle: "Daftar seluruh kurikulum",
    href: "/courses",
    icon: Compass,
    group: "Halaman",
  },
];

const MARKETING_SUGGESTED_TOPICS = [
  {
    key: "plans",
    title: "Paket Belajar & Harga",
    subtitle: "Pilihan langganan dan biaya",
    href: "/plans",
    icon: Tag,
    group: "Halaman",
  },
  {
    key: "about",
    title: "Tentang Zyx Academy",
    subtitle: "Profil, visi, dan pengajar",
    href: "/about",
    icon: Info,
    group: "Halaman",
  },
  {
    key: "testimonials",
    title: "Testimoni Mahasiswa",
    subtitle: "Pengalaman dan ulasan alumni",
    href: "/testimonial",
    icon: Star,
    group: "Halaman",
  },
  {
    key: "learningArticles",
    title: "Artikel & Panduan Belajar",
    subtitle: "Tips, trik, dan wawasan edukasi",
    href: "/blog",
    icon: BookOpen,
    group: "Halaman",
  },
];

type CommandMenuDialogProps = {
  open: boolean;
  initialQuery?: string;
  onOpenChange: (open: boolean) => void;
  onSelectStudent: (publicId: string) => void;
  studentSurface: boolean;
};
export function CommandMenuDialog(props: CommandMenuDialogProps) {
  return <StudentAccountBoundary>{account => <CommandMenuDialogContent {...props} account={account} />}</StudentAccountBoundary>;
}
function CommandMenuDialogContent({ open, initialQuery = "", onOpenChange, onSelectStudent, studentSurface, account }: CommandMenuDialogProps & { account: StudentAccountState }) {
  const router = useRouter();
  const t = useTranslations("search");
  const { locale } = useAppLocale();
  const { data: session } = account;
  const experience = useStudentExperience();
  const social = useStudentSocial();
  const demo = experience.mode === "demo";
  const recentStorageKey = demo ? `demo_${RECENT_STORAGE_KEY}` : RECENT_STORAGE_KEY;
  const favoritesStorageKey = demo ? `demo_${FAVORITES_STORAGE_KEY}` : FAVORITES_STORAGE_KEY;
  const demoDocuments = useMemo<SiteSearchDocument[]>(() => (experience.courses ?? []).map(course => ({
    id: course.id, title: course.title, subtitle: "", href: `/courses/${course.id}`, group: "Course & Modul", keywords: course.title, content: "",
  })), [experience.courses]);
  const isAuthenticated = Boolean(session?.user);

  const getCuratedTopicLabels = (title: string, subtitle: string) => {
    const topic = [...SUGGESTED_TOPICS, ...MARKETING_SUGGESTED_TOPICS].find(
      (item) => item.title === title && item.subtitle === subtitle
    );
    return topic
      ? {
          title: t(`suggestedTopics.${topic.key}.title`),
          subtitle: t(`suggestedTopics.${topic.key}.subtitle`),
        }
      : { title, subtitle };
  };

  const [search, setSearch] = useState(initialQuery);
  const [isLoading, setIsLoading] = useState(false);
  const [apiResults, setApiResults] = useState<SiteSearchDocument[]>([]);
  const [people, setPeople] = useState<StudentIdentity[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const resultListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && initialQuery) {
      setSearch(initialQuery);
    }
  }, [open, initialQuery]);

  // Local storage states
  const [recentItems, setRecentItems] = useState<SearchItem[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<SearchItem[]>([]);

  // Search documents cache: initialize with marketing-only if guest, or all static docs if authed
  const [docs, setDocs] = useState<SiteSearchDocument[]>(() => {
    if (demo) return demoDocuments;
    const allStatic = getSiteSearchDocuments();
    return isAuthenticated ? allStatic : allStatic.filter((d) => isMarketingHref(d.href));
  });

  const addNavigationAliases = useCallback((items: SiteSearchDocument[]) => items.map((item) => {
    const href = item.href;
    const aliasKey = href === "/" ? "home"
      : href === "/courses" ? "courses"
      : href === "/plans" ? "plans"
      : href === "/about" ? "about"
      : href.startsWith("/testimonial") ? "testimonial"
      : href.startsWith("/blog") ? "blog"
      : href === "/dashboard" ? "dashboard"
      : href.includes("schedule") ? "schedule"
      : href.includes("groups") ? "groups"
      : href.startsWith("/leaderboard") ? "leaderboard"
      : href === "/calendar" ? "calendar"
      : href.includes("reflection") ? "reflections"
      : href === "/profile" ? "profile"
      : href.startsWith("/settings") ? "settings"
      : href === "/feedback" ? "feedback"
      : href.includes("tutorial-pka") ? "pka"
      : null;
    return aliasKey
      ? { ...item, keywords: `${item.keywords} ${t(`aliases.${aliasKey}`)}` }
      : item;
  }), [t]);

  // Sync recent and favorites from localStorage when opened
  useEffect(() => {
    if (open) {
      const storedRecent = getStoredItems(recentStorageKey);
      const storedFav = getStoredItems(favoritesStorageKey);
      if (isAuthenticated) {
        setRecentItems(storedRecent);
        setFavoriteItems(storedFav);
      } else {
        // Non-authed user: filter out any private or non-marketing history
        setRecentItems(storedRecent.filter((i) => isMarketingHref(i.href)));
        setFavoriteItems(storedFav.filter((i) => isMarketingHref(i.href)));
      }
    }
  }, [open, isAuthenticated, recentStorageKey, favoritesStorageKey]);

  // Load documents depending on authentication status
  useEffect(() => {
    if (demo) { setDocs(demoDocuments); return; }
    if (isAuthenticated) {
      getStudentSearchDocuments()
        .then((items) => setDocs(addNavigationAliases(items)))
        .catch(() => {
          setDocs(getSiteSearchDocuments());
        });
    } else {
      getMarketingSearchDocuments()
        .then((items) => setDocs(addNavigationAliases(items)))
        .catch(() => {
          setDocs(getSiteSearchDocuments().filter((d) => isMarketingHref(d.href)));
        });
    }
  }, [isAuthenticated, addNavigationAliases, demo, demoDocuments]);

  // Client Fuse instance
  const fuse = useMemo(() => {
    return new Fuse(docs, {
      keys: [
        { name: "title", weight: 0.45 },
        { name: "keywords", weight: 0.25 },
        { name: "content", weight: 0.15 },
        { name: "subtitle", weight: 0.1 },
        { name: "href", weight: 0.05 },
      ],
      threshold: 0.38,
      ignoreLocation: true,
      distance: 512,
      minMatchCharLength: 2,
      includeScore: true,
      ignoreDiacritics: true,
    });
  }, [docs]);

  const shortcutDocs = useMemo(() => {
    if (!isAuthenticated) {
      return getMarketingShortcutDocs(docs);
    }
    const byId = new Map(docs.map((d) => [d.id, d]));
    return getSiteSearchShortcutIds()
      .map((id) => byId.get(id))
      .filter((d): d is SiteSearchDocument => d !== undefined);
  }, [docs, isAuthenticated]);

  const trimmed = search.trim();
  const parsedQuery = useMemo(() => parseSearchQueryString(trimmed), [trimmed]);
  const studentAccount = isStudentSocialAccount(account);
  const peopleQuery = !parsedQuery.isScoped || parsedQuery.prefixType === "user" ? parsedQuery.cleanQuery : "";
  useEffect(() => {
    setPeople([]);
    if (!open || !studentSurface || !studentAccount || peopleQuery.length < 2 || peopleQuery.length > 80) {
      setPeopleLoading(false);
      return;
    }
    let active = true;
    setPeopleLoading(true);
    const timer = window.setTimeout(() => {
      social.search(peopleQuery).then(result => { if (active) setPeople(result); })
        .catch(() => { if (active) setPeople([]); })
        .finally(() => { if (active) setPeopleLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [open, studentSurface, studentAccount, peopleQuery, social]);
  const activePrefixLabel = parsedQuery.prefixType
    ? t(`prefixLabels.${parsedQuery.prefixType}`)
    : parsedQuery.prefixLabel;
  const isHelpMode = trimmed === "?";

  useEffect(() => {
    if (resultListRef.current) {
      resultListRef.current.scrollTop = 0;
    }
  }, [search]);

  // Instant local Fuse search with prefix scope awareness
  const fuseResults = useMemo(() => {
    if (!trimmed || isHelpMode || !fuse) return [];
    const queryText = parsedQuery.isScoped ? (parsedQuery.cleanQuery || "") : trimmed;
    if (!queryText) {
      if (parsedQuery.isScoped && parsedQuery.entityType) {
        return docs.filter((d) => normalizeCategory(d.group) === "Administrasi" || d.href.includes(parsedQuery.entityType!));
      }
      return [];
    }
    const hits = fuse.search(queryText, { limit: 48 }).map((r) => r.item);
    if (parsedQuery.isScoped && parsedQuery.entityType) {
      return hits.filter((d) => normalizeCategory(d.group) === "Administrasi" || d.href.includes(parsedQuery.entityType!));
    }
    return hits;
  }, [trimmed, isHelpMode, fuse, parsedQuery, docs]);

  // Debounced API search (250ms)
  useEffect(() => {
    if (demo || !trimmed || isHelpMode) {
      setApiResults([]);
      setIsLoading(false);
      return;
    }

    setApiResults([]);
    setIsLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.grouped) {
            const items: SiteSearchDocument[] = [];
            for (const cat of CATEGORY_ORDER) {
              const list = data.grouped[cat] || [];
              for (const m of list) {
                items.push({
                  id: m.id,
                  title: m.metadata?.title || m.id,
                  subtitle: m.metadata?.subtitle || "",
                  href: m.metadata?.href || "",
                  group: cat,
                  keywords: m.metadata?.keywords || "",
                  content: (m.metadata?.searchable_text as string) || "",
                });
              }
            }
            setApiResults(items);
          } else if (Array.isArray(data)) {
            setApiResults(data);
          } else {
            const items = data.results || data.items || data.data || [];
            if (Array.isArray(items)) {
              setApiResults(items);
            }
          }
        }
      } catch {
        // Fallback gracefully on local fuse results
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, isHelpMode, demo]);

  // Merge API and local hits, then apply deterministic lexical ranking
  const flatResults = useMemo(() => {
    if (!trimmed || isHelpMode) return [];

    const seenHrefs = new Set<string>();
    const merged: SiteSearchDocument[] = [];

    for (const item of apiResults) {
      if (item.href && !seenHrefs.has(item.href)) {
        if (!isAuthenticated && !isMarketingHref(item.href)) {
          continue;
        }
        seenHrefs.add(item.href);
        merged.push(item);
      }
    }

    for (const item of fuseResults) {
      if (item.href && !seenHrefs.has(item.href)) {
        if (!isAuthenticated && !isMarketingHref(item.href)) {
          continue;
        }
        seenHrefs.add(item.href);
        merged.push(item);
      }
    }

    const rankingQuery = parsedQuery.cleanQuery || trimmed;
    return rankSearchDocuments(rankingQuery, merged);
  }, [trimmed, isHelpMode, apiResults, fuseResults, parsedQuery.cleanQuery, isAuthenticated]);

  // Group search hits by normalized category
  const groupedResults = useMemo(() => {
    if (!trimmed) return null;
    const map = new Map<NormalizedCategory, SiteSearchDocument[]>();

    for (const doc of flatResults) {
      const cat = normalizeCategory(doc.group);
      const arr = map.get(cat) ?? [];
      arr.push(doc);
      map.set(cat, arr);
    }

    return map;
  }, [trimmed, flatResults]);

  // Local storage management helpers
  const saveRecent = useCallback((item: SearchItem) => {
    setRecentItems((prev) => {
      const filtered = prev.filter(
        (i) => i.id !== item.id && i.href !== item.href
      );
      const next = [item, ...filtered].slice(0, MAX_RECENT_ITEMS);
      setStoredItems(recentStorageKey, next);
      return next;
    });
  }, [recentStorageKey]);

  const removeRecent = useCallback((id: string) => {
    setRecentItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      setStoredItems(recentStorageKey, next);
      return next;
    });
  }, [recentStorageKey]);

  const toggleFavorite = useCallback((item: SearchItem) => {
    setFavoriteItems((prev) => {
      const exists = prev.some((i) => i.id === item.id || i.href === item.href);
      const next = exists
        ? prev.filter((i) => i.id !== item.id && i.href !== item.href)
        : [item, ...prev];
      setStoredItems(favoritesStorageKey, next);
      return next;
    });
  }, [favoritesStorageKey]);

  const removeFavorite = useCallback((id: string) => {
    setFavoriteItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      setStoredItems(favoritesStorageKey, next);
      return next;
    });
  }, [favoritesStorageKey]);

  const isFavorite = useCallback(
    (id: string, href: string) => {
      return favoriteItems.some((i) => i.id === id || i.href === href);
    },
    [favoriteItems]
  );

  const navigate = useCallback(
    (item: SearchItem) => {
      const target = { ...item, href: experience.href?.(item.href) ?? item.href };
      saveRecent(target);
      onOpenChange(false);
      setSearch("");
      router.push(target.href);
    },
    [router, saveRecent, onOpenChange, experience]
  );

  const groupClass =
    "mt-3 first:mt-0 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-1 [&_[cmdk-group-heading]]:font-heading [&_[cmdk-group-heading]]:text-body-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground";

  const rowClass =
    "group relative flex items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-body-sm text-foreground outline-none cursor-pointer transition-colors duration-150 select-none hover:bg-muted/60 aria-selected:bg-muted/90";

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setSearch("");
          setApiResults([]);
          setIsLoading(false);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 z-[200] bg-black/45",
            "supports-backdrop-filter:backdrop-blur-xs",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
          )}
        />

        <div className="pointer-events-none fixed inset-0 z-[201] flex items-start justify-center overflow-y-auto p-3 pt-[6vh] sm:p-4 sm:pt-[11vh]">
          <Dialog.Content
            aria-label={t("dialogLabel")}
            className={cn(
              "pointer-events-auto relative w-full max-w-xl overflow-hidden rounded-2xl border border-border/80 bg-popover/98 text-popover-foreground shadow-2xl backdrop-blur-xl outline-none",
              "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
              "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
            )}
          >
            <Dialog.Title className="sr-only">{t("dialogLabel")}</Dialog.Title>
            <Dialog.Description className="sr-only">
              {t("description")}
            </Dialog.Description>

            {/* Subtle Zyx brand accent hairline */}
            <div
              aria-hidden="true"
              className="h-0.5 w-full bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-primary/40"
            />

            <Command
              shouldFilter={false}
              vimBindings={false}
              className="flex w-full flex-col"
            >
              {/* Search Header */}
              <div className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3">
                {isLoading ? (
                  <Loader2
                    className="size-4 shrink-0 animate-spin text-brand-secondary"
                    aria-label={t("loading")}
                  />
                ) : (
                  <Search
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}

                {parsedQuery.isScoped && activePrefixLabel ? (
                  <div className="inline-flex shrink-0 select-none items-center gap-1 rounded-md border border-brand-secondary/30 bg-brand-secondary/10 px-2.5 py-0.5 text-body-xs font-medium text-brand-secondary animate-in fade-in zoom-in-95 duration-150">
                    <span>{activePrefixLabel}</span>
                    <button
                      type="button"
                      onClick={() => setSearch(parsedQuery.cleanQuery)}
                      className="relative rounded-sm p-0.5 transition-colors hover:bg-brand-secondary/15 cursor-pointer after:absolute after:-inset-1.5 after:content-['']"
                      aria-label={t("clearPrefix")}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ) : null}

                <Command.Input
                  placeholder={
                    parsedQuery.isScoped && activePrefixLabel
                      ? t("scopedPlaceholder", {
                          prefix: activePrefixLabel.toLowerCase(),
                        })
                      : t("placeholder")
                  }
                  value={parsedQuery.isScoped ? parsedQuery.cleanQuery : search}
                  onValueChange={(val) => {
                    if (parsedQuery.isScoped) {
                      const rawPrefix = search.split(":")[0];
                      setSearch(`${rawPrefix}: ${val}`);
                    } else {
                      setSearch(val);
                    }
                  }}
                  className="flex h-7 w-full min-w-0 bg-transparent font-sans text-body-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
                />

                {search.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground after:absolute after:-inset-1 after:content-['']"
                    aria-label={t("clear")}
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                ) : null}

                {/* Desktop ESC hint */}
                <kbd className="pointer-events-none hidden shrink-0 select-none rounded-md border border-border/70 bg-muted/60 px-1.5 py-0.5 font-mono text-body-2xs font-medium text-muted-foreground sm:inline-flex">
                  esc
                </kbd>

                {/* Mobile close button when query is empty */}
                {search.length === 0 ? (
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:hidden after:absolute after:-inset-1 after:content-['']"
                      aria-label={t("close")}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </Dialog.Close>
                ) : null}
              </div>

              {/* Search Body / Results List */}
              <Command.List
                ref={resultListRef}
                className="max-h-[min(440px,calc(100dvh-11rem))] scroll-py-2 overflow-y-auto p-2 outline-none"
              >
                {/* State 1: Zero-State (search === "") */}
                {!trimmed ? (
                  <>
                    {/* Recent */}
                    {recentItems.length > 0 ? (
                      <Command.Group heading={t("recent")} className={groupClass}>
                        {recentItems.map((item) => {
                          const Icon = groupIcon(item.group);
                          const favorited = isFavorite(item.id, item.href);
                          const labels = getCuratedTopicLabels(
                            item.title,
                            item.subtitle
                          );
                          return (
                            <Command.Item
                              key={`recent:${item.id}`}
                              value={`recent ${item.title} ${item.subtitle}`}
                              onSelect={() => navigate(item)}
                              className={rowClass}
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                <Icon
                                  className="size-4 shrink-0 text-muted-foreground transition-colors group-aria-selected:text-brand-secondary"
                                  aria-hidden="true"
                                />
                                <div className="flex min-w-0 flex-1 flex-col">
                                  <span className="truncate font-medium text-body-sm leading-snug text-foreground">
                                    {labels.title}
                                  </span>
                                  {labels.subtitle ? (
                                    <span className="truncate text-body-xs leading-tight text-muted-foreground">
                                      {labels.subtitle}
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <div
                                className="flex shrink-0 items-center gap-0.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFavorite(item);
                                  }}
                                  className={cn(
                                    "flex size-8 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-background/80 text-muted-foreground/70 hover:text-status-warning",
                                    favorited && "text-status-warning"
                                  )}
                                  aria-label={
                                    favorited
                                      ? t("removeFavorite")
                                      : t("addFavorite")
                                  }
                                  title={
                                    favorited
                                      ? t("removeFavorite")
                                      : t("addFavorite")
                                  }
                                >
                                  <Star
                                    className={cn(
                                      "size-3.5",
                                      favorited && "fill-status-warning text-status-warning"
                                    )}
                                  />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeRecent(item.id);
                                  }}
                                  className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
                                  aria-label={t("removeRecent")}
                                  title={t("removeRecent")}
                                >
                                  <X className="size-3.5" />
                                </button>
                              </div>
                            </Command.Item>
                          );
                        })}
                      </Command.Group>
                    ) : null}

                    {/* Favorites */}
                    {favoriteItems.length > 0 ? (
                      <Command.Group heading={t("favorite")} className={groupClass}>
                        {favoriteItems.map((item) => {
                          const Icon = groupIcon(item.group);
                          const labels = getCuratedTopicLabels(
                            item.title,
                            item.subtitle
                          );
                          return (
                            <Command.Item
                              key={`fav:${item.id}`}
                              value={`favorite ${item.title} ${item.subtitle}`}
                              onSelect={() => navigate(item)}
                              className={rowClass}
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                <Icon
                                  className="size-4 shrink-0 text-muted-foreground transition-colors group-aria-selected:text-brand-secondary"
                                  aria-hidden="true"
                                />
                                <div className="flex min-w-0 flex-1 flex-col">
                                  <span className="truncate font-medium text-body-sm leading-snug text-foreground">
                                    {labels.title}
                                  </span>
                                  {labels.subtitle ? (
                                    <span className="truncate text-body-xs leading-tight text-muted-foreground">
                                      {labels.subtitle}
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <div
                                className="flex shrink-0 items-center gap-0.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeFavorite(item.id);
                                  }}
                                  className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-status-warning transition-colors hover:bg-background/80 hover:text-status-warning/80"
                                  aria-label={t("removeFavorite")}
                                  title={t("removeFavorite")}
                                >
                                  <Star className="size-3.5 fill-status-warning text-status-warning" />
                                </button>
                              </div>
                            </Command.Item>
                          );
                        })}
                      </Command.Group>
                    ) : null}

                    {/* Quick Access when recent & favorites are empty */}
                    {recentItems.length === 0 && favoriteItems.length === 0 ? (
                      <Command.Group
                        heading={t("quickAccess")}
                        className={groupClass}
                      >
                        {shortcutDocs.map((doc) => {
                          const Icon = groupIcon(doc.group);
                          const favorited = isFavorite(doc.id, doc.href);
                          return (
                            <Command.Item
                              key={doc.id}
                              value={doc.id}
                              onSelect={() => navigate(doc)}
                              className={rowClass}
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-3">
                                <Icon
                                  className="size-4 shrink-0 text-muted-foreground transition-colors group-aria-selected:text-brand-secondary"
                                  aria-hidden="true"
                                />
                                <div className="flex min-w-0 flex-1 flex-col">
                                  <span className="truncate font-medium text-body-sm leading-snug text-foreground">
                                    {doc.title}
                                  </span>
                                  {doc.subtitle ? (
                                    <span className="truncate text-body-xs leading-tight text-muted-foreground">
                                      {doc.subtitle}
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <div
                                className="flex shrink-0 items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFavorite(doc);
                                  }}
                                  className={cn(
                                    "flex size-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-background/80 hover:text-status-warning",
                                    favorited && "text-status-warning"
                                  )}
                                  aria-label={t("addFavorite")}
                                  title={t("addFavorite")}
                                >
                                  <Star
                                    className={cn(
                                      "size-3.5",
                                      favorited && "fill-status-warning text-status-warning"
                                    )}
                                  />
                                </button>
                                <ChevronRight
                                  className="size-3.5 text-muted-foreground/40 transition-colors group-aria-selected:text-foreground"
                                  aria-hidden="true"
                                />
                              </div>
                            </Command.Item>
                          );
                        })}
                      </Command.Group>
                    ) : null}
                  </>
                ) : null}

                {/* State 3: Empty / No Results */}
                {trimmed &&
                !isHelpMode &&
                flatResults.length === 0 &&
                people.length === 0 &&
                !isLoading &&
                !peopleLoading ? (
                  <div className="py-3">
                    <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-7 text-center">
                      <FolderSearch
                        className="size-7 text-muted-foreground/50"
                        aria-hidden="true"
                      />
                      <div className="font-heading text-body-sm font-semibold text-foreground">
                        {t("noResults", { query: search })}
                      </div>
                      <div className="max-w-[30ch] text-body-xs text-muted-foreground">
                        {t("noResultsHelp")}
                      </div>
                    </div>

                    <div className="mt-1 border-t border-border/50 pt-2">
                      <div className="px-2.5 pb-1.5 pt-1 font-heading text-body-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("suggestions")}
                      </div>
                      <div className="flex flex-col">
                        {(isAuthenticated
                          ? SUGGESTED_TOPICS
                          : MARKETING_SUGGESTED_TOPICS
                        ).map((topic) => (
                          <Command.Item
                            key={topic.title}
                            value={topic.title}
                            onSelect={() => {
                              navigate({
                                id: `suggested:${topic.title}`,
                                title: topic.title,
                                subtitle: topic.subtitle,
                                href: topic.href,
                                group: topic.group,
                              });
                            }}
                            className={rowClass}
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <topic.icon
                                className="size-4 shrink-0 text-muted-foreground transition-colors group-aria-selected:text-brand-secondary"
                                aria-hidden="true"
                              />
                              <div className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate font-medium text-body-sm leading-snug text-foreground">
                                  {t(`suggestedTopics.${topic.key}.title`)}
                                </span>
                                <span className="truncate text-body-xs leading-tight text-muted-foreground">
                                  {t(`suggestedTopics.${topic.key}.subtitle`)}
                                </span>
                              </div>
                            </div>
                            <ChevronRight
                              className="size-3.5 shrink-0 text-muted-foreground/40 transition-colors group-aria-selected:text-foreground"
                              aria-hidden="true"
                            />
                          </Command.Item>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Help Mode */}
                {isHelpMode ? (
                  <div className="py-1">
                    <div className="mx-1.5 mb-2 flex items-start gap-2.5 rounded-xl bg-muted/40 px-3 py-2.5">
                      <CircleHelp
                        className="mt-0.5 size-4 shrink-0 text-brand-secondary"
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <div className="font-heading text-body-sm font-semibold text-foreground">
                          {t("helpTitle")}
                        </div>
                        <p className="mt-0.5 text-body-xs text-muted-foreground">
                          {isAuthenticated
                            ? t("helpAuthenticated")
                            : t("helpGuest")}
                        </p>
                      </div>
                    </div>

                    {isAuthenticated ? (
                      <Command.Group
                        heading={t("prefixes")}
                        className={groupClass}
                      >
                        {SEARCH_PREFIX_DEFINITIONS.map((definition) => (
                          <Command.Item
                            key={definition.type}
                            value={`help ${definition.aliases.join(" ")} ${definition.label}`}
                            onSelect={() =>
                              setSearch(`${definition.aliases[0]}: `)
                            }
                            className={rowClass}
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <kbd className="min-w-16 shrink-0 rounded-md border border-border/70 bg-background px-2 py-0.5 text-center font-mono text-body-xs font-medium text-foreground">
                                {definition.aliases[0]}:
                              </kbd>
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium text-body-sm text-foreground">
                                  {t(`prefixLabels.${definition.type}`)}
                                </div>
                                <div className="truncate text-body-xs text-muted-foreground">
                                  {t("example")} {definition.example}
                                </div>
                              </div>
                            </div>
                            <ChevronRight
                              className="size-3.5 shrink-0 text-muted-foreground/40 group-aria-selected:text-foreground"
                              aria-hidden="true"
                            />
                          </Command.Item>
                        ))}
                      </Command.Group>
                    ) : (
                      <Command.Group
                        heading={t("mainPages")}
                        className={groupClass}
                      >
                        {MARKETING_SUGGESTED_TOPICS.map((topic) => (
                          <Command.Item
                            key={topic.title}
                            value={`help ${topic.title} ${topic.subtitle}`}
                            onSelect={() => {
                              navigate({
                                id: `help:${topic.title}`,
                                title: topic.title,
                                subtitle: topic.subtitle,
                                href: topic.href,
                                group: topic.group,
                              });
                            }}
                            className={rowClass}
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <topic.icon
                                className="size-4 shrink-0 text-muted-foreground group-aria-selected:text-brand-secondary"
                                aria-hidden="true"
                              />
                              <div className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate font-medium text-body-sm leading-snug text-foreground">
                                  {t(`suggestedTopics.${topic.key}.title`)}
                                </span>
                                <span className="truncate text-body-xs leading-tight text-muted-foreground">
                                  {t(`suggestedTopics.${topic.key}.subtitle`)}
                                </span>
                              </div>
                            </div>
                            <ChevronRight
                              className="size-3.5 shrink-0 text-muted-foreground/40 group-aria-selected:text-foreground"
                              aria-hidden="true"
                            />
                          </Command.Item>
                        ))}
                      </Command.Group>
                    )}
                  </div>
                ) : null}

                {/* People Results */}
                {trimmed && !isHelpMode && people.length > 0 ? (
                  <Command.Group
                    heading={locale === "en" ? "People" : "Orang"}
                    className={groupClass}
                  >
                    {people.map((person) => (
                      <Command.Item
                        key={person.publicId}
                        value={`person ${person.publicId} ${person.displayName}`}
                        onSelect={() => onSelectStudent(person.publicId)}
                        className={rowClass}
                      >
                        <StudentIdentityContent
                          name={person.displayName}
                          identity={person}
                        />
                      </Command.Item>
                    ))}
                  </Command.Group>
                ) : null}

                {/* Active Search Results with Parent-Children Hierarchy */}
                {trimmed &&
                  !isHelpMode &&
                  flatResults.length > 0 &&
                  CATEGORY_ORDER.map((cat) => {
                    const items = groupedResults?.get(cat) ?? [];
                    if (items.length === 0) return null;
                    const Icon = getCategoryIcon(cat);
                    const clusters = clusterSearchItems(items);

                    return (
                      <Command.Group
                        key={cat}
                        heading={t(`categories.${categoryMessageKey(cat)}`)}
                        className={groupClass}
                      >
                        {clusters.map((cluster) => (
                          <div key={cluster.id} className="flex flex-col">
                            {cluster.parent ? (
                              <Command.Item
                                key={cluster.parent.id}
                                value={`${cluster.parent.id} ${cluster.parent.title} ${cluster.parent.subtitle} ${cluster.parent.keywords || ""}`}
                                onSelect={() => navigate(cluster.parent!)}
                                className={rowClass}
                              >
                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                  <Icon
                                    className="size-4 shrink-0 text-muted-foreground transition-colors group-aria-selected:text-brand-secondary"
                                    aria-hidden="true"
                                  />
                                  <div className="flex min-w-0 flex-1 flex-col">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <div className="truncate font-medium text-body-sm leading-snug text-foreground">
                                        <HighlightText
                                          text={cluster.parent.title}
                                          query={trimmed}
                                        />
                                      </div>
                                      {cat === "Navigasi" ? (
                                        <NavigationSurfaceBadge
                                          label={t(
                                            `surface.${
                                              getNavigationSurface(
                                                cluster.parent.href
                                              ) === "Admin"
                                                ? "admin"
                                                : getNavigationSurface(
                                                      cluster.parent.href
                                                    ) === "Tutor"
                                                  ? "tutor"
                                                  : getNavigationSurface(
                                                        cluster.parent.href
                                                      ) === "Murid"
                                                    ? "student"
                                                    : "public"
                                            }`
                                          )}
                                        />
                                      ) : null}
                                    </div>
                                    {cluster.children.length === 0 &&
                                    cluster.parent.subtitle ? (
                                      <div className="truncate text-body-xs leading-tight text-muted-foreground">
                                        <HighlightText
                                          text={cluster.parent.subtitle}
                                          query={trimmed}
                                        />
                                      </div>
                                    ) : null}
                                  </div>
                                </div>

                                <ChevronRight
                                  className="size-3.5 shrink-0 text-muted-foreground/40 transition-colors group-aria-selected:text-foreground"
                                  aria-hidden="true"
                                />
                              </Command.Item>
                            ) : null}

                            {cluster.children.length > 0 ? (
                              <div
                                className={cn(
                                  "flex flex-col",
                                  cluster.parent
                                    ? "ml-4 border-l border-border/70 pl-2.5"
                                    : ""
                                )}
                              >
                                {cluster.children.map((child) => (
                                  <Command.Item
                                    key={child.id}
                                    value={`${child.id} ${child.title} ${child.subtitle} ${child.keywords || ""}`}
                                    onSelect={() => navigate(child)}
                                    className={rowClass}
                                  >
                                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                                      <Hash
                                        className="size-3.5 shrink-0 text-muted-foreground/70 transition-colors group-aria-selected:text-brand-secondary"
                                        aria-hidden="true"
                                      />
                                      <div className="flex min-w-0 flex-1 flex-col">
                                        {child.subtitle ? (
                                          <div className="truncate text-body-xs leading-tight text-muted-foreground">
                                            <HighlightText
                                              text={child.subtitle}
                                              query={trimmed}
                                            />
                                          </div>
                                        ) : null}
                                        <div className="flex min-w-0 items-center gap-2">
                                          <div className="truncate font-medium text-body-sm leading-snug text-foreground">
                                            <HighlightText
                                              text={child.title}
                                              query={trimmed}
                                            />
                                          </div>
                                          {cat === "Navigasi" ? (
                                            <NavigationSurfaceBadge
                                              label={t(
                                                `surface.${
                                                  getNavigationSurface(
                                                    child.href
                                                  ) === "Admin"
                                                    ? "admin"
                                                    : getNavigationSurface(
                                                          child.href
                                                        ) === "Tutor"
                                                      ? "tutor"
                                                      : getNavigationSurface(
                                                            child.href
                                                          ) === "Murid"
                                                        ? "student"
                                                        : "public"
                                                }`
                                              )}
                                            />
                                          ) : null}
                                        </div>
                                      </div>
                                    </div>

                                    <ChevronRight
                                      className="size-3.5 shrink-0 text-muted-foreground/40 transition-colors group-aria-selected:text-foreground"
                                      aria-hidden="true"
                                    />
                                  </Command.Item>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </Command.Group>
                    );
                  })}
              </Command.List>

              {/* Minimal Zyx Footer */}
              <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-muted/20 px-4 py-2 text-body-xs text-muted-foreground select-none">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSearch(isHelpMode ? "" : "?")}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-md text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={t("helpTitle")}
                  >
                    <kbd className="rounded border border-border/70 bg-background px-1.5 py-0.5 font-mono text-body-2xs font-medium text-foreground">
                      ?
                    </kbd>
                    <span>{t("helpButton")}</span>
                  </button>
                  <span className="hidden items-center gap-1 sm:inline-flex">
                    <kbd className="rounded border border-border/70 bg-background px-1 py-0.5 font-mono text-body-2xs font-medium text-foreground">
                      ↑↓
                    </kbd>
                    <span>{t("navigate")}</span>
                  </span>
                  <span className="hidden items-center gap-1 sm:inline-flex">
                    <kbd className="rounded border border-border/70 bg-background px-1.5 py-0.5 font-mono text-body-2xs font-medium text-foreground">
                      ↵
                    </kbd>
                    <span>{t("open")}</span>
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <Logo
                    variant="symbol"
                    className="[--logo-height:0.875rem]"
                  />
                  <span className="font-heading text-body-xs font-semibold tracking-tight text-foreground/80">
                    Zyx
                  </span>
                </div>
              </div>
            </Command>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
