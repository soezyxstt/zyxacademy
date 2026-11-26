"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bell,
  BookOpen,
  CalendarDays,
  CalendarRange,
  ChevronsUpDown,
  GraduationCap,
  Home,
  MessageSquareText,
  MoreHorizontal,
  Search,
  SquareTerminal,
  UserRound,
  Users,
} from "lucide-react";
import { MobileChromeProvider } from "@/components/navigation/mobile-chrome-context";
import {
  MobileTopNavbar,
  MobileTopNavActionButton,
} from "@/components/navigation/mobile-top-navbar";
import {
  MobileBottomNav,
  type MobileBottomNavItem,
} from "@/components/navigation/mobile-bottom-nav";
import { StudentLeaderboardControls } from "@/components/student-leaderboard-controls";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  navigationCases,
  navigationFixture as f,
} from "@/packages/native-parity/shared-ui/navigation-cases";

// Includes actual web components and isolated compositions of web primitives.
// These anchors are not evidence of pixel or behavior equivalence.
export const navigationReferenceCases = navigationCases;
// Popovers are opened by the renderer through the actual Filter button.
export const navigationReferenceActions: Record<string, string[]> = {
  "shared-popover-filters-light": ["Filter is clicked on mount"],
  "shared-popover-long-dark": ["Filter is clicked on mount"],
};

function Bottom({ role }: { role: "student" | "tutor" | "admin" }) {
  const [active, setActive] = useState(
    role === "tutor" ? "classes" : role === "admin" ? "courses" : "home",
  );
  const [editor, setEditor] = useState(role === "admin");
  const items: MobileBottomNavItem[] =
    role === "student"
      ? [
          { id: "home", label: f.studentNavLabels.home, icon: Home },
          { id: "courses", label: f.studentNavLabels.courses, icon: BookOpen },
          {
            id: "schedule",
            label: f.studentNavLabels.schedule,
            icon: CalendarRange,
          },
          {
            id: "discuss",
            label: f.studentNavLabels.discuss,
            icon: MessageSquareText,
            badgeCount: 3,
            badgeLabel: "3 pertanyaan belum dibaca",
          },
          { id: "me", label: f.studentNavLabels.me, icon: UserRound },
        ]
      : role === "tutor"
        ? [
            { id: "home", label: f.tutorNavLabels.home, icon: Home },
            {
              id: "schedule",
              label: f.tutorNavLabels.schedule,
              icon: CalendarDays,
            },
            {
              id: "discuss",
              label: f.tutorNavLabels.discuss,
              icon: MessageSquareText,
            },
            {
              id: "classes",
              label: f.tutorNavLabels.classes,
              icon: GraduationCap,
            },
          ]
        : [
            { id: "home", label: f.adminNavLabels.home, icon: Home },
            { id: "courses", label: f.adminNavLabels.courses, icon: BookOpen },
            { id: "people", label: f.adminNavLabels.people, icon: Users },
            { id: "ops", label: f.adminNavLabels.ops, icon: SquareTerminal },
            { id: "more", label: f.adminNavLabels.more, icon: MoreHorizontal },
          ];
  const label = editor
    ? "Editor materi"
    : items.find((item) => item.id === active)?.label;
  return (
    <>
      <div className="px-4 pt-4">
        <p role="status">{label}</p>
        {editor && (
          <Button variant="outline" onClick={() => setEditor(false)}>
            Kembali
          </Button>
        )}
      </div>
      <MobileBottomNav
        hidden={editor}
        items={items.map((item) => ({
          ...item,
          active: active === item.id,
          onClick: () => setActive(item.id),
        }))}
      />
    </>
  );
}

function Leaderboard({ id, tab }: { id: string; tab: "rank" | "academic" }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (
      id === "shared-popover-filters-light" ||
      id === "shared-popover-long-dark"
    ) {
      container.current
        ?.querySelector<HTMLButtonElement>('button[aria-label^="Filter"]')
        ?.click();
    }
  }, [id]);
  return (
    <div ref={container}>
      <StudentLeaderboardControls
        tab={tab}
        period="all"
        scope="global"
        courses={[{ id: "course", title: f.tutorCourse }]}
        locale="id"
      >
        <span />
      </StudentLeaderboardControls>
    </div>
  );
}

