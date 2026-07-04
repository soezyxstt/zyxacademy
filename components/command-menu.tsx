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
  FileText,
  GraduationCap,
  FolderSearch,
  Home,
  Layers,
  Search,
} from "lucide-react";
import { getSiteSearchDocuments, getSiteSearchShortcutIds } from "@/lib/site-search-index";
import { groupOrderIndex } from "@/lib/site-search";
import type { SiteSearchDocument } from "@/lib/site-search-index";
import { cn } from "@/lib/utils";
import { getStudentSearchDocuments } from "@/app/(student)/dashboard/search-actions";
import Fuse from "fuse.js";

type CommandMenuContextValue = {
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

function groupIcon(group: SiteSearchDocument["group"]) {
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
      return Layers;
  }
}

export function CommandMenuProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [modKeyHint, setModKeyHint] = useState("Ctrl + K");
  
  // Local state for search documents (seeded with static defaults, updated on mount)
  const [docs, setDocs] = useState<SiteSearchDocument[]>(() => getSiteSearchDocuments());

  useEffect(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    setModKeyHint(/Mac|iPhone|iPod|iPad/i.test(ua) ? "⌘K" : "Ctrl + K");
  }, []);

  useEffect(() => {
    // Run student-specific search query on mount and cache it locally
    getStudentSearchDocuments().then(setDocs).catch(console.error);
  }, []);

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

  // Client-cached Fuse instance
  const fuse = useMemo(() => {
    return new Fuse(docs, {
      keys: [
        { name: "title", weight: 0.42 },
        { name: "keywords", weight: 0.18 },
        { name: "content", weight: 0.32 },
        { name: "subtitle", weight: 0.12 },
        { name: "href", weight: 0.06 },
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

  // Search execution using local Fuse.js
  const flatResults = useMemo(() => {
    if (!trimmed || !fuse) return [];
    return fuse.search(trimmed, { limit: 48 }).map((r) => r.item);
  }, [trimmed, fuse]);

  // Group search hits
  const grouped = useMemo(() => {
    if (!trimmed) return null;
    const map = new Map<SiteSearchDocument["group"], SiteSearchDocument[]>();
    for (const doc of flatResults) {
      const arr = map.get(doc.group) ?? [];
      arr.push(doc);
      map.set(doc.group, arr);
    }
    return map;
  }, [trimmed, flatResults]);

  const orderedGroups = useMemo(() => {
    if (!grouped) return [];
    return [...grouped.keys()].sort((a, b) => groupOrderIndex(a) - groupOrderIndex(b));
  }, [grouped]);

  const navigate = useCallback(
    (href: string) => {
      router.push(href);
      setOpen(false);
      setSearch("");
    },
    [router],
  );

  return (
    <CommandMenuContext.Provider value={{ setOpen }}>
      {children}

      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
      >
        <Dialog.Portal>
          {/* Overlay */}
          <Dialog.Overlay
            className={cn(
              "fixed inset-0 z-[200] bg-black/45",
              "supports-backdrop-filter:backdrop-blur-xs",
              "data-[state=open]:animate-in data-[state=open]:fade-in-0",
              "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
            )}
          />

          {/* Centering wrapper */}
          <div className="fixed inset-0 z-[201] flex items-start justify-center p-4 md:p-10 pointer-events-none overflow-y-auto">
            <Dialog.Content
              aria-label="Pencarian situs"
              className={cn(
                "pointer-events-auto relative mt-[12vh] md:mt-[16vh] w-full max-w-xl overflow-hidden rounded-xl border border-border bg-popover shadow-lg outline-none",
                "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
                "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
              )}
            >
            <Dialog.Title className="sr-only">Pencarian situs</Dialog.Title>
            <Dialog.Description className="sr-only">
              Cari halaman, course, materi, soal, dan topik di Zyx Academy.
            </Dialog.Description>
            <Command
              shouldFilter={false}
              vimBindings={false}
              className="w-full flex flex-col"
            >
              <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
                <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <Command.Input
                  placeholder="Cari halaman, course, materi, soal, topik..."
                  value={search}
                  onValueChange={setSearch}
                  className="placeholder:text-muted-foreground flex h-10 w-full bg-transparent text-body-sm outline-none"
                />
                <kbd className="bg-muted text-muted-foreground pointer-events-none hidden shrink-0 select-none rounded border border-border px-1.5 py-0.5 font-mono text-[11px] sm:inline-block">
                  {modKeyHint}
                </kbd>
              </div>
              <Command.List className="max-h-[min(420px,calc(100dvh-10rem))] scroll-py-1 overflow-y-auto p-2 outline-none [&_[cmdk-list-sizer]]:min-h-[120px]">
                {!trimmed && (
                  <Command.Group
                    heading="Akses cepat"
                    className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                  >
                    {shortcutDocs.map((doc) => {
                      const Icon = groupIcon(doc.group);
                      return (
                        <Command.Item
                          key={doc.id}
                          value={doc.id}
                          keywords={[doc.keywords, doc.title, doc.href].filter(Boolean)}
                          onSelect={() => navigate(doc.href)}
                          className="aria-selected:bg-muted/90 flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-body-sm outline-none"
                        >
                          <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                          <div className="min-w-0 flex-1 flex flex-col">
                            <span className="truncate font-medium text-foreground">{doc.title}</span>
                            <span className="truncate text-body-sm text-muted-foreground">{doc.subtitle}</span>
                          </div>
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                )}


                {trimmed && flatResults.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                    <FolderSearch className="text-muted-foreground size-8 opacity-70" aria-hidden />
                    <span className="text-body-sm font-medium text-foreground">Tidak ada hasil</span>
                    <span className="max-w-[26ch] text-body-sm text-muted-foreground">
                      Coba kata lain, ejaan lebih pendek, atau istilah bahasa Inggris/Indonesia (mis. limit,
                      turunan, vektor).
                    </span>
                  </div>
                )}

                {trimmed &&
                  orderedGroups.map((g) => {
                    const items = grouped!.get(g) ?? [];
                    if (items.length === 0) return null;
                    const Icon = groupIcon(g);
                    return (
                      <Command.Group
                        key={g}
                        heading={g}
                        className="mt-2 first:mt-0 [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-2 [&_[cmdk-group-heading]]:pt-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                      >
                        {items.map((doc) => (
                          <Command.Item
                            key={doc.id}
                            value={doc.id}
                            keywords={[doc.keywords, doc.content, doc.title, doc.href].filter(Boolean)}
                            onSelect={() => navigate(doc.href)}
                            className="aria-selected:bg-muted/90 flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 text-body-sm outline-none"
                          >
                            <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                            <div className="min-w-0 flex-1 flex flex-col">
                              <span className="truncate font-medium text-foreground">{doc.title}</span>
                              <span className="line-clamp-2 text-body-sm text-muted-foreground">{doc.subtitle}</span>
                            </div>
                          </Command.Item>
                        ))}
                      </Command.Group>
                    );
                  })}
              </Command.List>
              <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
                Pencarian fuzzy berbobot pada judul, isi materi &amp; teks soal.{" "}
                <span className="text-foreground/80">Enter</span> untuk membuka.
              </p>
            </Command>
          </Dialog.Content>
        </div>
        </Dialog.Portal>
      </Dialog.Root>
    </CommandMenuContext.Provider>
  );
}
