"use client";

import { useEffect, useState, type ElementType, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { closeDialogsThen } from "@/hooks/use-dialog-history";
import {
  Activity,
  Archive,
  Bell,
  BookOpen,
  Calculator,
  CalendarDays,
  ChevronDown,
  Code2,
  Cpu,
  FilePen,
  FileText,
  Gauge,
  Globe,
  GraduationCap,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  Library,
  LineChart,
  Link as LinkIcon,
  ListChecks,
  Lock,
  Megaphone,
  MessageSquareText,
  MousePointerClick,
  Newspaper,
  Pin,
  PinOff,
  Shuffle,
  UserCheck,
  UserCog,
  Users,
  Video,
  Workflow,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageMenu } from "@/components/language-menu";
import { useSession } from "@/lib/auth-client";
import { useTranslations } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import {
  ADMIN_MORE_CATEGORIES,
  ADMIN_PINNED_SYNC_EVENT,
  ADMIN_SHORTCUT_BY_ID,
  isAdminSubTabActive,
  readAdminPinnedTabs,
  writeAdminPinnedTabs,
  type AdminMoreIconId,
  type AdminMoreShortcutDef,
} from "./admin-nav-model";

const ICON_MAP: Record<AdminMoreIconId, ElementType> = {
  dashboard: LayoutDashboard,
  courses: GraduationCap,
  questions: Library,
  schedules: CalendarDays,
  meet: Video,
  discussions: MessageSquareText,
  jobs: Workflow,
  distractors: Shuffle,
  users: UserCog,
  groups: Users,
  tokens: KeyRound,
  pricing: Calculator,
  notifications: Bell,
  blog: Newspaper,
  forms: FilePen,
  media: ImageIcon,
  tautan: LinkIcon,
  shortLinks: LinkIcon,
  ops: Gauge,
  tutorActivity: Activity,
  zyraAnalytics: LineChart,
  featureUsage: MousePointerClick,
  webAnalytics: Globe,
  aiModels: Cpu,
  apiKeys: Lock,
  docs: BookOpen,
  astInspector: Code2,
  pkaRegistrations: UserCheck,
  pkaAnnouncements: Megaphone,
  pkaSchedules: CalendarDays,
  pkaQuizzes: ListChecks,
  pkaMaterials: FileText,
};

export interface AdminMoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminMoreSheet({ open, onOpenChange }: AdminMoreSheetProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const tNav = useTranslations("admin.navigation");
  const tRoute = useTranslations("admin.routeTitles");
  const tMobile = useTranslations("admin.mobile");
  const tDiscussion = useTranslations("tutor.schedule");

  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [archivedOpen, setArchivedOpen] = useState(false);

  const handleNavigate = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }
    event.preventDefault();
    closeDialogsThen(() => onOpenChange(false), () => router.push(href));
  };

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    setPinnedIds(readAdminPinnedTabs(window.localStorage, userId));

    const handleSync = () => {
      setPinnedIds(readAdminPinnedTabs(window.localStorage, userId));
    };
    window.addEventListener(ADMIN_PINNED_SYNC_EVENT, handleSync);
    window.addEventListener("storage", handleSync);
    return () => {
      window.removeEventListener(ADMIN_PINNED_SYNC_EVENT, handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, [open, userId]);

  const resolveLabel = (item: AdminMoreShortcutDef): string => {
    if (item.labelSource === "discussion") {
      return tDiscussion(item.labelKey);
    }
    if (item.labelSource === "routeTitles") {
      return tRoute(item.labelKey);
    }
    if (item.labelSource === "mobile") {
      return tMobile(item.labelKey);
    }
    return tNav(item.labelKey);
  };

  const togglePin = (id: string) => {
    const next = pinnedIds.includes(id)
      ? pinnedIds.filter((entry) => entry !== id)
      : [...pinnedIds, id];
    setPinnedIds(next);
    if (typeof window !== "undefined") {
      writeAdminPinnedTabs(window.localStorage, userId, next);
      window.dispatchEvent(new CustomEvent(ADMIN_PINNED_SYNC_EVENT));
    }
  };

  const pinnedShortcuts = pinnedIds
    .map((id) => ADMIN_SHORTCUT_BY_ID[id])
    .filter((item): item is AdminMoreShortcutDef => Boolean(item));

  const renderRow = (item: AdminMoreShortcutDef) => {
    const Icon = ICON_MAP[item.icon];
    const active = isAdminSubTabActive(item, pathname);
    const isPinned = pinnedIds.includes(item.id);
    const label = resolveLabel(item);

    return (
      <div
        key={item.id}
        className="flex min-h-11 items-center gap-1"
      >
        <Link
          href={item.href}
          onClick={(event) => handleNavigate(event, item.href)}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-body-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active
              ? "bg-primary/10 text-primary"
              : "text-foreground hover:bg-muted/60"
          )}
        >
          <Icon
            className={cn(
              "size-4 shrink-0",
              active ? "text-primary" : "text-muted-foreground"
            )}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate">{label}</span>
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          onClick={() => togglePin(item.id)}
          aria-label={
            isPinned
              ? `${tMobile("unpinShortcut")}: ${label}`
              : `${tMobile("pinShortcut")}: ${label}`
          }
          aria-pressed={isPinned}
          className={cn(
            "size-11 shrink-0 rounded-xl transition-all duration-150 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
            isPinned
              ? "text-primary hover:bg-primary/10 hover:text-primary"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          )}
        >
          {isPinned ? (
            <PinOff className="size-4" aria-hidden="true" />
          ) : (
            <Pin className="size-4" aria-hidden="true" />
          )}
        </Button>
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="flex max-h-[88svh] flex-col gap-0 rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom,0px)]"
      >
        <SheetHeader className="shrink-0 border-b border-border/70 px-4 py-3.5 text-left">
          <SheetTitle className="pr-8 font-heading text-body-base font-semibold">
            {tMobile("moreSheetTitle")}
          </SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {pinnedShortcuts.length > 0 ? (
            <section aria-label={tMobile("pinned")} className="mb-4">
              <p className="mb-2 px-1 text-body-xs font-semibold text-muted-foreground">
                {tMobile("pinned")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {pinnedShortcuts.map((item) => {
                  const Icon = ICON_MAP[item.icon];
                  const active = isAdminSubTabActive(item, pathname);
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={(event) => handleNavigate(event, item.href)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-body-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-card text-foreground hover:bg-muted/60"
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden="true" />
                      <span className="max-w-[160px] truncate">
                        {resolveLabel(item)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}

          <div className="space-y-4">
            {ADMIN_MORE_CATEGORIES.map((category) => (
              <section key={category.id} aria-label={tMobile(category.titleKey)}>
                <h2 className="mb-1 px-3 text-body-xs font-semibold text-muted-foreground">
                  {tMobile(category.titleKey)}
                </h2>
                <div className="divide-y divide-border/40">
                  {category.items.map(renderRow)}
                </div>

                {category.archivedItems && category.archivedItems.length > 0 ? (
                  <div className="mt-1 border-t border-border/40 pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setArchivedOpen((prev) => !prev)}
                      aria-expanded={archivedOpen}
                      className="min-h-11 w-full rounded-xl px-3 py-2 text-left text-body-sm font-normal text-muted-foreground transition-all duration-150 hover:bg-muted/60 hover:text-foreground active:scale-[0.99] motion-reduce:transition-none [&>span]:justify-between"
                    >
                      <span className="flex items-center gap-2.5">
                        <Archive className="size-4 shrink-0" aria-hidden="true" />
                        <span>
                          {tNav("pka")} ({category.archivedItems.length})
                        </span>
                      </span>
                      <ChevronDown
                        className={cn(
                          "size-4 shrink-0 transition-transform duration-150 motion-reduce:transition-none",
                          archivedOpen && "rotate-180"
                        )}
                        aria-hidden="true"
                      />
                    </Button>
                    {archivedOpen ? (
                      <div className="divide-y divide-border/40 pl-2">
                        {category.archivedItems.map(renderRow)}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border/70 bg-muted/20 px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <Link
              href="/dashboard"
              onClick={(event) => handleNavigate(event, "/dashboard")}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-body-sm text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <GraduationCap className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>{tMobile("studentView")}</span>
            </Link>
            <Link
              href="/tutor"
              onClick={(event) => handleNavigate(event, "/tutor")}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-body-sm text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BookOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>{tMobile("tutorView")}</span>
            </Link>
          </div>
          <div className="flex items-center gap-1">
            <LanguageMenu className="size-11 rounded-xl border border-border bg-card" />
            <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-card">
              <ThemeToggle mode="navbar" />
            </div>
          </div>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
