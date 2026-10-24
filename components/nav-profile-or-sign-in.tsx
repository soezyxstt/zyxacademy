"use client";

import Link from "next/link";
import { LogOut, User, LayoutDashboard, GraduationCap, ShieldCheck } from "lucide-react";
import { DropdownMenu } from "radix-ui";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { Button } from "@/components/ui/button";
import { SheetClose } from "@/components/ui/sheet";
import { signOut, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";

type NavProfileOrSignInProps = {
  variant?: "toolbar" | "sheet";
  callbackURL?: string;
  onNavigate?: () => void;
  /** Set false for contexts (e.g. admin bar) where Sign In must not appear. */
  showSignIn?: boolean;
};

export function NavProfileOrSignIn({
  variant = "toolbar",
  callbackURL = "/dashboard",
  onNavigate,
  showSignIn = true,
}: NavProfileOrSignInProps) {
  const t = useTranslations("marketing");
  const { data: session, isPending } = useSession();
  const sheet = variant === "sheet";

  if (isPending) {
    if (!showSignIn) return null;
    return (
      <div
        className={cn(
          sheet ? "bg-muted/60 h-18 w-full shrink-0 animate-pulse rounded-xl" : "",
          !sheet &&
            cn(
              "bg-muted/60 shrink-0 animate-pulse rounded-lg",
              "size-10 xl:h-10 xl:w-28"
            )
        )}
        aria-hidden
      />
    );
  }

  if (session?.user) {
    const name = session.user.name?.trim();
    const email = session.user.email;
    const label = name || email?.split("@")[0] || t("nav.account");

    if (sheet) {
      return (
        <div className="flex min-w-0 w-full flex-col gap-2">
          <SheetClose asChild>
            <Link
              href="/dashboard"
              prefetch={true}
              title={email ?? label}
              aria-label={t("nav.dashboardFor", { name: label })}
              onClick={onNavigate}
              className={cn(
                "border-border hover:bg-muted/70 flex min-h-14 min-w-0 w-full items-center gap-3 rounded-xl border bg-background px-3 py-2.5 shadow-none transition-colors",
                "outline-none focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2"
              )}
            >
              {session.user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt={label}
                  width={40}
                  height={40}
                  className="border-border size-10 shrink-0 rounded-full border object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="bg-muted border-border flex size-10 shrink-0 items-center justify-center rounded-full border">
                  <User className="text-muted-foreground size-5" aria-hidden />
                </span>
              )}
              <div className="min-w-0 flex-1 text-left">
                <p className="break-words [overflow-wrap:anywhere] font-heading text-body-base font-semibold leading-tight tracking-tight text-foreground">
                  {label}
                </p>
                {email ? (
                  <p className="text-body-sm mt-0.5 min-w-0 truncate text-muted-foreground">{email}</p>
                ) : null}
              </div>
            </Link>
          </SheetClose>
          <Button
            type="button"
            variant="outline"
            className="text-body-sm h-11 w-full justify-center gap-2 rounded-xl font-medium"
            onClick={() => {
              void (async () => {
                await signOut();
                onNavigate?.();
              })();
            }}
          >
            <LogOut className="size-4" aria-hidden />
            {t("nav.signOut")}
          </Button>
        </div>
      );
    }

    const userRole = (session.user as { role?: string | null }).role;

    return (
      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "text-foreground gap-2 rounded-lg hover:bg-muted cursor-pointer",
                "h-10 w-10 max-w-[11rem] min-w-0 shrink-0 overflow-hidden xl:w-44 xl:justify-start xl:gap-2 xl:px-2",
                "max-xl:size-10 max-xl:justify-center max-xl:border max-xl:border-border/60 max-xl:p-0 max-xl:shadow-none max-xl:hover:border-border max-xl:hover:bg-muted/80"
              )}
            >
              {session.user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt={label}
                  width={32}
                  height={32}
                  className="border-border max-xl:size-9 max-xl:border-0 shrink-0 rounded-full border object-cover xl:size-8"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="bg-muted border-border flex max-xl:size-9 shrink-0 items-center justify-center rounded-full border xl:size-8">
                  <User className="text-muted-foreground size-4" aria-hidden />
                </span>
              )}
              <span className="hidden min-w-0 flex-1 overflow-hidden text-body-sm font-medium xl:flex">
                <span className="block truncate">{label}</span>
              </span>
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              sideOffset={6}
              align="end"
              className="border-border bg-popover text-popover-foreground z-50 min-w-44 rounded-xl border p-1 shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
            >
              <DropdownMenu.Item
                asChild
                className="hover:bg-accent hover:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-body-sm outline-none"
              >
                <Link href="/profile" prefetch={true} onClick={onNavigate}>
                  <User className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span>{t("nav.profile")}</span>
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                asChild
                className="hover:bg-accent hover:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-body-sm outline-none"
              >
                <Link href="/dashboard" prefetch={true} onClick={onNavigate}>
                  <LayoutDashboard className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span>{t("nav.learningDashboard")}</span>
                </Link>
              </DropdownMenu.Item>
              {(userRole === "teacher" || userRole === "tutor" || userRole === "admin") && (
                <DropdownMenu.Item
                  asChild
                  className="hover:bg-accent hover:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-body-sm outline-none"
                >
                  <Link href="/tutor" prefetch={true} onClick={onNavigate}>
                    <GraduationCap className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span>{t("nav.tutorPanel")}</span>
                  </Link>
                </DropdownMenu.Item>
              )}
              {userRole === "admin" && (
                <DropdownMenu.Item
                  asChild
                  className="hover:bg-accent hover:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-body-sm outline-none"
                >
                  <Link href="/admin" prefetch={true} onClick={onNavigate}>
                    <ShieldCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span>{t("nav.adminPanel")}</span>
                  </Link>
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Separator className="bg-border my-1 h-px" />
              <DropdownMenu.Item
                className="hover:bg-destructive/10 text-status-error focus:bg-destructive/10 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-body-sm outline-none"
                onSelect={() => {
                  void (async () => {
                    await signOut();
                    onNavigate?.();
                  })();
                }}
              >
                <LogOut className="size-4 shrink-0" aria-hidden />
                <span>{t("nav.signOut")}</span>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    );
  }

  if (!showSignIn) return null;

  return (
    <GoogleSignInButton
      label={sheet ? t("nav.signInGoogle") : t("nav.signIn")}
      callbackURL={callbackURL}
      onBeforeOAuth={onNavigate}
      containerClassName={sheet ? "w-full" : "max-lg:hidden shrink-0"}
      className={cn(
        sheet
          ? "h-11 w-full rounded-xl bg-primary text-body-sm font-semibold text-primary-foreground hover:bg-primary/90"
          : "h-10 shrink-0 rounded-lg bg-primary px-4 text-body-sm font-semibold text-primary-foreground hover:bg-primary/90"
      )}
    />
  );
}
