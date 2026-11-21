import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkLatestAppRelease,
  checkTauriNativeUpdater,
  installAppUpdate,
  resolveUpdateCheckOutcome,
  type InstalledAppMeta,
  type LatestAppRelease,
} from "@/lib/native/updates";

const DESKTOP_TAURI_DIR = join(process.cwd(), "apps", "desktop", "src-tauri");

const SAMPLE_RELEASE: LatestAppRelease = {
  channel: "stable",
  tag: "app-v0.2.0",
  version: "0.2.0",
  buildId: null,
  publishedAt: "2026-11-21T10:00:00Z",
  releaseUrl: "https://github.com/soezyxstt/zyxacademy/releases/tag/app-v0.2.0",
  downloads: {
    android: "https://github.com/soezyxstt/zyxacademy/releases/download/app-v0.2.0/zyx.apk",
    windows: "https://github.com/soezyxstt/zyxacademy/releases/download/app-v0.2.0/zyx.exe",
    macos: "https://github.com/soezyxstt/zyxacademy/releases/download/app-v0.2.0/zyx.dmg",
    linuxDeb: "https://github.com/soezyxstt/zyxacademy/releases/download/app-v0.2.0/zyx.deb",
    linuxAppImage: "https://github.com/soezyxstt/zyxacademy/releases/download/app-v0.2.0/zyx.AppImage",
  },
};

const INSTALLED_META: InstalledAppMeta = {
  runtime: "tauri",
  channel: "stable",
  version: "0.1.0-alpha.1",
  buildId: "b0",
  platform: "windows",
};

describe("desktop update check status distinction", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("distinguishes HTTP error, network error, no release, and ok release", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ release: null, error: "github_http_503" }), {
        status: 503,
      })) as unknown as typeof fetch;
    expect(await checkLatestAppRelease("stable")).toEqual({
      status: "error",
      message: "HTTP 503",
      httpStatus: 503,
    });

    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    expect(await checkLatestAppRelease("stable")).toEqual({
      status: "error",
      message: "ECONNREFUSED",
    });

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ release: null }), { status: 200 })) as unknown as typeof fetch;
    expect(await checkLatestAppRelease("stable")).toEqual({
      status: "no_release",
    });

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ release: SAMPLE_RELEASE }), {
        status: 200,
      })) as unknown as typeof fetch;
    expect(await checkLatestAppRelease("stable")).toEqual({
      status: "ok",
      release: SAMPLE_RELEASE,
    });
  });

  test("never reports failed or empty release check as up_to_date", () => {
    const errorOutcome = resolveUpdateCheckOutcome(INSTALLED_META, {
      status: "error",
      message: "HTTP 503",
      httpStatus: 503,
    });
    expect(errorOutcome.status).toBe("error");

    const noReleaseOutcome = resolveUpdateCheckOutcome(INSTALLED_META, {
      status: "no_release",
    });
    expect(noReleaseOutcome.status).toBe("no_release");

    const updateAvailable = resolveUpdateCheckOutcome(INSTALLED_META, {
      status: "ok",
      release: SAMPLE_RELEASE,
    });
    expect(updateAvailable).toEqual({
      status: "update_available",
      latest: SAMPLE_RELEASE,
      nativeUpdaterReady: false,
    });

    const upToDate = resolveUpdateCheckOutcome(
      { channel: "stable", version: "0.2.0", buildId: null },
      { status: "ok", release: SAMPLE_RELEASE },
    );
    expect(upToDate).toEqual({
      status: "up_to_date",
      latest: SAMPLE_RELEASE,
    });
  });

  test("prioritizes signed native Tauri updater when configured", () => {
    const outcome = resolveUpdateCheckOutcome(
      INSTALLED_META,
      { status: "error", message: "HTTP 503", httpStatus: 503 },
      { status: "update_available", version: "0.2.0", notes: "Bug fixes" },
    );
    expect(outcome.status).toBe("update_available");
    if (outcome.status === "update_available") {
      expect(outcome.nativeUpdaterReady).toBe(true);
      expect(outcome.latest.version).toBe("0.2.0");
    }

    const upToDateViaNative = resolveUpdateCheckOutcome(
      INSTALLED_META,
      { status: "error", message: "HTTP 503", httpStatus: 503 },
      { status: "up_to_date" },
    );
    expect(upToDateViaNative.status).toBe("up_to_date");
  });
});

