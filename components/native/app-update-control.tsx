"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { sendDesktopNativeNotification } from "@/lib/native/notifications";
import { isNativeApp } from "@/lib/native/runtime";
import {
  checkLatestAppRelease,
  checkTauriNativeUpdater,
  getInstalledAppMeta,
  installAppUpdate,
  resolveUpdateCheckOutcome,
  type InstalledAppMeta,
  type LatestAppRelease,
} from "@/lib/native/updates";
import { cn } from "@/lib/utils";

const INITIAL_CHECK_DELAY_MS = 5_000;
const PERIODIC_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const RESUME_CHECK_MIN_GAP_MS = 30 * 60 * 1000; // 30 minutes
const SEEN_UPDATE_TAG_KEY = "zyx_seen_update_tag";

type CheckStatus =
  | "idle"
  | "checking"
  | "update_available"
  | "up_to_date"
  | "no_release"
  | "error";

interface AppUpdateState {
  supported: boolean;
  meta: InstalledAppMeta | null;
  latest: LatestAppRelease | null;
  checkStatus: CheckStatus;
  updateAvailable: boolean;
  nativeUpdaterReady: boolean;
  checking: boolean;
  downloading: boolean;
  restarting: boolean;
  progress: number | null;
  error: string | null;
  permissionHint: boolean;
}

let state: AppUpdateState = {
  supported: false,
  meta: null,
  latest: null,
  checkStatus: "idle",
  updateAvailable: false,
  nativeUpdaterReady: false,
  checking: false,
  downloading: false,
  restarting: false,
  progress: null,
  error: null,
  permissionHint: false,
};

