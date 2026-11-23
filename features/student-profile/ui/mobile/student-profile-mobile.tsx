"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  GraduationCap,
  LogOut,
  Medal,
  MessageSquarePlus,
  MessageSquareText,
  PawPrint,
  Pencil,
  Settings,
  ShieldCheck,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ProfileHero } from "@/components/gamification/profile-hero";
import { SidebarAccountMenu } from "@/components/auth/sidebar-account-menu";
import { StudentAccountBoundary } from "@/components/student-account-boundary";
import { useStudentExperience } from "@/components/student-experience-provider";
import { MICRO } from "@/lib/gamification/catalog";
import { signOut } from "@/lib/auth-client";
import { useTranslations } from "@/lib/i18n/client";
import type { StudentProfileMobileHubProps } from "@/features/student-profile/model/types";

interface HubTileItem {
  id: string;
  href: string;
  label: string;
  icon: typeof Users;
}

export function StudentProfileMobile({
  locale,
  pageTitle,
  editLabel,
  editHref,
  name,
  image,
  frameId,
  themeId,
  title,
  zyraAvatarId,
  suitId,
  actionId,
  academicInfo,
  rank,
  baseXpMicro,
  bonusXpMicro,
  lpBalance,
  role,
  roles = [],
}: StudentProfileMobileHubProps) {
  const tStudent = useTranslations("student");
  const tCommon = useTranslations("common");
  const experience = useStudentExperience();
  const href = experience.href ?? ((path: string) => path);
  const demo = experience.mode === "demo";

  const [signingOut, setSigningOut] = useState(false);

  const isAdmin = role === "admin" || roles.includes("admin");
  const isTutor =
    role === "tutor" ||
    role === "teacher" ||
    roles.some((item) => item === "tutor" || item === "teacher");
  const showPet = demo || !role || role === "student";

  const hubItems: HubTileItem[] = [
    {
      id: "groups",
      href: href("/dashboard/groups"),
      label: tStudent("navigation.groups"),
      icon: Users,
    },
    {
      id: "achievements",
      href: href("/achievements"),
      label: tStudent("navigation.achievements"),
      icon: Trophy,
    },
    {
      id: "leaderboard",
      href: href("/leaderboard"),
      label: tStudent("navigation.leaderboard"),
      icon: Medal,
    },
    ...(showPet
      ? [
          {
            id: "pet",
            href: href("/pet"),
            label: "Pet",
            icon: PawPrint,
          },
        ]
      : []),
    {
      id: "calendar",
      href: href("/calendar"),
      label: tStudent("mobile.calendar"),
      icon: CalendarDays,
    },
    {
      id: "reflections",
      href: href("/profile/reflections"),
      label: tStudent("profile.reflections"),
      icon: MessageSquareText,
    },
    {
      id: "feedback",
      href: href("/feedback"),
      label: tStudent("mobile.feedback"),
      icon: MessageSquarePlus,
    },
    {
      id: "settings",
      href: href("/settings"),
      label: tStudent("mobile.settings"),
      icon: Settings,
    },
    ...(isTutor || isAdmin
      ? [
          {
            id: "tutor",
            href: href("/tutor"),
            label: tCommon("tutorPanel"),
            icon: GraduationCap,
          },
        ]
      : []),
    ...(isAdmin
      ? [
          {
            id: "admin",
            href: href("/admin"),
            label: tCommon("adminPanel"),
            icon: ShieldCheck,
          },
        ]
      : []),
  ];

  const hasXpDetails =
    typeof baseXpMicro === "number" &&
    typeof bonusXpMicro === "number" &&
    typeof lpBalance === "number";

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    if (demo) {
      experience.reset?.();
      window.location.assign(
        new URL(href("/dashboard"), window.location.origin).href
      );
      return;
    }
    try {
      const result = await signOut();
      if (result.error) throw new Error("sign-out-failed");
      window.location.assign(new URL("/", window.location.origin).href);
    } catch {
      setSigningOut(false);
    }
  };

  return (
    <ApplicationPage maxWidth="7xl" spacing="space-y-4">
      <PageHeader title={pageTitle} icon={UserRound} />

      <ProfileHero
        name={name}
        image={image}
        frameId={frameId}
        themeId={themeId}
        title={title}
        zyraAvatarId={zyraAvatarId}
        suitId={suitId}
        actionId={actionId}
        academicInfo={academicInfo}
        rank={rank}
        details={
          hasXpDetails ? (
            <span className="inline-flex flex-wrap justify-center gap-x-3 gap-y-1 text-body-xs">
              <span>
                {new Intl.NumberFormat(locale).format(
                  (baseXpMicro + bonusXpMicro) / MICRO
                )}{" "}
                XP
              </span>
              <span>{new Intl.NumberFormat(locale).format(lpBalance)} LP</span>
            </span>
          ) : undefined
        }
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={href(editHref)}>
              <Pencil className="size-3.5" aria-hidden="true" />
              <span>{editLabel}</span>
            </Link>
          </Button>
        }
      />

      <nav aria-label={pageTitle} className="grid grid-cols-2 gap-2.5">
        {hubItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              className="flex min-h-14 items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-body-sm font-medium text-foreground transition-colors hover:bg-muted/60 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 leading-tight line-clamp-2">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <section
        aria-label={tStudent("mobile.accountSection")}
        className="space-y-2 border-t border-border pt-3"
      >
        <StudentAccountBoundary>
          {({ data }) =>
            data?.user ? (
              <div className="rounded-xl border border-border bg-card">
                <SidebarAccountMenu collapsed={false} session={data} />
              </div>
            ) : null
          }
        </StudentAccountBoundary>

        <Button
          type="button"
          variant="outline"
          onClick={() => void handleSignOut()}
          isLoading={signingOut}
          className="min-h-11 w-full rounded-xl border-border bg-card px-3 py-2 text-body-sm font-medium text-destructive transition-all duration-150 hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          <LogOut className="size-4" aria-hidden="true" />
          <span>{tCommon("logOut")}</span>
        </Button>
      </section>
    </ApplicationPage>
  );
}