describe("Tauri native updater bridge and graceful fallback", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  test("reports unconfigured when native updater pubkey is not set or command is absent", async () => {
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      __TAURI__: {
        core: {
          invoke: async (cmd: string) => {
            if (cmd === "check_native_updater") {
              return { configured: false, updateAvailable: false, version: null, notes: null };
            }
            return null;
          },
        },
      },
    };
    expect(await checkTauriNativeUpdater()).toEqual({ status: "unconfigured" });

    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      __TAURI__: {
        core: {
          invoke: async () => {
            throw new Error("Command check_native_updater not found");
          },
        },
      },
    };
    expect(await checkTauriNativeUpdater()).toEqual({ status: "unconfigured" });
  });

  test("returns restarting when signed native updater installs update", async () => {
    const invoked: string[] = [];
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      __TAURI__: {
        core: {
          invoke: async (cmd: string) => {
            invoked.push(cmd);
            if (cmd === "install_native_update") return "restarting";
            return null;
          },
        },
      },
    };

    const outcome = await installAppUpdate(INSTALLED_META, SAMPLE_RELEASE, undefined, {
      preferNativeUpdater: true,
    });
    expect(outcome).toEqual({ status: "restarting" });
    expect(invoked).toEqual(["install_native_update"]);
  });

  test("falls back to installer download when native updater is unconfigured", async () => {
    const invoked: string[] = [];
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      __TAURI__: {
        core: {
          invoke: async (cmd: string) => {
            invoked.push(cmd);
            if (cmd === "install_native_update") {
              throw new Error("NATIVE_UPDATER_UNCONFIGURED");
            }
            if (cmd === "download_and_launch_update") return "/tmp/zyx.exe";
            return null;
          },
        },
      },
    };

    const outcome = await installAppUpdate(INSTALLED_META, SAMPLE_RELEASE, undefined, {
      preferNativeUpdater: true,
    });
    expect(outcome).toEqual({ status: "started" });
    expect(invoked).toEqual(["install_native_update", "download_and_launch_update"]);
  });

  test("surfaces signature or download errors from signed native updater without silent bypass", async () => {
    const invoked: string[] = [];
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      __TAURI__: {
        core: {
          invoke: async (cmd: string) => {
            invoked.push(cmd);
            if (cmd === "install_native_update") {
              throw new Error("Failed to install update: invalid signature");
            }
            return null;
          },
        },
      },
    };

    const outcome = await installAppUpdate(INSTALLED_META, SAMPLE_RELEASE, undefined, {
      preferNativeUpdater: true,
    });
    expect(outcome).toEqual({
      status: "error",
      message: "Failed to install update: invalid signature",
    });
    expect(invoked).toEqual(["install_native_update"]);
  });
});

describe("desktop Tauri configuration invariants", () => {
  test("configures comfortable side-by-side minimum window size for stable and nightly", () => {
    for (const file of ["tauri.conf.json", "tauri.nightly.conf.json"]) {
      const conf = JSON.parse(readFileSync(join(DESKTOP_TAURI_DIR, file), "utf8")) as {
        app: { windows: Array<{ minWidth: number; minHeight: number }> };
      };
      const mainWindow = conf.app.windows[0];
      expect(mainWindow.minWidth).toBeLessThanOrEqual(520);
      expect(mainWindow.minWidth).toBeGreaterThanOrEqual(400);
      expect(mainWindow.minHeight).toBeLessThanOrEqual(600);
      expect(mainWindow.minHeight).toBeGreaterThanOrEqual(480);
    }
  });

  test("registers single-instance, updater, and process plugins in Cargo.toml and capabilities", () => {
    const cargoToml = readFileSync(join(DESKTOP_TAURI_DIR, "Cargo.toml"), "utf8");
    expect(cargoToml).toContain("tauri-plugin-single-instance");
    expect(cargoToml).toContain("tauri-plugin-updater");
    expect(cargoToml).toContain("tauri-plugin-process");

    const capabilities = JSON.parse(
      readFileSync(join(DESKTOP_TAURI_DIR, "capabilities", "default.json"), "utf8"),
    ) as { permissions: string[] };
    expect(capabilities.permissions).toContain("updater:default");
    expect(capabilities.permissions).toContain("process:default");

    const libRs = readFileSync(join(DESKTOP_TAURI_DIR, "src", "lib.rs"), "utf8");
    expect(libRs).toContain("if has_updater_config(app.handle())");
    expect(libRs).not.toContain(
      ".plugin(tauri_plugin_process::init())\n        .plugin(tauri_plugin_updater::Builder::new().build())",
    );
  });
});
