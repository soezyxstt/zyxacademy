"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import {
  BookOpen,
  ChevronRight,
  Compass,
  FileText,
  FolderSearch,
  GraduationCap,
  Home,
  Layers,
  Loader2,
  Search,
  Star,
  X,
} from "lucide-react";
import {
  getSiteSearchDocuments,
  getSiteSearchShortcutIds,
} from "@/lib/site-search-index";
import type { SiteSearchDocument } from "@/lib/site-search-index";
import { cn } from "@/lib/utils";
import { getStudentSearchDocuments } from "@/app/(student)/dashboard/search-actions";
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

type CommandMenuContextValue = {
  open?: boolean;
  setOpen: (open: boolean) => void;
};

const CommandMenuContext = createContext<CommandMenuContextValue | null>(null);

export function useCommandMenu() {
  const ctx = useContext(CommandMenuContext);
  if (!ctx) {
    throw new Error("useCommandMenu must be used within CommandMenuProvider");
  }
  return ctx;
}

const RECENT_STORAGE_KEY = "zyx_search_recent";
const FAVORITES_STORAGE_KEY = "zyx_search_favorites";
const MAX_RECENT_ITEMS = 8;

const CATEGORY_ORDER = [
  "Course & Modul",
  "Materi & Artikel",
  "Kuis & Evaluasi",
  "Navigasi",
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

export function CommandMenuProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [apiResults, setApiResults] = useState<SiteSearchDocument[]>([]);

  // Local storage states
  const [recentItems, setRecentItems] = useState<SearchItem[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<SearchItem[]>([]);

  // Search documents cache
  const [docs, setDocs] = useState<SiteSearchDocument[]>(() =>
    getSiteSearchDocuments()
  );

  // Sync recent and favorites from localStorage when opened
  useEffect(() => {
    if (open) {
      setRecentItems(getStoredItems(RECENT_STORAGE_KEY));
      setFavoriteItems(getStoredItems(FAVORITES_STORAGE_KEY));
    }
  }, [open]);

  // Load student-specific documents on mount
  useEffect(() => {
    getStudentSearchDocuments()
      .then(setDocs)
      .catch(() => {
        // fallback to static docs
      });
  }, []);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("[data-cmdk-ignore-shortcut]")) return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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
    const byId = new Map(docs.map((d) => [d.id, d]));
    return getSiteSearchShortcutIds()
      .map((id) => byId.get(id))
      .filter((d): d is SiteSearchDocument => d !== undefined);
  }, [docs]);

  const trimmed = search.trim();

  // Instant local Fuse search
  const fuseResults = useMemo(() => {
    if (!trimmed || !fuse) return [];
    return fuse.search(trimmed, { limit: 48 }).map((r) => r.item);
  }, [trimmed, fuse]);

  // Debounced API search (250ms)
  useEffect(() => {
    if (!trimmed) {
      setApiResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data)
            ? data
            : data.results || data.items || data.data || [];
          if (Array.isArray(items) && items.length > 0) {
            setApiResults(items);
          }
        }
      } catch {
        // Fallback gracefully on local fuse results
      } finally {
        setIsLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [trimmed]);

  // Combined results: prioritize API hits if available, merged with local Fuse hits
  const flatResults = useMemo(() => {
    if (!trimmed) return [];
    if (apiResults.length === 0) return fuseResults;

    const seenHrefs = new Set<string>();
    const merged: SiteSearchDocument[] = [];

    for (const item of apiResults) {
      if (item.href && !seenHrefs.has(item.href)) {
        seenHrefs.add(item.href);
        merged.push(item);
      }
    }

    for (const item of fuseResults) {
      if (item.href && !seenHrefs.has(item.href)) {
        seenHrefs.add(item.href);
        merged.push(item);
      }
    }

    return merged;
  }, [trimmed, apiResults, fuseResults]);

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
      setOpen(false);
      setSearch("");
      router.push(item.href);
    },
    [router, saveRecent]
  );

  return (
    <CommandMenuContext.Provider value={{ open, setOpen }}>
      {children}

      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
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
                <div className="flex items-center gap-3 border-b border-border bg-background/40 px-4 py-3">
                  <Search
                    className="text-muted-foreground size-5 shrink-0"
                    aria-hidden
                  />
                  <Command.Input
                    placeholder="Cari materi, soal, modul, atau halaman..."
                    value={search}
                    onValueChange={setSearch}
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
                <Command.List className="max-h-[min(460px,calc(100dvh-13rem))] scroll-py-2 overflow-y-auto p-3 outline-none">
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
                  {trimmed && flatResults.length === 0 && !isLoading && (
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
                          {SUGGESTED_TOPICS.map((topic) => (
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

                  {/* State 2: Active Search Results */}
                  {trimmed &&
                    flatResults.length > 0 &&
                    CATEGORY_ORDER.map((cat) => {
                      const items = groupedResults?.get(cat) ?? [];
                      if (items.length === 0) return null;
                      const Icon = getCategoryIcon(cat);

                      return (
                        <Command.Group
                          key={cat}
                          heading={cat}
                          className="mt-2 first:mt-0 [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-body-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                        >
                          {items.map((doc) => (
                            <Command.Item
                              key={doc.id}
                              value={`${doc.id} ${doc.title} ${doc.subtitle} ${doc.keywords || ""}`}
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
                                  <div className="truncate font-medium text-foreground text-body-sm leading-snug group-aria-selected:text-primary-foreground">
                                    <HighlightText
                                      text={doc.title}
                                      query={trimmed}
                                    />
                                  </div>
                                  {doc.subtitle && (
                                    <div className="truncate text-body-xs text-muted-foreground leading-tight mt-0.5 group-aria-selected:text-primary-foreground/80">
                                      <HighlightText
                                        text={doc.subtitle}
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
                          ))}
                        </Command.Group>
                      );
                    })}
                </Command.List>

                {/* Footer Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/20 px-4 py-2.5 text-body-xs text-muted-foreground select-none">
                  <div className="flex items-center gap-3">
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
    </CommandMenuContext.Provider>
  );
}