let initialized = false;
let lastCheckedAt = 0;
let checkPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setState(patch: Partial<AppUpdateState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AppUpdateState {
  return state;
}

async function triggerInstall() {
  if (!state.meta || !state.latest || state.downloading || state.restarting) return;
  setState({
    downloading: true,
    restarting: false,
    progress: 0,
    error: null,
    permissionHint: false,
  });
  const outcome = await installAppUpdate(
    state.meta,
    state.latest,
    (percent) => {
      setState({ progress: percent });
    },
    { preferNativeUpdater: state.nativeUpdaterReady },
  );

  if (outcome.status === "restarting") {
    setState({
      downloading: false,
      restarting: true,
      progress: 100,
      error: null,
    });
    return;
  }

  if (outcome.status === "permission_required") {
    setState({
      downloading: false,
      progress: null,
      permissionHint: true,
      error: "Izinkan pemasangan aplikasi dari Zyx Academy di setelan, lalu tekan Perbarui lagi.",
    });
    return;
  }

  if (outcome.status === "error") {
    setState({
      downloading: false,
      progress: null,
      error: "Gagal mengunduh pembaruan. Coba lagi saat koneksi stabil.",
    });
    return;
  }

  setState({ downloading: false, progress: 100, error: null });
}

async function checkForUpdates(options?: { manual?: boolean }) {
  if (typeof window === "undefined" || !isNativeApp()) return;
  if (checkPromise) return checkPromise;

  checkPromise = (async () => {
    setState({ checking: true, checkStatus: "checking", error: null });
    try {
      const meta = state.meta ?? (await getInstalledAppMeta());
      if (!meta) {
        setState({ supported: false, checking: false, checkStatus: "idle" });
        return;
      }

      const [releaseResult, nativeUpdater] = await Promise.all([
        checkLatestAppRelease(meta.channel),
        meta.runtime === "tauri"
          ? checkTauriNativeUpdater()
          : Promise.resolve({ status: "unconfigured" as const }),
      ]);

      lastCheckedAt = Date.now();
      const outcome = resolveUpdateCheckOutcome(meta, releaseResult, nativeUpdater);

      if (outcome.status === "error") {
        const message = "Gagal memeriksa pembaruan. Periksa koneksi lalu coba lagi.";
        setState({
          supported: true,
          meta,
          latest: null,
          checkStatus: "error",
          updateAvailable: false,
          nativeUpdaterReady: false,
          checking: false,
          error: message,
        });
        if (options?.manual) {
          toast.error("Gagal memeriksa pembaruan", {
            description: "Periksa koneksi lalu coba lagi.",
          });
        }
        return;
      }

      if (outcome.status === "no_release") {
        setState({
          supported: true,
          meta,
          latest: null,
          checkStatus: "no_release",
          updateAvailable: false,
          nativeUpdaterReady: false,
          checking: false,
          error: null,
        });
        if (options?.manual) {
          toast("Belum ada rilis untuk kanal ini");
        }
        return;
      }

      if (outcome.status === "update_available") {
        const latest = outcome.latest;
        setState({
          supported: true,
          meta,
          latest,
          checkStatus: "update_available",
          updateAvailable: true,
          nativeUpdaterReady: outcome.nativeUpdaterReady,
          checking: false,
          error: null,
        });

        const lastSeenTag = (() => {
          try {
            return localStorage.getItem(SEEN_UPDATE_TAG_KEY);
          } catch {
            return null;
          }
        })();

        if (!options?.manual && lastSeenTag !== latest.tag) {
          try {
            localStorage.setItem(SEEN_UPDATE_TAG_KEY, latest.tag);
          } catch {
            // Ignore storage errors
          }
          const label = `v${latest.version}`;
          toast("Pembaruan aplikasi tersedia", {
            description: `Zyx Academy ${label} siap dipasang.`,
            action: {
              label: "Perbarui",
              onClick: () => {
                void triggerInstall();
              },
            },
          });
          if (meta.runtime === "tauri") {
            void sendDesktopNativeNotification(
              "Pembaruan Zyx Academy tersedia",
              `Versi ${label} siap dipasang.`,
            );
          }
        }
        return;
      }

      setState({
        supported: true,
        meta,
        latest: outcome.latest,
        checkStatus: "up_to_date",
        updateAvailable: false,
        nativeUpdaterReady: false,
        checking: false,
        error: null,
      });
      if (options?.manual) {
        toast("Aplikasi sudah versi terbaru");
      }
    } catch {
      const message = "Gagal memeriksa pembaruan. Periksa koneksi lalu coba lagi.";
      setState({
        checking: false,
        checkStatus: "error",
        updateAvailable: false,
        error: message,
      });
      if (options?.manual) {
        toast.error("Gagal memeriksa pembaruan", {
          description: "Periksa koneksi lalu coba lagi.",
        });
      }
    } finally {
      checkPromise = null;
    }
  })();

  return checkPromise;
}

function ensureUpdaterStarted() {
  if (initialized || typeof window === "undefined") return;
  if (!isNativeApp()) return;
  initialized = true;
  setState({ supported: true });

  window.setTimeout(() => {
    void checkForUpdates();
  }, INITIAL_CHECK_DELAY_MS);

  window.setInterval(() => {
    if (document.visibilityState === "visible") {
      void checkForUpdates();
    }
  }, PERIODIC_CHECK_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    if (
      document.visibilityState === "visible" &&
      Date.now() - lastCheckedAt >= RESUME_CHECK_MIN_GAP_MS
    ) {
      void checkForUpdates();
    }
  });
}

interface AppUpdateControlProps {
  variant: "sidebar" | "mobile";
}

