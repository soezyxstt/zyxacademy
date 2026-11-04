"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, BookOpen, CheckSquare, FileText, History, Layers3, LayoutDashboard, Menu, MessageCircle, GraduationCap } from "lucide-react";
import { ApplicationShell } from "@/components/application-shell";
import { ApplicationPage } from "@/components/application-page";
import { SidebarShell, openMobileSidebar } from "@/components/sidebar-shell";
import { StudentNavigationItems } from "@/components/student-navigation-items";
import { StudentExperienceProvider } from "@/components/student-experience-provider";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { demoRoute, type DemoRouteView } from "@/lib/demo/routes";
import { overlayKey } from "@/lib/demo/session-overlay";
import type { DemoExperience, DemoProductSelection } from "@/app/(marketing)/demo/demo-data";
import { demoSelectionHref } from "@/lib/demo/selection";
import { DemoSession, useDemoSession } from "./demo-session";

export type DemoSummary = { snapshot: DemoExperience["snapshot"]; content: Pick<DemoExperience["content"], "course"> };
export type DemoView = "dashboard" | "courses" | "progress" | "history" | "article" | "diktat" | "flashcards" | "quiz" | "tryout" | "zyra";
const items = [{ view: "dashboard", icon: LayoutDashboard }, { view: "courses", icon: GraduationCap }, { view: "progress", icon: BarChart3 }, { view: "history", icon: History }, { view: "article", icon: BookOpen }, { view: "diktat", icon: FileText }, { view: "flashcards", icon: Layers3 }, { view: "quiz", icon: CheckSquare }, { view: "tryout", icon: GraduationCap }, { view: "zyra", icon: MessageCircle }] as const;
export function demoSignInHref(nextPath: string): string { const safe = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/dashboard"; return `/sign-in?next=${encodeURIComponent(safe)}`; }
export function DemoAuthCta({ nextPath, label }: { nextPath: string; label?: string }) { const t = useTranslations("marketing"); return <Button asChild size="sm"><Link href={demoSignInHref(nextPath)}>{label ?? t("demo.authCta")}<ArrowRight className="size-3.5" aria-hidden="true" /></Link></Button>; }
export function DemoShell({ experiences, selected, activeView, children, selection = {}, reviewScope }: { experiences: DemoSummary[]; selected: DemoSummary; activeView: DemoView; children: ReactNode; selection?: DemoProductSelection; reviewScope?: { setId: string; offset: number } }) {
  return <DemoSession key={overlayKey(selected.snapshot.courseId, selected.snapshot.revision)} courseId={selected.snapshot.courseId} revision={selected.snapshot.revision} reviewScope={reviewScope} scopes={experiences.map(({ snapshot }) => ({ courseId: snapshot.courseId, revision: snapshot.revision }))}><Shell experiences={experiences} selected={selected} activeView={activeView} selection={selection}>{children}</Shell></DemoSession>;
}
function Shell({ experiences, selected, activeView, children, selection = {} }: { experiences: DemoSummary[]; selected: DemoSummary; activeView: DemoView; children: ReactNode; selection?: DemoProductSelection }) {
  const t = useTranslations("marketing"); const studentT = useTranslations("student"); const { locale } = useAppLocale(); const { reset, record, generation, ready, overlay } = useDemoSession();
  const route = (view: string, courseId = selected.snapshot.courseId) => { const base = demoRoute(locale, view as DemoRouteView, courseId); return courseId === selected.snapshot.courseId ? demoSelectionHref(base, selection) : base; };
  const sorted = [...experiences].sort((a, b) => a.content.course.title.localeCompare(b.content.course.title));
  const sidebar = <SidebarShell collapsedKey="demo-sidebar-collapsed" logoHref={route("dashboard")} logoLabel={t("demo.navLabel")} showAccountTools={false} topSection={(collapsed) => <div className={collapsed ? "px-1 pt-3" : "px-3 pt-3"}><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size={collapsed ? "icon-sm" : "default"} aria-label={`${studentT("navigation.switchCourse")}: ${selected.content.course.title}`} className={collapsed ? "mx-auto flex" : "w-full justify-between"}>{collapsed ? <BookOpen className="size-4" /> : selected.content.course.title}</Button></DropdownMenuTrigger><DropdownMenuContent>{sorted.map((e) => <DropdownMenuItem key={e.snapshot.courseId} asChild><Link href={route(activeView, e.snapshot.courseId)}>{e.content.course.title}</Link></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu></div>} nav={(collapsed) => <nav aria-label={t("demo.navLabel")} className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4"><StudentNavigationItems collapsed={collapsed} items={items.map(({ view, icon }) => ({ href: route(view), icon, label: t(`demo.views.${view}`), active: view === activeView }))} /><div className="mt-auto">{!collapsed && <Button variant="outline" size="sm" disabled={!ready} onClick={reset}>{t("demo.session.reset")}</Button>}</div></nav>} />;
  return <StudentExperienceProvider value={{ mode: "demo", route, courseHref: (id) => route("progress", id), baseline: experiences.map((e) => e.snapshot), selectedCourseId: selected.snapshot.courseId, overlay, ready, record, reset }}><ApplicationShell showOrnaments={false} sidebar={sidebar} mobileNavigation={<div className="flex h-14 items-center gap-3 border-b px-4 md:hidden"><Button variant="outline" size="icon-sm" aria-label={t("demo.navLabel")} onClick={openMobileSidebar}><Menu className="size-4" /></Button><span className="truncate text-body-sm font-semibold">{selected.content.course.title}</span></div>}><ApplicationPage><div key={generation}>{children}</div></ApplicationPage></ApplicationShell></StudentExperienceProvider>;
}
