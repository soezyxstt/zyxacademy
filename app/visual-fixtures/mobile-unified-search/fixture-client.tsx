"use client";

import { useMemo, useState } from "react";
import { BookOpen, ChevronRight, SlidersHorizontal } from "lucide-react";
import {
  MobileChromeProvider,
  MobileTopNavActionButton,
  MobileTopNavSearchTrigger,
  MobileTopNavbar,
} from "@/components/navigation";
import { CommandMenuProvider, useCommandMenu } from "@/components/command-menu";
import { SearchBar } from "@/components/ui/search-bar";
import { Button } from "@/components/ui/button";

const TOPICS = [
  {
    id: "1",
    title: "Konduksi kalor pada dinding",
    course: "Perpindahan Kalor",
    count: 5,
  },
  {
    id: "2",
    title: "Hambatan termal gabungan",
    course: "Perpindahan Kalor",
    count: 8,
  },
  {
    id: "3",
    title: "Konveksi paksa pada pipa",
    course: "Perpindahan Kalor",
    count: 6,
  },
  {
    id: "4",
    title: "Radiasi antarpermukaan",
    course: "Perpindahan Kalor",
    count: 4,
  },
  {
    id: "5",
    title: "Konduksi tak tunak",
    course: "Perpindahan Kalor",
    count: 7,
  },
];

function FixtureInner() {
  const [query, setQuery] = useState("");
  const { setOpen, openWithQuery } = useCommandMenu();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TOPICS;
    return TOPICS.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.course.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <MobileChromeProvider hasTopNav>
      <div className="min-h-dvh bg-background text-foreground">
        <MobileTopNavbar
          title="Bank Soal"
          subtitle="Perpindahan Kalor"
          onOpenGlobalSearch={(q) =>
            q && openWithQuery ? openWithQuery(q) : setOpen(true)
          }
          rightActions={
            <>
              <MobileTopNavSearchTrigger label="Cari" />
              <MobileTopNavActionButton label="Filter">
                <SlidersHorizontal className="size-4" aria-hidden="true" />
              </MobileTopNavActionButton>
            </>
          }
        />

        <main className="mx-auto max-w-xl px-4 pb-10 pt-3">
          {/* Delegated automatically to MobileTopNavbar on mobile */}
          <SearchBar
            value={query}
            onSearch={setQuery}
            placeholder="Cari soal di halaman ini..."
            aria-label="Cari soal di halaman ini"
          />

          <div className="mb-2 flex items-center justify-between border-b border-border/50 pb-2.5">
            <span className="font-heading text-body-sm font-semibold text-foreground">
              {filtered.length} topik soal
            </span>
            <span className="text-body-xs text-muted-foreground">Urutkan</span>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <p className="text-body-sm text-muted-foreground">
                Tidak ada topik yang cocok.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setQuery("")}
              >
                Hapus pencarian
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {filtered.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 py-3.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <BookOpen
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <div className="truncate font-heading text-body-sm font-semibold text-foreground">
                        {item.title}
                      </div>
                      <div className="truncate text-body-xs text-muted-foreground">
                        {item.course} · {item.count} soal
                      </div>
                    </div>
                  </div>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground/60"
                    aria-hidden="true"
                  />
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    </MobileChromeProvider>
  );
}

export function MobileUnifiedSearchFixtureClient() {
  return (
    <CommandMenuProvider>
      <FixtureInner />
    </CommandMenuProvider>
  );
}
