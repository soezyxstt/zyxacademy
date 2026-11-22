"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, Eye, EyeOff, GraduationCap, LayoutDashboard, Loader2, LogOut, MoreHorizontal, Settings, ShieldCheck, SlidersHorizontal, UserRoundMinus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { useStudentExperience } from "@/components/student-experience-provider";
import type { StudentAccountState } from "@/components/student-account-boundary";
import { useZyraPetVisibility } from "@/hooks/use-zyra-pet-visibility";
import { useTranslations } from "@/lib/i18n/client";
import { signOut } from "@/lib/auth-client";
import { isLocalAccountTransitionPending } from "@/lib/auth/account-transition-state";
import { AccountSwitchError, listSavedAccounts, MAX_SAVED_ACCOUNTS, removeSavedAccount, startWebAccountSignIn, switchSavedAccount, type SavedAccount } from "@/lib/auth/account-switch";
import { NativeGoogleSignInError, startNativeGoogleSignIn } from "@/lib/native/auth";
import { queryKeys } from "@/lib/query/keys";
import { cn } from "@/lib/utils";
import { GoogleMark } from "./google-mark";

const actionClass = "flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-body-sm text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

function AccountAvatar({ user }: { user: { name: string; image?: string | null } }) {
  return (
    <Avatar>
      <AvatarImage src={user.image || undefined} alt="" referrerPolicy="no-referrer" />
      <AvatarFallback>{user.name.trim().charAt(0).toUpperCase() || "?"}</AvatarFallback>
    </Avatar>
  );
}

