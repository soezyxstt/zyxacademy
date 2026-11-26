"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { getAppScrollBehavior } from "@/components/appearance-preferences";
import { cn } from "@/lib/utils";
import { openMobileSidebar } from "@/components/sidebar-shell";
import { useCommandMenu } from "@/components/command-menu";
import { useTranslations } from "@/lib/i18n/client";
import { useStudentExperience } from "@/components/student-experience-provider";
import { AppUpdateControl } from "@/components/native/app-update-control";
import { getRouteTitle } from "@/components/navigation/route-title-model";

export { getRouteTitle } from "@/components/navigation/route-title-model";

export function setMobileNavTitle(title: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("zyx:set-mobile-title", { detail: title }));
  }
}

export type MobileNavbarProps = {
  surface?: "admin" | "student" | "tutor";
  className?: string;
};

function isMobileSidebarBackdrop(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement
    && target.classList.contains("fixed")
    && target.classList.contains("inset-0")
    && target.classList.contains("z-40")
    && target.classList.contains("bg-black/50")
    && target.classList.contains("md:hidden");
}

export function MobileNavbar({ surface, className }: MobileNavbarProps) {
  const actualPathname = usePathname();
  const experience = useStudentExperience();
  const pathname = experience.pathname ?? actualPathname;
  const t = useTranslations("student");
  const tAdmin = useTranslations("admin");
  const tTutor = useTranslations("tutor");
  const { setOpen: setSearchOpen } = useCommandMenu();
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const [isTitleOverflowing, setIsTitleOverflowing] = useState(false);
  const titleRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const handleSetTitle = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === "string") setCustomTitle(detail);
    };
    const handleClearTitle = () => setCustomTitle(null);

    window.addEventListener("zyx:set-mobile-title", handleSetTitle);
    window.addEventListener("zyx:clear-mobile-title", handleClearTitle);
    return () => {
      window.removeEventListener("zyx:set-mobile-title", handleSetTitle);
      window.removeEventListener("zyx:clear-mobile-title", handleClearTitle);
    };
  }, []);

  useEffect(() => {
    const handleBackdropPointerDown = (event: PointerEvent) => {
      if (!isMobileSidebarBackdrop(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
      event.target.click();
    };

    document.addEventListener("pointerdown", handleBackdropPointerDown, true);
    return () => document.removeEventListener("pointerdown", handleBackdropPointerDown, true);
  }, []);

  useEffect(() => {
    titleRef.current?.scrollTo({ left: 0 });
  }, [pathname]);

  const translateRoute = (key: string) => {
    if (key.startsWith("admin.")) return tAdmin(key.slice("admin.".length));
    if (key.startsWith("tutor.")) return tTutor(key.slice("tutor.".length));
    return t(key);
  };
  const displayTitle = customTitle || getRouteTitle(pathname, surface, translateRoute);

  useEffect(() => {
    const checkOverflow = () => {
      const title = titleRef.current;
      setIsTitleOverflowing(Boolean(title && title.scrollWidth - title.clientWidth > 1));
    };

    checkOverflow();
    window.addEventListener("resize", checkOverflow);
    return () => window.removeEventListener("resize", checkOverflow);
  }, [displayTitle]);

  const revealFullTitle = () => {
    const title = titleRef.current;
    if (!title) return;

    const maxScroll = title.scrollWidth - title.clientWidth;
    if (maxScroll <= 1) return;

    const atEnd = title.scrollLeft >= maxScroll - 1;
    title.scrollTo({
      left: atEnd ? 0 : maxScroll,
      behavior: getAppScrollBehavior(),
    });
  };

  const titleContent = (
    <span
      ref={titleRef}
      className="block min-w-0 overflow-x-hidden whitespace-nowrap font-heading text-body-sm font-semibold leading-tight tracking-tight text-foreground [text-overflow:ellipsis]"
    >
      {displayTitle}
    </span>
  );

  return (
    <header
      data-mobile-navbar=""
      className={cn(
        "sticky top-0 z-30 flex h-13 w-full max-w-full shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-border/80 bg-background/95 px-3 backdrop-blur-md md:!hidden sm:px-4",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
        <button
          type="button"
          onClick={openMobileSidebar}
          aria-label={t("mobile.openNavigation")}
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground active:scale-95"
        >
          <Menu className="size-4.5" />
        </button>

        {isTitleOverflowing ? (
          <button
            type="button"
            onClick={revealFullTitle}
            aria-label={t("mobile.showFullTitle", { title: displayTitle })}
            title={displayTitle}
            className="min-w-0 flex-1 cursor-pointer overflow-hidden text-left"
          >
            {titleContent}
          </button>
        ) : (
          <div className="min-w-0 flex-1 overflow-hidden text-left" title={displayTitle}>
            {titleContent}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <AppUpdateControl variant="mobile" />
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label={t("mobile.search")}
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground active:scale-95"
        >
          <Search className="size-4" />
        </button>
      </div>
    </header>
  );
}
