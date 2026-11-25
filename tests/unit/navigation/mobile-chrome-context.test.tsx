import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Home, BookOpen } from "lucide-react";
import {
  MobileChromeProvider,
  addHideBottomNavToken,
  createMobileChromeState,
  removeHideBottomNavToken,
  removePageSearchEntry,
  removeTopNavEntry,
  resolvePageSearchConfig,
  resolveTopNavConfig,
  upsertPageSearchEntry,
  upsertTopNavEntry,
} from "@/components/navigation/mobile-chrome-context";
import { MobileBottomNav } from "@/components/navigation/mobile-bottom-nav";
import {
  MobileTopNavSearchTrigger,
  MobileTopNavbar,
} from "@/components/navigation/mobile-top-navbar";
import { PageHeader } from "@/components/page-header";
import { computeMobileListFrameHeight } from "@/features/discussions/ui/mobile/mobile-list-layout";

describe("MobileChromeContext state management", () => {
  test("ref-counts nested hideBottomNav tokens so inner unmount does not clobber outer lock", () => {
    let state = createMobileChromeState();
    expect(state.hideBottomNavTokens).toHaveLength(0);

    // Outer immersive screen (e.g., quiz player) hides bottom nav.
    state = addHideBottomNavToken(state, "quiz-player");
    expect(state.hideBottomNavTokens).toEqual(["quiz-player"]);

    // Duplicate token acquisition is idempotent.
    state = addHideBottomNavToken(state, "quiz-player");
    expect(state.hideBottomNavTokens).toEqual(["quiz-player"]);

    // Nested modal or composer also hides bottom nav.
    state = addHideBottomNavToken(state, "composer-sheet");
    expect(state.hideBottomNavTokens).toEqual(["quiz-player", "composer-sheet"]);

    // Inner sheet unmounts: bottom nav MUST stay hidden because quiz-player is still active.
    state = removeHideBottomNavToken(state, "composer-sheet");
    expect(state.hideBottomNavTokens).toEqual(["quiz-player"]);
    expect(state.hideBottomNavTokens.length > 0).toBe(true);

    // Outer quiz player unmounts: bottom nav is restored.
    state = removeHideBottomNavToken(state, "quiz-player");
    expect(state.hideBottomNavTokens).toHaveLength(0);
  });

  test("stacks and restores declarative topNav overrides cleanly", () => {
    let state = createMobileChromeState();
    state = upsertTopNavEntry(state, "course-layout", {
      title: "Kalkulus 1",
      backHref: "/dashboard",
    });
    expect(resolveTopNavConfig(state.topNavStack)).toEqual({
      title: "Kalkulus 1",
      backHref: "/dashboard",
    });

    // Nested reader pushes a more specific title while inheriting backHref.
    state = upsertTopNavEntry(state, "material-reader", {
      title: "Bab 2: Turunan",
    });
    expect(resolveTopNavConfig(state.topNavStack)).toEqual({
      title: "Bab 2: Turunan",
      backHref: "/dashboard",
    });

    // Updating an existing entry updates in place without duplicating.
    state = upsertTopNavEntry(state, "material-reader", {
      title: "Bab 2: Aturan Rantai",
      hideTopNav: true,
    });
    expect(state.topNavStack).toHaveLength(2);
    expect(resolveTopNavConfig(state.topNavStack)).toEqual({
      title: "Bab 2: Aturan Rantai",
      backHref: "/dashboard",
      hideTopNav: true,
    });

    // Unmounting nested reader restores parent config.
    state = removeTopNavEntry(state, "material-reader");
    expect(resolveTopNavConfig(state.topNavStack)).toEqual({
      title: "Kalkulus 1",
      backHref: "/dashboard",
    });
  });

  test("renders MobileTopNavbar and MobileBottomNav with required data attributes and aria-current", () => {
    const html = renderToStaticMarkup(
      <MobileChromeProvider>
        <MobileTopNavbar title="Dashboard Siswa" backHref="/dashboard" />
        <MobileBottomNav
          items={[
            { id: "home", label: "Beranda", href: "/dashboard", icon: Home, active: true },
            { id: "courses", label: "Kelas", href: "/courses", icon: BookOpen, badgeCount: 3 },
          ]}
        />
      </MobileChromeProvider>
    );

    expect(html).toContain("data-mobile-navbar");
    expect(html).toContain("Dashboard Siswa");
    expect(html).toContain("data-mobile-bottom-nav");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Beranda");
    expect(html).toContain("Kelas");
    expect(html).toContain(">3<");
  });

  test("unmounts MobileBottomNav when hidden prop is true", () => {
    const html = renderToStaticMarkup(
      <MobileChromeProvider>
        <MobileBottomNav
          hidden
          items={[
            { id: "home", label: "Beranda", href: "/dashboard", icon: Home, active: true },
          ]}
        />
      </MobileChromeProvider>
    );

    expect(html).toBe("");
  });

  test("renders a single authoritative back button on MobileTopNavbar when onBack is provided alongside backHref", () => {
    const html = renderToStaticMarkup(
      <MobileChromeProvider>
        <MobileTopNavbar
          title="Tryout Tengah Semester"
          backHref="/tutor/calc-1"
          onBack={() => {}}
          backLabel="Kembali ke antrean"
        />
      </MobileChromeProvider>
    );

    const backButtonMatches = html.match(/data-mobile-back-button=""/g) ?? [];
    expect(backButtonMatches).toHaveLength(1);
    expect(html).toContain("<button");
    expect(html).toContain('aria-label="Kembali ke antrean"');
    expect(html).not.toContain('href="/tutor/calc-1"');
  });

  test("resolves fallbackBackHref from PageHeader without overriding screen onBack or backHref", () => {
    let state = createMobileChromeState();
    state = upsertTopNavEntry(state, "page-header", {
      fallbackBackHref: "/tutor/calc-1",
      fallbackBackLabel: "Kembali ke kelas",
    });
    expect(resolveTopNavConfig(state.topNavStack)).toEqual({
      fallbackBackHref: "/tutor/calc-1",
      fallbackBackLabel: "Kembali ke kelas",
    });

    const onBack = () => {};
    state = upsertTopNavEntry(state, "grading-review", {
      title: "Tryout 1",
      onBack,
      backLabel: "Kembali",
    });
    const resolved = resolveTopNavConfig(state.topNavStack);
    expect(resolved.onBack).toBe(onBack);
    expect(resolved.fallbackBackHref).toBe("/tutor/calc-1");

    const pageHeaderHtml = renderToStaticMarkup(
      <MobileChromeProvider>
        <PageHeader title="Penilaian Tryout" backHref="/tutor/calc-1" backLabel="Kembali" />
      </MobileChromeProvider>
    );
    expect(pageHeaderHtml).toContain("Penilaian Tryout");
    expect(pageHeaderHtml).not.toContain("<a ");
    expect(pageHeaderHtml).not.toContain("<button");
  });

  test("mobile grading and discussion workspaces delegate back navigation to MobileTopNavbar without duplicate in-page back buttons", () => {
    const repoRoot = process.cwd();
    const tryoutSource = fs.readFileSync(
      path.join(repoRoot, "features/grading/ui/mobile/tryout-grading-mobile.tsx"),
      "utf-8"
    );
    const quizSource = fs.readFileSync(
      path.join(repoRoot, "features/grading/ui/mobile/quiz-grading-mobile.tsx"),
      "utf-8"
    );
    const discussionSource = fs.readFileSync(
      path.join(repoRoot, "features/discussions/ui/mobile/discussion-workspace-mobile.tsx"),
      "utf-8"
    );

    expect(tryoutSource).toContain("useMobileTopNav(");
    expect(tryoutSource).not.toContain("ArrowLeft");

    expect(quizSource).toContain("useMobileTopNav(");
    expect(quizSource).not.toContain("ArrowLeft");

    expect(discussionSource).toContain("useMobileTopNav(");
    expect(discussionSource).toContain("showBackButton={false}");
    expect(discussionSource).toContain("showComposeBackButton={false}");
    expect(discussionSource).toContain("hideThreadHeader");
    expect(discussionSource).not.toContain("showBackButton={true}");
  });

  test("supports left-aligned subtitle and pageActions before shell rightActions on MobileTopNavbar", () => {
    const shareNode = <button type="button" data-test-share="">Bagikan</button>;
    let state = createMobileChromeState();
    state = upsertTopNavEntry(state, "thread-detail", {
      title: "Cara memilih delta",
      subtitle: "Matematika I (MA1101)",
      pageActions: shareNode,
    });
    const resolved = resolveTopNavConfig(state.topNavStack);
    expect(resolved.title).toBe("Cara memilih delta");
    expect(resolved.subtitle).toBe("Matematika I (MA1101)");
    expect(resolved.pageActions).toBe(shareNode);

    const html = renderToStaticMarkup(
      <MobileChromeProvider>
        <MobileTopNavbar
          title="Cara memilih delta"
          subtitle="Matematika I (MA1101)"
          pageActions={shareNode}
          rightActions={<button type="button" data-test-search="">Cari</button>}
        />
      </MobileChromeProvider>
    );

    expect(html).toContain("data-mobile-navbar-subtitle");
    expect(html).toContain("Matematika I (MA1101)");
    expect(html).toContain("data-mobile-navbar-page-actions");
    expect(html.indexOf("data-test-share")).toBeGreaterThan(-1);
    expect(html.indexOf("data-test-search")).toBeGreaterThan(-1);
    expect(html.indexOf("data-test-share")).toBeLessThan(html.indexOf("data-test-search"));
    expect(html).not.toContain("border-b border-border/80");
  });

  test("stacks and restores pageSearch registrations cleanly", () => {
    let state = createMobileChromeState();
    expect(resolvePageSearchConfig(state.pageSearchStack)).toBeNull();

    const onOuterChange = () => {};
    state = upsertPageSearchEntry(state, "documents-list", {
      value: "",
      onChange: onOuterChange,
      placeholder: "Cari dokumen...",
    });
    expect(resolvePageSearchConfig(state.pageSearchStack)?.placeholder).toBe(
      "Cari dokumen..."
    );

    // Updating existing entry updates in place without duplicating.
    state = upsertPageSearchEntry(state, "documents-list", {
      value: "kond",
      onChange: onOuterChange,
      placeholder: "Cari dokumen...",
    });
    expect(state.pageSearchStack).toHaveLength(1);
    expect(resolvePageSearchConfig(state.pageSearchStack)?.value).toBe("kond");

    // Nested view overrides pageSearch; unmounting restores previous entry.
    state = upsertPageSearchEntry(state, "nested-list", {
      value: "bab 2",
      onChange: () => {},
      placeholder: "Cari topik...",
    });
    expect(resolvePageSearchConfig(state.pageSearchStack)?.placeholder).toBe(
      "Cari topik..."
    );

    state = removePageSearchEntry(state, "nested-list");
    expect(resolvePageSearchConfig(state.pageSearchStack)?.value).toBe("kond");

    state = removePageSearchEntry(state, "documents-list");
    expect(resolvePageSearchConfig(state.pageSearchStack)).toBeNull();
  });

  test("renders unified MobileTopNavSearchTrigger and global vector search prompt section", () => {
    const html = renderToStaticMarkup(
      <MobileChromeProvider>
        <MobileTopNavbar
          title="Bank Soal"
          subtitle="Perpindahan Kalor"
          rightActions={<MobileTopNavSearchTrigger label="Cari" />}
        />
      </MobileChromeProvider>
    );

    expect(html).toContain("data-mobile-search-trigger");
    expect(html).toContain("data-mobile-search-bar");
    expect(html).toContain("data-mobile-global-search-section");
    expect(html).toContain("data-mobile-global-search-button");
    expect(html).toContain("Cari di seluruh Zyx");
  });

  test("computeMobileListFrameHeight clamps the mobile discussion list above MobileBottomNav even with tabs or safe-area insets", () => {
    // Portrait phone with top navbar + Questions/Reports tabs (frameTop=128) and bottom nav + safe area (top=768, height=76)
    const withTabsAndBottomNav = computeMobileListFrameHeight({
      frameTop: 128,
      viewportBottom: 844,
      bottomNavRect: { top: 768, height: 76 },
    });
    expect(withTabsAndBottomNav).toBe(640);
    expect(128 + withTabsAndBottomNav).toBe(768);

    // Software keyboard shrinks visualViewport below bottomNavRect.top
    expect(
      computeMobileListFrameHeight({
        frameTop: 128,
        viewportBottom: 460,
        bottomNavRect: { top: 768, height: 76 },
      })
    ).toBe(332);

    // Hidden bottom nav (height: 0) or absent bottom nav falls back to viewportBottom
    expect(
      computeMobileListFrameHeight({
        frameTop: 72,
        viewportBottom: 844,
        bottomNavRect: { top: 0, height: 0 },
      })
    ).toBe(772);
    expect(
      computeMobileListFrameHeight({
        frameTop: 72,
        viewportBottom: 844,
        bottomNavRect: null,
      })
    ).toBe(772);

    // A short viewport never extends the frame behind the nav
    expect(
      computeMobileListFrameHeight({
        frameTop: 220,
        viewportBottom: 320,
        bottomNavRect: { top: 260, height: 60 },
      })
    ).toBe(40);

    expect(
      computeMobileListFrameHeight({
        frameTop: 280,
        viewportBottom: 320,
        bottomNavRect: { top: 260, height: 60 },
      })
    ).toBe(0);
  });
});