export function AppUpdateControl({ variant }: AppUpdateControlProps) {
  const [open, setOpen] = useState(false);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    ensureUpdaterStarted();
  }, []);

  if (!snapshot.supported) return null;
  // On mobile top navbar, stay completely invisible unless an update is ready.
  if (variant === "mobile" && !snapshot.updateAvailable) return null;

  const currentLabel = snapshot.meta?.version ?? "";
  const latestLabel = snapshot.latest?.version ?? "";

  const statusHeading = (() => {
    if (snapshot.restarting) return "Memasang pembaruan";
    switch (snapshot.checkStatus) {
      case "update_available":
        return "Pembaruan tersedia";
      case "up_to_date":
        return "Aplikasi terbaru";
      case "no_release":
        return "Belum ada rilis";
      case "error":
        return "Gagal memeriksa pembaruan";
      case "checking":
        return "Memeriksa pembaruan...";
      default:
        return "Pembaruan aplikasi";
    }
  })();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            snapshot.updateAvailable
              ? "Pembaruan aplikasi tersedia"
              : snapshot.checkStatus === "error"
                ? "Gagal memeriksa pembaruan aplikasi"
                : "Status pembaruan aplikasi"
          }
          title={
            snapshot.updateAvailable
              ? "Pembaruan tersedia"
              : snapshot.checkStatus === "error"
                ? "Gagal memeriksa pembaruan"
                : "Periksa pembaruan"
          }
          className={cn(
            "relative flex shrink-0 cursor-pointer items-center justify-center transition-colors",
            variant === "mobile"
              ? "size-9 rounded-xl border border-border bg-card text-foreground shadow-xs hover:bg-muted active:scale-95"
              : "size-7 rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground",
          )}
        >
          {snapshot.downloading || snapshot.restarting ? (
            <Loader2 className="size-4 animate-spin text-primary" />
          ) : (
            <ArrowDownToLine
              className={cn(
                "size-4",
                snapshot.updateAvailable && "text-primary",
                snapshot.checkStatus === "error" && "text-destructive",
              )}
            />
          )}
          {snapshot.updateAvailable && !snapshot.downloading && !snapshot.restarting && (
            <span
              aria-hidden="true"
              className="absolute top-1 right-1 size-2 rounded-full bg-primary ring-2 ring-background"
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <p className="font-heading text-body-sm font-semibold text-foreground">
              {statusHeading}
            </p>
            <p className="text-body-xs text-muted-foreground">
              {snapshot.meta?.channel === "nightly" ? "Nightly" : "Stable"}
              {currentLabel ? ` · ${currentLabel}` : ""}
            </p>
          </div>
          {snapshot.checkStatus === "up_to_date" && !snapshot.restarting && (
            <CheckCircle2 className="size-4 shrink-0 text-status-success" />
          )}
          {snapshot.checkStatus === "error" && !snapshot.restarting && (
            <AlertCircle className="size-4 shrink-0 text-destructive" />
          )}
        </div>

        {snapshot.updateAvailable && latestLabel && (
          <p className="text-body-xs text-foreground">
            Versi baru: <span className="font-semibold">{latestLabel}</span>
          </p>
        )}

        {snapshot.checkStatus === "no_release" && (
          <p className="text-body-xs text-muted-foreground">
            Belum ada paket rilis untuk kanal ini.
          </p>
        )}

        {snapshot.downloading && (
          <div className="space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-150"
                style={{ width: `${snapshot.progress ?? 10}%` }}
              />
            </div>
            <p className="text-body-xs text-muted-foreground">
              Mengunduh pembaruan{snapshot.progress !== null ? ` (${snapshot.progress}%)` : "..."}
            </p>
          </div>
        )}

        {snapshot.restarting && (
          <p className="text-body-xs text-muted-foreground">
            Memasang pembaruan dan memulai ulang aplikasi...
          </p>
        )}

        {snapshot.error && (
          <p role="alert" className="text-body-xs text-destructive">
            {snapshot.error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={snapshot.checking || snapshot.downloading || snapshot.restarting}
            onClick={() => void checkForUpdates({ manual: true })}
          >
            <RefreshCw className={cn("size-3.5", snapshot.checking && "animate-spin")} />
            {snapshot.checkStatus === "error" ? "Coba lagi" : "Periksa"}
          </Button>
          {snapshot.updateAvailable && (
            <Button
              type="button"
              size="sm"
              disabled={snapshot.downloading || snapshot.restarting}
              onClick={() => void triggerInstall()}
            >
              {snapshot.restarting
                ? "Memulai ulang..."
                : snapshot.downloading
                  ? "Mengunduh..."
                  : "Perbarui"}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