export function SidebarAccountMenu({ collapsed, session }: { collapsed: boolean; session: NonNullable<StudentAccountState["data"]> }) {
  const t = useTranslations("common");
  const a = useTranslations("common.accounts");
  const experience = useStudentExperience();
  const { visible: petVisible, toggleVisible: togglePetVisibility } = useZyraPetVisibility();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [browserRecovery, setBrowserRecovery] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<SavedAccount | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(false);
  const demo = experience.mode === "demo";
  const href = experience.href ?? ((path: string) => path);
  const user = { ...session.user, name: session.user.name.trim() || t("userFallback") };
  const roles = session.user.roles ?? [];
  const isAdmin = session.user.role === "admin" || roles.includes("admin");
  const isTutor = ["tutor", "teacher"].includes(session.user.role ?? "") || roles.some(role => role === "tutor" || role === "teacher");
  const accountsQuery = useQuery({
    queryKey: queryKeys.auth.savedAccounts(user.id),
    queryFn: ({ signal }) => listSavedAccounts(signal),
    enabled: open && !demo,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const accounts = accountsQuery.isError ? [] : accountsQuery.data ?? [];
  const otherAccounts = accounts.filter(account => account.user.id !== user.id);
  const atLimit = accounts.length >= MAX_SAVED_ACCOUNTS;

  const describeError = (failure: unknown, fallback: string) => {
    if (!(failure instanceof AccountSwitchError)) return a(fallback);
    switch (failure.code) {
      case "CANCELLED": return null;
      case "BUSY": return a("busy");
      case "PENDING_CHANGES": return a("pendingChanges");
      case "OFFLINE": return a("offline");
      case "SESSION_EXPIRED": return a("expired");
      case "ACCOUNT_UNAVAILABLE": return a("unavailable");
      case "SESSION_LIMIT": return a("limit", { count: MAX_SAVED_ACCOUNTS });
      default: return a(fallback);
    }
  };

  const begin = (action: string) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(action);
    setError(null);
    setBrowserRecovery(false);
    return true;
  };
  const finish = () => {
    busyRef.current = false;
    setBusy(null);
  };
  const switchAccount = async (account: SavedAccount) => {
    if (!begin(account.user.id)) return;
    try {
      await switchSavedAccount(account);
      window.location.assign(new URL("/dashboard", window.location.origin).href);
    } catch (failure) {
      if (isLocalAccountTransitionPending()) return;
      setError(describeError(failure, "switchFailed"));
      finish();
      void accountsQuery.refetch();
    }
  };
  const addAccount = async (preferBrowser = false) => {
    if (!begin("add")) return;
    try {
      const handled = await startNativeGoogleSignIn("/dashboard", {
        onBrowserClosed: finish,
        onPickerCancelled: () => setBrowserRecovery(true),
        preferBrowser,
      });
      if (!handled) await startWebAccountSignIn("/dashboard");
    } catch (failure) {
      if (isLocalAccountTransitionPending()) return;
      const recoverInBrowser = failure instanceof NativeGoogleSignInError;
      setBrowserRecovery(recoverInBrowser);
      setError(recoverInBrowser ? a("nativeUnavailable") : describeError(failure, "addFailed"));
      finish();
    }
  };
  const removeAccount = async () => {
    if (!removeTarget || !begin("remove")) return;
    try {
      await removeSavedAccount(removeTarget);
      setRemoveTarget(null);
      await accountsQuery.refetch();
      setOpen(true);
    } catch (failure) {
      setError(describeError(failure, "removeFailed"));
      setRemoveTarget(null);
      setOpen(true);
      void accountsQuery.refetch();
    } finally {
      finish();
    }
  };
  const logout = async () => {
    if (!begin("logout")) return;
    if (demo) {
      experience.reset?.();
      window.location.assign(new URL(href("/dashboard"), window.location.origin).href);
      return;
    }
    try {
      const result = await signOut();
      if (result.error) throw new Error("sign-out-failed");
      window.location.assign(new URL("/", window.location.origin).href);
    } catch {
      setError(a("signOutFailed"));
      finish();
    }
  };

  return (
    <>
      <Popover modal open={open} onOpenChange={next => { if (!busyRef.current) { setOpen(next); if (next) { setError(null); setBrowserRecovery(false); } } }}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  ref={triggerRef}
                  type="button"
                  aria-label={t("accountNamed", { name: user.name })}
                  className={cn("group flex w-full shrink-0 cursor-pointer items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", collapsed && "mx-auto size-10 justify-center p-1")}
                >
                  <AccountAvatar user={user} />
                  {!collapsed && <>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-body-xs font-semibold text-foreground">{user.name}</span>
                      <span className="block truncate text-body-xs text-muted-foreground">{user.email}</span>
                    </span>
                    <Settings className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden="true" />
                  </>}
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            {collapsed && !open && <TooltipContent side="right">{t("accountNamed", { name: user.name })}</TooltipContent>}
          </Tooltip>
        </TooltipProvider>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          aria-label={a("menu")}
          onEscapeKeyDown={event => { if (busyRef.current) event.preventDefault(); }}
          onInteractOutside={event => { if (busyRef.current) event.preventDefault(); }}
          className="w-80 max-w-[calc(100vw-24px)] max-h-(--radix-popover-content-available-height) overflow-y-auto rounded-xl p-1.5 shadow-xl motion-reduce:animate-none"
        >
          <div role="group" aria-label={a("saved")} className="space-y-0.5">
            <div className="flex min-h-14 items-center gap-2.5 rounded-lg bg-muted/60 px-2.5 py-2" aria-label={a("activeNamed", { name: user.name })}>
              <AccountAvatar user={user} />
              <span className="min-w-0 flex-1">
                <span className="block break-words text-body-sm font-medium">{user.name}</span>
                <span className="block break-all text-body-xs text-muted-foreground">{user.email}</span>
              </span>
              <Check className="size-4 shrink-0 text-foreground" aria-hidden="true" />
              <span className="sr-only">{a("active")}</span>
            </div>
            {otherAccounts.map(account => <div key={account.user.id} className="flex items-center gap-0.5 rounded-lg hover:bg-muted/50">
              <button
                type="button"
                className={cn(actionClass, "min-h-14 min-w-0 flex-1")}
                disabled={busy !== null}
                aria-label={a("switchNamed", { email: account.user.email })}
                onClick={() => void switchAccount(account)}
              >
                <AccountAvatar user={account.user} />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-body-sm font-medium">{account.user.name || t("userFallback")}</span>
                  <span className="block break-all text-body-xs text-muted-foreground">{account.user.email}</span>
                </span>
                {busy === account.user.id && <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />}
              </button>
              <DropdownMenu modal={false}>
                <TooltipProvider><Tooltip><TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-lg" disabled={busy !== null} aria-label={a("manageNamed", { email: account.user.email })} className="mr-1 shrink-0 text-muted-foreground">
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger><TooltipContent>{a("manage")}</TooltipContent></Tooltip></TooltipProvider>
                <DropdownMenuContent side="right" align="start" collisionPadding={12} className="motion-reduce:animate-none">
                  <DropdownMenuItem className="min-h-10 text-body-sm text-destructive" onSelect={() => { setRemoveTarget(account); setOpen(false); }}>
                    <UserRoundMinus className="size-4" aria-hidden="true" />{a("remove")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>)}
          </div>
          {!demo && <>
            {accountsQuery.isPending && <p role="status" className="flex items-center gap-2 px-2.5 py-2 text-body-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" aria-hidden="true" />{a("loading")}</p>}
            {accountsQuery.isError && <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
              <p role="alert" className="text-body-xs text-destructive">{a("loadFailed")}</p>
              <Button variant="ghost" size="sm" onClick={() => void accountsQuery.refetch()}>{a("retry")}</Button>
            </div>}
            <button type="button" className={actionClass} onClick={() => void addAccount()} disabled={busy !== null || atLimit || accountsQuery.isPending || accountsQuery.isError}>
              {busy === "add" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <GoogleMark />}
              <span>{a("add")}</span>
            </button>
            {atLimit && <p className="px-2.5 pb-2 text-body-xs text-muted-foreground">{a("limit", { count: MAX_SAVED_ACCOUNTS })}</p>}
          </>}
          {error && <p role="alert" className="px-2.5 py-2 text-body-xs text-destructive">{error}</p>}
          {browserRecovery && (
            <button type="button" className={actionClass} disabled={busy !== null} onClick={() => void addAccount(true)}>
              <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>{a("browserFallback")}</span>
            </button>
          )}
          {busy && busy !== "add" && busy !== "remove" && <p role="status" className="sr-only">{busy === "logout" ? a("signingOut") : a("switching")}</p>}
          <div className="my-1.5 h-px bg-border/70" />
          <div inert={busy !== null}>
            <Link href={href("/settings")} onClick={() => setOpen(false)} className={actionClass}><SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden="true" />{t("preferences")}</Link>
            <Link href={href("/dashboard")} onClick={() => setOpen(false)} className={actionClass}><LayoutDashboard className="size-4 text-muted-foreground" aria-hidden="true" />{t("studentDashboard")}</Link>
            {(isTutor || isAdmin) && <Link href={href("/tutor")} onClick={() => setOpen(false)} className={actionClass}><GraduationCap className="size-4 text-muted-foreground" aria-hidden="true" />{t("tutorPanel")}</Link>}
            {isAdmin && <Link href={href("/admin")} onClick={() => setOpen(false)} className={actionClass}><ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />{t("adminPanel")}</Link>}
            <button type="button" onClick={togglePetVisibility} className={actionClass}>
              {petVisible ? <EyeOff className="size-4 text-muted-foreground" aria-hidden="true" /> : <Eye className="size-4 text-muted-foreground" aria-hidden="true" />}
              {t(petVisible ? "hideZyra" : "showZyra")}
            </button>
          </div>
          <div className="my-1.5 h-px bg-border/70" />
          <button type="button" onClick={() => void logout()} disabled={busy !== null} className={cn(actionClass, "text-destructive hover:bg-destructive/10")}>
            {busy === "logout" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <LogOut className="size-4" aria-hidden="true" />}
            {demo ? t("logOut") : a("signOutAll")}
          </button>
        </PopoverContent>
      </Popover>
      <AdminConfirmDialog
        open={removeTarget !== null}
        onOpenChange={next => { if (!next && busy !== "remove") setRemoveTarget(null); }}
        onCloseAutoFocus={event => { event.preventDefault(); if (!open) triggerRef.current?.focus(); }}
        title={a("removeTitle")}
        description={a("removeDescription", { email: removeTarget?.user.email ?? "" })}
        confirmLabel={a("remove")}
        cancelLabel={a("cancel")}
        icon={UserRoundMinus}
        loading={busy === "remove"}
        onConfirm={() => void removeAccount()}
      />
    </>
  );
}