export function NavigationReferences({ id }: { id: string }) {
  const fixture = navigationCases.find((c) => c.id === id);
  if (!fixture) return <p role="alert">Unknown navigation reference: {id}</p>;
  let content;
  if (fixture.component === "shared-dialog") {
    content = <DialogReference id={id} />;
  } else if (fixture.component === "shared-sheet") {
    content = <SheetReference id={id} />;
  } else if (fixture.component === "mobile-navbar") {
    content = (
      <MobileTopNavbar
        title={
          fixture.role === "student"
            ? "Beranda"
            : fixture.role === "tutor"
              ? ""
              : f.adminTitle
        }
        backHref={fixture.role === "admin" ? "/admin" : undefined}
        logoHref={fixture.role === "student" ? "/dashboard" : undefined}
        leftSlot={
          fixture.role === "tutor" ? (
            <Button
              variant="outline"
              className="h-9 min-w-0 max-w-full flex-1 rounded-xl border-border/60 bg-card/85 px-2.5 text-left text-body-sm font-medium text-foreground shadow-xs backdrop-blur-md [&>span]:justify-between"
              aria-label={`${f.navbarLabels["switch-course"]}: ${f.tutorCourse}`}
            >
              <span className="min-w-0 flex-1 truncate">{f.tutorCourse}</span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Button>
          ) : undefined
        }
        rightActions={
          <>
            {fixture.role === "admin" && (
              <MobileTopNavActionButton label={f.navbarLabels["ops-ai"]}>
                <SquareTerminal className="text-primary" aria-hidden="true" />
              </MobileTopNavActionButton>
            )}
            <MobileTopNavActionButton label={f.navbarLabels.search}>
              <Search />
            </MobileTopNavActionButton>
            <MobileTopNavActionButton label={f.navbarLabels.notifications}>
              <Bell />
            </MobileTopNavActionButton>
            {fixture.role !== "student" && (
              <MobileTopNavActionButton label={f.navbarLabels.account}>
                <UserRound />
              </MobileTopNavActionButton>
            )}
          </>
        }
      />
    );
  } else if (fixture.component === "bottom-navigation") {
    content = <Bottom role={fixture.role} />;
  } else if (
    fixture.component === "navigation-tabs" &&
    fixture.active === "progress"
  ) {
    content = (
      <Tabs defaultValue="progress" syncUrl={false}>
        <TabsList>
          {f.courseTabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    );
  } else {
    const tab =
      (fixture.component === "navigation-tabs" &&
        fixture.active === "academic") ||
      id === "shared-popover-long-dark"
        ? "academic"
        : "rank";
    content = <Leaderboard id={id} tab={tab} />;
  }
  return <MobileChromeProvider>{content}</MobileChromeProvider>;
}

// The overlay primitives are real web components; their inner content is a
// local fixture. MaterialViewer and the schedule caller own additional state.
function DialogReference({ id }: { id: string }) {
  const [open, setOpen] = useState(id !== "shared-dialog-closed-light");
  const [reason, setReason] = useState(
    id === "shared-dialog-long-dark" ? f.dialog.longReason : "",
  );
  const [error, setError] = useState(id === "shared-dialog-validation-light");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{f.dialog.trigger}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{f.dialog.title}</DialogTitle>
          <DialogDescription>{f.dialog.description}</DialogDescription>
        </DialogHeader>
        <label htmlFor="parity-reason">{f.dialog.field}</label>
        <Textarea
          id="parity-reason"
          value={reason}
          placeholder={f.dialog.placeholder}
          onChange={(e) => {
            setReason(e.target.value);
            setError(false);
          }}
        />
        {error && (
          <p role="alert" className="text-body-xs text-destructive">
            {f.dialog.error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {f.dialog.cancel}
          </Button>
          <Button
            onClick={() => (reason.trim() ? setOpen(false) : setError(true))}
          >
            {f.dialog.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SheetReference({ id }: { id: string }) {
  const [open, setOpen] = useState(id !== "shared-sheet-closed-light");
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline">{f.sheet.title}</Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{f.sheet.title}</SheetTitle>
        </SheetHeader>
        <div className="overflow-y-auto px-4 pb-4">
          {(id === "shared-sheet-outline-light"
            ? f.sheet.chapters.slice(0, 3)
            : f.sheet.chapters
          ).map((chapter, index) => (
            <button
              type="button"
              className="block w-full border-b border-border py-3 text-left text-body-sm"
              key={chapter}
              onClick={() => setOpen(false)}
            >
              {index + 1}. {chapter}
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
