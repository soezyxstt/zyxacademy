"use client";

import {
  createContext,
  useCallback,
  useContext,
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
import {
  getStudentSearchDocuments,
  getMarketingSearchDocuments,
} from "@/app/(student)/dashboard/search-actions";
import { useSession } from "@/lib/auth-client";
import {
  parseSearchQueryString,
  SEARCH_PREFIX_DEFINITIONS,
} from "@/lib/search/parser";
import { rankSearchDocuments } from "@/lib/search/ranking";
import Fuse from "fuse.js";

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

function NavigationSurfaceBadge({ href }: { href: string }) {
  return (
    <span className="shrink-0 rounded-md border border-border bg-background/70 px-1.5 py-0.5 text-body-xs font-semibold text-muted-foreground group-aria-selected:border-primary-foreground/30 group-aria-selected:bg-primary-foreground/15 group-aria-selected:text-primary-foreground">
      {getNavigationSurface(href)}
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
            className="font-bold text-foreground underline decoration-primary/50 group-aria-selected:text-primary-foreground group-aria-selected:decoration-primary-foreground/70"
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
    title: "Kalkulus & Metode Numerik",
    subtitle: "Bidang studi TPB",
    href: "/courses",
    icon: GraduationCap,
    group: "Course",
  },
  {
    title: "Fisika Dasar",
    subtitle: "Bidang studi TPB",
    href: "/courses",
    icon: GraduationCap,
    group: "Course",
  },
  {
    title: "Kuis & Latihan Soal",
    subtitle: "Bank soal dan evaluasi",
    href: "/courses",
    icon: FileText,
    group: "Evaluasi",
  },
  {
    title: "Katalog Course",
    subtitle: "Daftar seluruh kurikulum",
    href: "/courses",
    icon: Compass,
    group: "Halaman",
  },
];

const MARKETING_SUGGESTED_TOPICS = [
  {
    title: "Paket Belajar & Harga",
    subtitle: "Pilihan langganan dan biaya",
    href: "/plans",
    icon: Tag,
    group: "Halaman",
  },
  {
    title: "Tentang Zyx Academy",
    subtitle: "Profil, visi, dan pengajar",
    href: "/about",
    icon: Info,
    group: "Halaman",
  },
  {
    title: "Testimoni Mahasiswa",
    subtitle: "Pengalaman dan ulasan alumni",
    href: "/testimonial",
    icon: Star,
    group: "Halaman",
  },
  {
    title: "Artikel & Panduan Belajar",
    subtitle: "Tips, trik, dan wawasan edukasi",
    href: "/blog",
    icon: BookOpen,
    group: "Halaman",
  },
];

export function CommandMenuDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const isAuthenticated = Boolean(session?.user);

  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [apiResults, setApiResults] = useState<SiteSearchDocument[]>([]);
  const resultListRef = useRef<HTMLDivElement>(null);

  // Local storage states
  const [recentItems, setRecentItems] = useState<SearchItem[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<SearchItem[]>([]);

  // Search documents cache: initialize with marketing-only if guest, or all static docs if authed
  const [docs, setDocs] = useState<SiteSearchDocument[]>(() => {
    const allStatic = getSiteSearchDocuments();
    return isAuthenticated ? allStatic : allStatic.filter((d) => isMarketingHref(d.href));
  });

  // Sync recent and favorites from localStorage when opened
  useEffect(() => {
    if (open) {
      const storedRecent = getStoredItems(RECENT_STORAGE_KEY);
      const storedFav = getStoredItems(FAVORITES_STORAGE_KEY);
      if (isAuthenticated) {
        setRecentItems(storedRecent);
        setFavoriteItems(storedFav);
      } else {
        // Non-authed user: filter out any private or non-marketing history
        setRecentItems(storedRecent.filter((i) => isMarketingHref(i.href)));
        setFavoriteItems(storedFav.filter((i) => isMarketingHref(i.href)));
      }
    }
  }, [open, isAuthenticated]);

  // Load documents depending on authentication status
  useEffect(() => {
    if (isAuthenticated) {
      getStudentSearchDocuments()
        .then(setDocs)
        .catch(() => {
          setDocs(getSiteSearchDocuments());
        });
    } else {
      getMarketingSearchDocuments()
        .then(setDocs)
        .catch(() => {
          setDocs(getSiteSearchDocuments().filter((d) => isMarketingHref(d.href)));
        });
    }
  }, [isAuthenticated]);

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
    if (!trimmed || isHelpMode) {
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
  }, [trimmed, isHelpMode]);

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
      setStoredItems(RECENT_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const removeRecent = useCallback((id: string) => {
    setRecentItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      setStoredItems(RECENT_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((item: SearchItem) => {
    setFavoriteItems((prev) => {
      const exists = prev.some((i) => i.id === item.id || i.href === item.href);
      const next = exists
        ? prev.filter((i) => i.id !== item.id && i.href !== item.href)
        : [item, ...prev];
      setStoredItems(FAVORITES_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const removeFavorite = useCallback((id: string) => {
    setFavoriteItems((prev) => {
      const next = prev.filter((i) => i.id !== id);
      setStoredItems(FAVORITES_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (id: string, href: string) => {
      return favoriteItems.some((i) => i.id === id || i.href === href);
    },
    [favoriteItems]
  );

  const navigate = useCallback(
    (item: SearchItem) => {
      saveRecent(item);
      onOpenChange(false);
      setSearch("");
      router.push(item.href);
    },
    [router, saveRecent, onOpenChange]
  );

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
          {/* Overlay */}
          <Dialog.Overlay
            className={cn(
              "fixed inset-0 z-[200] bg-black/50",
              "supports-backdrop-filter:backdrop-blur-xs",
              "data-[state=open]:animate-in data-[state=open]:fade-in-0",
              "data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
            )}
          />

          {/* Centering wrapper */}
          <div className="fixed inset-0 z-[201] flex items-start justify-center p-4 pt-[8vh] md:pt-[12vh] pointer-events-none overflow-y-auto">
            <Dialog.Content
              aria-label="Pencarian situs"
              className={cn(
                "pointer-events-auto relative w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl outline-none",
                "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
                "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
              )}
            >
              <Dialog.Title className="sr-only">Pencarian situs</Dialog.Title>
              <Dialog.Description className="sr-only">
                Cari materi, soal, modul, atau halaman di Zyx Academy.
              </Dialog.Description>

              <Command
                shouldFilter={false}
                vimBindings={false}
                className="w-full flex flex-col"
              >
                {/* Search Header */}
                <div className="flex items-center gap-2.5 border-b border-border bg-background/40 px-4 py-3">
                  <Search
                    className="text-muted-foreground size-5 shrink-0"
                    aria-hidden
                  />
                  {parsedQuery.isScoped && parsedQuery.prefixLabel && (
                    <div className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-body-xs font-semibold shrink-0 select-none animate-in fade-in zoom-in-95 duration-150">
                      <span>{parsedQuery.prefixLabel}</span>
                      <button
                        type="button"
                        onClick={() => setSearch(parsedQuery.cleanQuery)}
                        className="ml-0.5 rounded hover:bg-primary/20 p-0.5 transition-colors cursor-pointer text-primary/80 hover:text-primary"
                        aria-label="Hapus filter prefiks"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  )}
                  <Command.Input
                    placeholder={
                      parsedQuery.isScoped && parsedQuery.prefixLabel
                        ? `Cari dalam ${parsedQuery.prefixLabel.toLowerCase()}...`
                        : "Cari di Zyx, atau ketik ? untuk bantuan..."
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
                    className="placeholder:text-muted-foreground/60 flex h-7 w-full bg-transparent text-body-sm sm:text-body-base outline-none text-foreground"
                  />

                  {/* Loading indicator */}
                  {isLoading && (
                    <Loader2
                      className="size-4 shrink-0 animate-spin text-primary"
                      aria-label="Memuat hasil pencarian"
                    />
                  )}

                  {/* Clear button */}
                  {search.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                      aria-label="Bersihkan pencarian"
                    >
                      <X className="size-4" />
                    </button>
                  )}

                  {/* ESC badge */}
                  <kbd className="bg-muted/70 text-muted-foreground pointer-events-none shrink-0 select-none rounded border border-border px-1.5 py-0.5 font-mono text-body-xs font-semibold">
                    esc
                  </kbd>
                </div>

                {/* Search Body / Results List */}
                <Command.List
                  ref={resultListRef}
                  className="max-h-[min(460px,calc(100dvh-13rem))] scroll-py-2 overflow-y-auto p-3 outline-none"
                >
                  {/* State 1: Zero-State (search === "") */}
                  {!trimmed && (
                    <>
                      {/* Section 1: Recent */}
                      {recentItems.length > 0 && (
                        <Command.Group
                          heading="Recent"
                          className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-body-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                        >
                          {recentItems.map((item) => {
                            const Icon = groupIcon(item.group);
                            const favorited = isFavorite(item.id, item.href);
                            return (
                              <Command.Item
                                key={`recent:${item.id}`}
                                value={`recent ${item.title} ${item.subtitle}`}
                                onSelect={() => navigate(item)}
                                className={cn(
                                  "group flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 my-1 text-body-sm outline-none cursor-pointer transition-all duration-150 select-none",
                                  "bg-muted/40 hover:bg-muted/80 text-foreground border border-transparent",
                                  "aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:border-primary/20 aria-selected:shadow-sm"
                                )}
                              >
                                <div className="flex min-w-0 items-center gap-3 flex-1">
                                  <div
                                    className={cn(
                                      "flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors",
                                      "border-border/60 bg-background text-muted-foreground",
                                      "group-hover:border-border group-hover:text-foreground",
                                      "group-aria-selected:border-primary-foreground/20 group-aria-selected:bg-primary-foreground/15 group-aria-selected:text-primary-foreground"
                                    )}
                                  >
                                    <Icon className="size-4" aria-hidden />
                                  </div>
                                  <div className="min-w-0 flex-1 flex flex-col justify-center">
                                    <span className="truncate font-medium text-foreground text-body-sm leading-snug group-aria-selected:text-primary-foreground">
                                      {item.title}
                                    </span>
                                    <span className="truncate text-body-xs text-muted-foreground leading-tight mt-0.5 group-aria-selected:text-primary-foreground/80">
                                      {item.subtitle}
                                    </span>
                                  </div>
                                </div>

                                <div
                                  className="flex items-center gap-1.5 shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {/* Star button */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFavorite(item);
                                    }}
                                    className={cn(
                                      "p-1.5 rounded-md transition-colors cursor-pointer",
                                      "hover:bg-muted/80 text-muted-foreground/60 hover:text-amber-500",
                                      "group-aria-selected:hover:bg-primary-foreground/20 group-aria-selected:text-primary-foreground/70",
                                      favorited &&
                                        "text-amber-500 hover:text-amber-600 fill-amber-500"
                                    )}
                                    aria-label={
                                      favorited
                                        ? "Hapus dari favorit"
                                        : "Tambah ke favorit"
                                    }
                                    title={
                                      favorited
                                        ? "Hapus dari favorit"
                                        : "Tambah ke favorit"
                                    }
                                  >
                                    <Star
                                      className={cn(
                                        "size-3.5",
                                        favorited &&
                                          "fill-amber-500 text-amber-500 group-aria-selected:text-amber-300 group-aria-selected:fill-amber-300"
                                      )}
                                    />
                                  </button>

                                  <span className="text-border text-body-xs select-none group-aria-selected:text-primary-foreground/40">
                                    |
                                  </span>

                                  {/* Remove from recent */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeRecent(item.id);
                                    }}
                                    className={cn(
                                      "p-1.5 rounded-md transition-colors cursor-pointer",
                                      "hover:bg-destructive/10 text-muted-foreground/60 hover:text-destructive",
                                      "group-aria-selected:hover:bg-primary-foreground/20 group-aria-selected:text-primary-foreground/70 group-aria-selected:hover:text-red-200"
                                    )}
                                    aria-label="Hapus dari recent"
                                    title="Hapus dari recent"
                                  >
                                    <X className="size-3.5" />
                                  </button>
                                </div>
                              </Command.Item>
                            );
                          })}
                        </Command.Group>
                      )}

                      {/* Section 2: Favorite */}
                      {favoriteItems.length > 0 && (
                        <Command.Group
                          heading="Favorite"
                          className="mt-2 [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-body-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                        >
                          {favoriteItems.map((item) => {
                            const Icon = groupIcon(item.group);
                            return (
                              <Command.Item
                                key={`fav:${item.id}`}
                                value={`favorite ${item.title} ${item.subtitle}`}
                                onSelect={() => navigate(item)}
                                className={cn(
                                  "group flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 my-1 text-body-sm outline-none cursor-pointer transition-all duration-150 select-none",
                                  "bg-muted/40 hover:bg-muted/80 text-foreground border border-transparent",
                                  "aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:border-primary/20 aria-selected:shadow-sm"
                                )}
                              >
                                <div className="flex min-w-0 items-center gap-3 flex-1">
                                  <div
                                    className={cn(
                                      "flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors",
                                      "border-border/60 bg-background text-muted-foreground",
                                      "group-hover:border-border group-hover:text-foreground",
                                      "group-aria-selected:border-primary-foreground/20 group-aria-selected:bg-primary-foreground/15 group-aria-selected:text-primary-foreground"
                                    )}
                                  >
                                    <Icon className="size-4" aria-hidden />
                                  </div>
                                  <div className="min-w-0 flex-1 flex flex-col justify-center">
                                    <span className="truncate font-medium text-foreground text-body-sm leading-snug group-aria-selected:text-primary-foreground">
                                      {item.title}
                                    </span>
                                    <span className="truncate text-body-xs text-muted-foreground leading-tight mt-0.5 group-aria-selected:text-primary-foreground/80">
                                      {item.subtitle}
                                    </span>
                                  </div>
                                </div>

                                <div
                                  className="flex items-center gap-1.5 shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {/* Filled Star */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeFavorite(item.id);
                                    }}
                                    className={cn(
                                      "p-1.5 rounded-md transition-colors cursor-pointer text-amber-500 hover:text-amber-600",
                                      "group-aria-selected:hover:bg-primary-foreground/20 group-aria-selected:text-amber-300"
                                    )}
                                    aria-label="Hapus dari favorit"
                                    title="Hapus dari favorit"
                                  >
                                    <Star className="size-3.5 fill-amber-500 text-amber-500 group-aria-selected:text-amber-300 group-aria-selected:fill-amber-300" />
                                  </button>

                                  <span className="text-border text-body-xs select-none group-aria-selected:text-primary-foreground/40">
                                    |
                                  </span>

                                  {/* Remove from favorite */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeFavorite(item.id);
                                    }}
                                    className={cn(
                                      "p-1.5 rounded-md transition-colors cursor-pointer",
                                      "hover:bg-destructive/10 text-muted-foreground/60 hover:text-destructive",
                                      "group-aria-selected:hover:bg-primary-foreground/20 group-aria-selected:text-primary-foreground/70 group-aria-selected:hover:text-red-200"
                                    )}
                                    aria-label="Hapus dari favorit"
                                    title="Hapus dari favorit"
                                  >
                                    <X className="size-3.5" />
                                  </button>
                                </div>
                              </Command.Item>
                            );
                          })}
                        </Command.Group>
                      )}

                      {/* Akses Cepat if recent and favorites are empty */}
                      {recentItems.length === 0 && favoriteItems.length === 0 && (
                        <Command.Group
                          heading="Akses cepat"
                          className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-body-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                        >
                          {shortcutDocs.map((doc) => {
                            const Icon = groupIcon(doc.group);
                            const favorited = isFavorite(doc.id, doc.href);
                            return (
                              <Command.Item
                                key={doc.id}
                                value={doc.id}
                                onSelect={() => navigate(doc)}
                                className={cn(
                                  "group flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 my-1 text-body-sm outline-none cursor-pointer transition-all duration-150 select-none",
                                  "bg-muted/40 hover:bg-muted/80 text-foreground border border-transparent",
                                  "aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:border-primary/20 aria-selected:shadow-sm"
                                )}
                              >
                                <div className="flex min-w-0 items-center gap-3 flex-1">
                                  <div
                                    className={cn(
                                      "flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors",
                                      "border-border/60 bg-background text-muted-foreground",
                                      "group-hover:border-border group-hover:text-foreground",
                                      "group-aria-selected:border-primary-foreground/20 group-aria-selected:bg-primary-foreground/15 group-aria-selected:text-primary-foreground"
                                    )}
                                  >
                                    <Icon className="size-4" aria-hidden />
                                  </div>
                                  <div className="min-w-0 flex-1 flex flex-col justify-center">
                                    <span className="truncate font-medium text-foreground text-body-sm leading-snug group-aria-selected:text-primary-foreground">
                                      {doc.title}
                                    </span>
                                    <span className="truncate text-body-xs text-muted-foreground leading-tight mt-0.5 group-aria-selected:text-primary-foreground/80">
                                      {doc.subtitle}
                                    </span>
                                  </div>
                                </div>

                                <div
                                  className="flex items-center gap-1.5 shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFavorite(doc);
                                    }}
                                    className={cn(
                                      "p-1.5 rounded-md transition-colors cursor-pointer",
                                      "hover:bg-muted/80 text-muted-foreground/60 hover:text-amber-500",
                                      "group-aria-selected:hover:bg-primary-foreground/20 group-aria-selected:text-primary-foreground/70",
                                      favorited && "text-amber-500 fill-amber-500"
                                    )}
                                    aria-label="Tambah ke favorit"
                                    title="Tambah ke favorit"
                                  >
                                    <Star
                                      className={cn(
                                        "size-3.5",
                                        favorited &&
                                          "fill-amber-500 text-amber-500 group-aria-selected:text-amber-300 group-aria-selected:fill-amber-300"
                                      )}
                                    />
                                  </button>
                                  <ChevronRight
                                    className="size-4 text-muted-foreground/50 group-hover:text-foreground group-aria-selected:text-primary-foreground"
                                    aria-hidden
                                  />
                                </div>
                              </Command.Item>
                            );
                          })}
                        </Command.Group>
                      )}
                    </>
                  )}

                  {/* State 3: Empty / No Results (search !== "" && flatResults.length === 0 && !loading) */}
                  {trimmed && !isHelpMode && flatResults.length === 0 && !isLoading && (
                    <div className="py-4">
                      <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                        <FolderSearch
                          className="text-muted-foreground/60 size-8"
                          aria-hidden
                        />
                        <div className="text-body-sm font-medium text-foreground">
                          Tidak ada hasil untuk &ldquo;{search}&rdquo;
                        </div>
                        <div className="max-w-[28ch] text-body-xs text-muted-foreground">
                          Coba periksa ejaan atau gunakan istilah lain.
                        </div>
                      </div>

                      {/* Quick pick recommendations */}
                      <div className="mt-2 border-t border-border/60 pt-3">
                        <div className="px-2 pb-2 text-body-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Coba cari topik berikut:
                        </div>
                        <div className="flex flex-col gap-1">
                          {(isAuthenticated ? SUGGESTED_TOPICS : MARKETING_SUGGESTED_TOPICS).map((topic) => (
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
                              className={cn(
                                "group flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-body-sm outline-none cursor-pointer transition-colors select-none",
                                "bg-muted/40 hover:bg-muted/80 text-foreground border border-transparent",
                                "aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:border-primary/20 aria-selected:shadow-sm"
                              )}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={cn(
                                    "flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors",
                                    "border-border/60 bg-background text-muted-foreground",
                                    "group-hover:border-border group-hover:text-foreground",
                                    "group-aria-selected:border-primary-foreground/20 group-aria-selected:bg-primary-foreground/15 group-aria-selected:text-primary-foreground"
                                  )}
                                >
                                  <topic.icon
                                    className="size-4"
                                    aria-hidden
                                  />
                                </div>
                                <div className="min-w-0 flex flex-col justify-center">
                                  <span className="truncate font-medium text-foreground text-body-sm leading-snug group-aria-selected:text-primary-foreground">
                                    {topic.title}
                                  </span>
                                  <span className="truncate text-body-xs text-muted-foreground leading-tight mt-0.5 group-aria-selected:text-primary-foreground/80">
                                    {topic.subtitle}
                                  </span>
                                </div>
                              </div>
                              <ChevronRight
                                className="size-4 text-muted-foreground/50 group-hover:text-foreground group-aria-selected:text-primary-foreground shrink-0"
                                aria-hidden
                              />
                            </Command.Item>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {isHelpMode && (
                    <div className="py-1">
                      <div className="mx-2 mb-3 flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
                        <CircleHelp
                          className="mt-0.5 size-5 shrink-0 text-primary"
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <div className="font-heading text-body-sm font-bold text-foreground">
                            Panduan pencarian
                          </div>
                          <p className="mt-1 text-body-xs text-muted-foreground">
                            {isAuthenticated
                              ? "Cari langsung untuk semua hasil, atau pilih prefiks untuk membatasi pencarian."
                              : "Cari informasi di situs Zyx Academy seperti paket belajar, tentang kami, testimoni, atau artikel blog."}
                          </p>
                        </div>
                      </div>

                      {isAuthenticated ? (
                        <Command.Group
                          heading="Prefiks"
                          className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-body-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                        >
                          {SEARCH_PREFIX_DEFINITIONS.map((definition) => (
                            <Command.Item
                              key={definition.type}
                              value={`help ${definition.aliases.join(" ")} ${definition.label}`}
                              onSelect={() =>
                                setSearch(`${definition.aliases[0]}: `)
                              }
                              className={cn(
                                "group flex items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 text-body-sm outline-none transition-colors select-none cursor-pointer",
                                "bg-muted/40 hover:bg-muted/80 text-foreground",
                                "aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:border-primary/20"
                              )}
                            >
                              <kbd className="mt-0.5 min-w-20 shrink-0 rounded-md border border-border bg-background px-2 py-1 font-mono text-body-xs font-semibold text-foreground group-aria-selected:border-primary-foreground/30 group-aria-selected:bg-primary-foreground/15 group-aria-selected:text-primary-foreground">
                                {definition.aliases[0]}:
                              </kbd>
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium text-body-sm">
                                  {definition.label}
                                </div>
                                {definition.aliases.length > 1 && (
                                  <div className="text-body-xs text-muted-foreground group-aria-selected:text-primary-foreground/80">
                                    Alias lain: {definition.aliases
                                      .slice(1)
                                      .map((alias) => `${alias}:`)
                                      .join(", ")}
                                  </div>
                                )}
                                <div className="truncate text-body-xs text-muted-foreground group-aria-selected:text-primary-foreground/80">
                                  Contoh: {definition.example}
                                </div>
                              </div>
                              <ChevronRight
                                className="size-4 shrink-0 text-muted-foreground/50 group-aria-selected:text-primary-foreground"
                                aria-hidden
                              />
                            </Command.Item>
                          ))}
                        </Command.Group>
                      ) : (
                        <Command.Group
                          heading="Halaman utama"
                          className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-body-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
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
                              className={cn(
                                "group flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-body-sm outline-none cursor-pointer transition-colors select-none",
                                "bg-muted/40 hover:bg-muted/80 text-foreground border border-transparent",
                                "aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:border-primary/20 aria-selected:shadow-sm"
                              )}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div
                                  className={cn(
                                    "flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors",
                                    "border-border/60 bg-background text-muted-foreground",
                                    "group-hover:border-border group-hover:text-foreground",
                                    "group-aria-selected:border-primary-foreground/20 group-aria-selected:bg-primary-foreground/15 group-aria-selected:text-primary-foreground"
                                  )}
                                >
                                  <topic.icon className="size-4" aria-hidden />
                                </div>
                                <div className="min-w-0 flex flex-col justify-center">
                                  <span className="truncate font-medium text-foreground text-body-sm leading-snug group-aria-selected:text-primary-foreground">
                                    {topic.title}
                                  </span>
                                  <span className="truncate text-body-xs text-muted-foreground leading-tight mt-0.5 group-aria-selected:text-primary-foreground/80">
                                    {topic.subtitle}
                                  </span>
                                </div>
                              </div>
                              <ChevronRight
                                className="size-4 text-muted-foreground/50 group-hover:text-foreground group-aria-selected:text-primary-foreground shrink-0"
                                aria-hidden
                              />
                            </Command.Item>
                          ))}
                        </Command.Group>
                      )}

                      <div className="mx-2 mt-3 border-t border-border/60 px-1 pt-3 text-body-xs text-muted-foreground">
                        Gunakan tombol panah untuk memilih, Enter untuk membuka, dan Esc untuk menutup.
                      </div>
                    </div>
                  )}

                  {/* State 2: Active Search Results with Parent-Children Hierarchy */}
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
                          heading={cat}
                          className="mt-2 first:mt-0 [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-body-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                        >
                          {clusters.map((cluster) => {
                            return (
                              <div key={cluster.id} className="flex flex-col">
                                {/* Parent Item */}
                                {cluster.parent && (
                                  <Command.Item
                                    key={cluster.parent.id}
                                    value={`${cluster.parent.id} ${cluster.parent.title} ${cluster.parent.subtitle} ${cluster.parent.keywords || ""}`}
                                    onSelect={() => navigate(cluster.parent!)}
                                    className={cn(
                                      "group flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 my-1 text-body-sm outline-none cursor-pointer transition-all duration-150 select-none",
                                      "bg-muted/40 hover:bg-muted/80 text-foreground border border-transparent",
                                      "aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:border-primary/20 aria-selected:shadow-sm"
                                    )}
                                  >
                                    <div className="flex min-w-0 items-center gap-3 flex-1">
                                      <div
                                        className={cn(
                                          "flex size-8 shrink-0 items-center justify-center rounded-md border transition-colors",
                                          "border-border/60 bg-background text-muted-foreground",
                                          "group-hover:border-border group-hover:text-foreground",
                                          "group-aria-selected:border-primary-foreground/20 group-aria-selected:bg-primary-foreground/15 group-aria-selected:text-primary-foreground"
                                        )}
                                      >
                                        <Icon className="size-4" aria-hidden />
                                      </div>

                                      <div className="min-w-0 flex-1 flex flex-col justify-center">
                                        <div className="flex min-w-0 items-center gap-2">
                                          <div className="truncate font-medium text-foreground text-body-sm leading-snug group-aria-selected:text-primary-foreground">
                                            <HighlightText
                                              text={cluster.parent.title}
                                              query={trimmed}
                                            />
                                          </div>
                                          {cat === "Navigasi" && (
                                            <NavigationSurfaceBadge
                                              href={cluster.parent.href}
                                            />
                                          )}
                                        </div>
                                        {cluster.children.length === 0 && cluster.parent.subtitle && (
                                          <div className="truncate text-body-xs text-muted-foreground leading-tight mt-0.5 group-aria-selected:text-primary-foreground/80">
                                            <HighlightText
                                              text={cluster.parent.subtitle}
                                              query={trimmed}
                                            />
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    <ChevronRight
                                      className="size-4 text-muted-foreground/50 group-hover:text-foreground group-aria-selected:text-primary-foreground shrink-0"
                                      aria-hidden
                                    />
                                  </Command.Item>
                                )}

                                {/* Children with left connector tree line */}
                                {cluster.children.length > 0 && (
                                  <div
                                    className={cn(
                                      "flex flex-col gap-1",
                                      cluster.parent
                                        ? "relative ml-5 pl-3 my-0.5 border-l-2 border-border/80"
                                        : "my-0.5"
                                    )}
                                  >
                                    {cluster.children.map((child) => (
                                      <Command.Item
                                        key={child.id}
                                        value={`${child.id} ${child.title} ${child.subtitle} ${child.keywords || ""}`}
                                        onSelect={() => navigate(child)}
                                        className={cn(
                                          "group flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-body-sm outline-none cursor-pointer transition-all duration-150 select-none",
                                          cluster.parent
                                            ? "bg-muted/30 hover:bg-muted/70 text-foreground border border-transparent"
                                            : "bg-muted/40 hover:bg-muted/80 text-foreground border border-transparent my-0.5",
                                          "aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:border-primary/20 aria-selected:shadow-sm"
                                        )}
                                      >
                                        <div className="flex min-w-0 items-center gap-3 flex-1">
                                          <div
                                            className={cn(
                                              "flex size-7 shrink-0 items-center justify-center rounded-md border transition-colors",
                                              "border-border/60 bg-background/80 text-muted-foreground",
                                              "group-hover:border-border group-hover:text-foreground",
                                              "group-aria-selected:border-primary-foreground/20 group-aria-selected:bg-primary-foreground/15 group-aria-selected:text-primary-foreground"
                                            )}
                                          >
                                            <Hash className="size-3.5" aria-hidden />
                                          </div>

                                          <div className="min-w-0 flex-1 flex flex-col justify-center">
                                            {child.subtitle && (
                                              <div className="truncate text-body-xs text-muted-foreground leading-tight group-aria-selected:text-primary-foreground/80">
                                                <HighlightText
                                                  text={child.subtitle}
                                                  query={trimmed}
                                                />
                                              </div>
                                            )}
                                            <div className="mt-0.5 flex min-w-0 items-center gap-2">
                                              <div className="truncate font-medium text-foreground text-body-sm leading-snug group-aria-selected:text-primary-foreground">
                                                <HighlightText
                                                  text={child.title}
                                                  query={trimmed}
                                                />
                                              </div>
                                              {cat === "Navigasi" && (
                                                <NavigationSurfaceBadge
                                                  href={child.href}
                                                />
                                              )}
                                            </div>
                                          </div>
                                        </div>

                                        <ChevronRight
                                          className="size-4 text-muted-foreground/50 group-hover:text-foreground group-aria-selected:text-primary-foreground shrink-0"
                                          aria-hidden
                                        />
                                      </Command.Item>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </Command.Group>
                      );
                    })}
                </Command.List>

                {/* Footer Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/20 px-4 py-2.5 text-body-xs text-muted-foreground select-none">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSearch("?")}
                      className="inline-flex items-center gap-1 rounded-md text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
                      aria-label="Buka panduan pencarian"
                    >
                      <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-mono font-medium shadow-2xs text-foreground">
                        ?
                      </kbd>
                      <span className="ml-0.5">Bantuan</span>
                    </button>
                    <span className="inline-flex items-center gap-1">
                      <kbd className="rounded border border-border bg-background px-1 py-0.5 text-[10px] font-mono font-medium shadow-2xs text-foreground">
                        ↑
                      </kbd>
                      <kbd className="rounded border border-border bg-background px-1 py-0.5 text-[10px] font-mono font-medium shadow-2xs text-foreground">
                        ↓
                      </kbd>
                      <span className="ml-0.5 text-muted-foreground">
                        Navigasi
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-mono font-medium shadow-2xs text-foreground">
                        ↵
                      </kbd>
                      <span className="ml-0.5 text-muted-foreground">Buka</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-mono font-medium shadow-2xs text-foreground">
                        esc
                      </kbd>
                      <span className="ml-0.5 text-muted-foreground">
                        Tutup
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground/90">
                    <span>Search powered by</span>
                    <span className="font-semibold text-foreground">
                      Zyx AI
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
