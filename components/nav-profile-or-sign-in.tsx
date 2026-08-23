"use client";

import Link from "next/link";
import { Bell, LogOut, User, LayoutDashboard, GraduationCap, ShieldCheck } from "lucide-react";
import { DropdownMenu } from "radix-ui";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { Button } from "@/components/ui/button";
import { SheetClose } from "@/components/ui/sheet";
import { signOut, useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

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
              "size-10 lg:h-10 lg:w-28"
            )
        )}
        aria-hidden
      />
    );
  }

  if (session?.user) {
    const name = session.user.name?.trim();
    const email = session.user.email;
    const label = name || email?.split("@")[0] || "Akun";

    if (sheet) {
      return (
        <div className="flex w-full flex-col gap-2">
          <SheetClose asChild>
            <Link
              href="/dashboard"
              prefetch={true}
              title={email ?? label}
              aria-label={`Dashboard (${label})`}
              onClick={onNavigate}
              className={cn(
                "border-border hover:bg-muted/70 flex min-h-14 w-full items-center gap-3 rounded-xl border bg-background px-3 py-2.5 shadow-none transition-colors",
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
                <p className="font-heading text-body-base font-semibold leading-tight tracking-tight text-foreground">
                  {label}
                </p>
                {email ? (
                  <p className="text-body-sm mt-0.5 truncate text-muted-foreground">{email}</p>
                ) : null}
              </div>
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <Link
              href="/settings/notifications"
              onClick={onNavigate}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background text-body-sm font-medium text-foreground transition-colors hover:bg-muted/70"
            >
              <Bell className="size-4" aria-hidden />
              Notification preferences
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
            Keluar
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
                "h-10 max-w-[11rem] shrink-0 lg:justify-start lg:gap-2 lg:px-2",
                "max-lg:size-10 max-lg:justify-center max-lg:border max-lg:border-border/60 max-lg:p-0 max-lg:shadow-none max-lg:hover:border-border max-lg:hover:bg-muted/80"
              )}
            >
              {session.user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt={label}
                  width={32}
                  height={32}
                  className="border-border max-lg:size-9 max-lg:border-0 shrink-0 rounded-full border object-cover lg:size-8"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="bg-muted border-border flex max-lg:size-9 shrink-0 items-center justify-center rounded-full border lg:size-8">
                  <User className="text-muted-foreground size-4" aria-hidden />
                </span>
              )}
              <span className="hidden text-body-sm font-medium lg:inline">
                <span className="truncate">{label}</span>
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
                  <span>Profil</span>
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                asChild
                className="hover:bg-accent hover:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-body-sm outline-none"
              >
                <Link href="/dashboard" prefetch={true} onClick={onNavigate}>
                  <LayoutDashboard className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span>Dashboard Belajar</span>
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                asChild
                className="hover:bg-accent hover:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-body-sm outline-none"
              >
                <Link href="/settings/notifications" prefetch={true} onClick={onNavigate}>
                  <Bell className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span>Notification preferences</span>
                </Link>
              </DropdownMenu.Item>
              {(userRole === "teacher" || userRole === "admin") && (
                <DropdownMenu.Item
                  asChild
                  className="hover:bg-accent hover:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-body-sm outline-none"
                >
                  <Link href="/tutor" prefetch={true} onClick={onNavigate}>
                    <GraduationCap className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span>Panel Tutor</span>
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
                    <span>Panel Admin</span>
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
                <span>Keluar</span>
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
      label={sheet ? "Masuk dengan Google" : "Login"}
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
