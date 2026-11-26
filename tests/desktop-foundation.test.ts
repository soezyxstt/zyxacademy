import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkLatestAppRelease,
  checkTauriNativeUpdater,
  installAppUpdate,
  resolveUpdateCheckOutcome,
  selectLatestUpdaterManifestUrl,
  type InstalledAppMeta,
  type LatestAppRelease,
} from "@/lib/native/updates";
import {
  buildUpdaterManifest,
  manifestFileNameForChannel,
} from "../apps/desktop/scripts/generate-updater-manifest.mjs";

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

  test("overrides cached release version when signed native updater reports a newer version", () => {
    const outcome = resolveUpdateCheckOutcome(
      INSTALLED_META,
      { status: "ok", release: { ...SAMPLE_RELEASE, version: "0.2.0", buildId: "b1" } },
      { status: "update_available", version: "0.2.1", notes: "Hotfix" },
    );
    expect(outcome.status).toBe("update_available");
    if (outcome.status === "update_available") {
      expect(outcome.nativeUpdaterReady).toBe(true);
      expect(outcome.latest.version).toBe("0.2.1");
      expect(outcome.latest.buildId).toBeNull();
    }
  });
});

describe("Tauri v2 updater manifest generation and channel selection", () => {
  test("selects latest channel manifest asset including GitHub prereleases", () => {
    const releases = [
      {
        tag_name: "app-v0.2.0",
        draft: false,
        published_at: "2026-11-21T10:00:00Z",
        html_url: "https://github.com/soezyxstt/zyxacademy/releases/tag/app-v0.2.0",
        assets: [
          {
            name: "latest.json",
            browser_download_url:
              "https://github.com/soezyxstt/zyxacademy/releases/download/app-v0.2.0/latest.json",
          },
        ],
      },
      {
        tag_name: "app-v0.2.0-alpha.5-nightly.20261121.abc1234",
        draft: false,
        published_at: "2026-11-21T12:00:00Z",
        html_url:
          "https://github.com/soezyxstt/zyxacademy/releases/tag/app-v0.2.0-alpha.5-nightly.20261121.abc1234",
        assets: [
          {
            name: "latest-nightly.json",
            browser_download_url:
              "https://github.com/soezyxstt/zyxacademy/releases/download/app-v0.2.0-alpha.5-nightly.20261121.abc1234/latest-nightly.json",
          },
        ],
      },
    ];

    expect(selectLatestUpdaterManifestUrl(releases, "nightly")).toBe(
      "https://github.com/soezyxstt/zyxacademy/releases/download/app-v0.2.0-alpha.5-nightly.20261121.abc1234/latest-nightly.json",
    );
    expect(selectLatestUpdaterManifestUrl(releases, "stable")).toBe(
      "https://github.com/soezyxstt/zyxacademy/releases/download/app-v0.2.0/latest.json",
    );
  });

  test("builds Tauri v2 manifest for signed desktop artifacts and skips unsigned builds", () => {
    expect(manifestFileNameForChannel("nightly")).toBe("latest-nightly.json");
    expect(manifestFileNameForChannel("stable")).toBe("latest.json");

    const dir = mkdtempSync(join(tmpdir(), "zyx-updater-manifest-"));
    try {
      writeFileSync(join(dir, "zyx-windows-x64.exe"), "binary");
      expect(
        buildUpdaterManifest({
          version: "0.2.0",
          notes: "Release",
          tag: "app-v0.2.0",
          artifactsDir: dir,
        }),
      ).toBeNull();

      writeFileSync(join(dir, "zyx-windows-x64.exe.sig"), "WIN_SIG_DATA\n");
      writeFileSync(join(dir, "zyx-macos-aarch64.app.tar.gz"), "binary");
      writeFileSync(join(dir, "zyx-macos-aarch64.app.tar.gz.sig"), "MAC_SIG_DATA\n");
      writeFileSync(join(dir, "zyx-linux-x64.AppImage"), "binary");
      writeFileSync(join(dir, "zyx-linux-x64.AppImage.sig"), "LINUX_SIG_DATA\n");
      writeFileSync(join(dir, "zyx-linux-x64.deb"), "binary");
      writeFileSync(join(dir, "zyx-linux-x64.deb.sig"), "DEB_SIG_DATA\n");

      const manifest = buildUpdaterManifest({
        version: "v0.2.0-alpha.5",
        notes: "Nightly build",
        pubDate: "2026-11-21T12:00:00Z",
        tag: "app-v0.2.0-alpha.5-nightly.20261121.abc1234",
        artifactsDir: dir,
      });

      expect(manifest).toEqual({
        version: "0.2.0-alpha.5",
        notes: "Nightly build",
        pub_date: "2026-11-21T12:00:00Z",
        platforms: {
          "windows-x86_64": {
            signature: "WIN_SIG_DATA",
            url: "https://github.com/soezyxstt/zyxacademy/releases/download/app-v0.2.0-alpha.5-nightly.20261121.abc1234/zyx-windows-x64.exe",
          },
          "darwin-aarch64": {
            signature: "MAC_SIG_DATA",
            url: "https://github.com/soezyxstt/zyxacademy/releases/download/app-v0.2.0-alpha.5-nightly.20261121.abc1234/zyx-macos-aarch64.app.tar.gz",
          },
          "linux-x86_64": {
            signature: "LINUX_SIG_DATA",
            url: "https://github.com/soezyxstt/zyxacademy/releases/download/app-v0.2.0-alpha.5-nightly.20261121.abc1234/zyx-linux-x64.AppImage",
          },
          "linux-x86_64-deb": {
            signature: "DEB_SIG_DATA",
            url: "https://github.com/soezyxstt/zyxacademy/releases/download/app-v0.2.0-alpha.5-nightly.20261121.abc1234/zyx-linux-x64.deb",
          },
        },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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

  test("uses the AppImage asset and reports restart for a Nightly AppImage", async () => {
    const invoked: unknown[] = [];
    globalThis.window = {
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: {
          invoke: async (command: string, args: unknown) => {
            invoked.push({ command, args });
            return "restarting";
          },
        },
      },
    } as unknown as Window & typeof globalThis;

    const release = { ...SAMPLE_RELEASE, channel: "nightly" as const };
    const meta: InstalledAppMeta = {
      runtime: "tauri",
      channel: "nightly",
      version: "0.1.0",
      buildId: null,
      platform: "linux",
      appImage: true,
    };
    expect(await installAppUpdate(meta, release)).toEqual({ status: "restarting" });
    expect(invoked).toEqual([{
      command: "download_and_launch_update",
      args: { url: release.downloads.linuxAppImage },
    }]);
  });

  test("returns the verified download path for manual AppImage replacement", async () => {
    const path = "/tmp/Zyx Academy.AppImage";
    globalThis.window = {
      __TAURI_INTERNALS__: {},
      __TAURI__: {
        core: {
          invoke: async () => {
            throw `APPIMAGE_MANUAL_REPLACE:${path}`;
          },
        },
      },
    } as unknown as Window & typeof globalThis;

    const release = { ...SAMPLE_RELEASE, channel: "nightly" as const };
    const meta = { ...INSTALLED_META, channel: "nightly", platform: "linux", appImage: true } as const;
    expect(await installAppUpdate(meta, release)).toEqual({ status: "manual_appimage_replace", path });
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

  test("registers single-instance and updater plugins without unused remote capabilities", () => {
    const cargoToml = readFileSync(join(DESKTOP_TAURI_DIR, "Cargo.toml"), "utf8");
    expect(cargoToml).toContain("tauri-plugin-single-instance");
    expect(cargoToml).toContain("tauri-plugin-updater");
    expect(cargoToml).not.toContain("tauri-plugin-process");

    const capabilities = JSON.parse(
      readFileSync(join(DESKTOP_TAURI_DIR, "capabilities", "default.json"), "utf8"),
    ) as { permissions: string[] };
    expect(capabilities.permissions).not.toContain("updater:default");
    expect(capabilities.permissions).not.toContain("process:default");

    const libRs = readFileSync(join(DESKTOP_TAURI_DIR, "src", "lib.rs"), "utf8");
    expect(libRs).toContain("if has_updater_config(app.handle())");
    expect(libRs).not.toContain("tauri_plugin_process");
    expect(libRs).toContain("window_state::flush_window_state(&restart_handle);");
    expect(libRs).toContain("is_channel_release_asset");
    expect(libRs).toContain("update_delta::download_installer");

    const updateDeltaRs = readFileSync(
      join(DESKTOP_TAURI_DIR, "src", "update_delta.rs"),
      "utf8",
    );
    expect(updateDeltaRs).toContain("verify_minisign");

    const windowStateRs = readFileSync(
      join(DESKTOP_TAURI_DIR, "src", "window_state.rs"),
      "utf8",
    );
    const setPosIdx = windowStateRs.indexOf("window.set_position(");
    const setSizeIdx = windowStateRs.indexOf("window.set_size(");
    expect(setPosIdx).toBeGreaterThan(-1);
    expect(setSizeIdx).toBeGreaterThan(setPosIdx);
    expect(windowStateRs).toContain("monitor.work_area()");
  });

  test("desktop startup uses minimal splash and fast static edge probe before revealing offline shell", () => {
    const html = readFileSync(join(process.cwd(), "apps", "desktop", "dist", "index.html"), "utf8");
    expect(html).toContain('id="startup-splash"');
    expect(html).toContain('id="offline-shell" class="offline-shell hidden"');
    expect(html).toContain("/brand/zyx-favicon-32.png");
    expect(html).not.toContain("/api/auth/get-session");
  });

  test("notification icons across Android and web push include circular borders", () => {
    const root = process.cwd();
    const androidIcon = readFileSync(
      join(root, "apps", "mobile", "android", "app", "src", "main", "res", "drawable", "ic_stat_zyx.xml"),
      "utf8",
    );
    expect(androidIcon).toContain('android:strokeColor="#FFFFFFFF"');
    expect(androidIcon).toContain("A196,196");

    const sendTs = readFileSync(join(root, "lib", "notifications", "send.ts"), "utf8");
    expect(sendTs).toContain('icon: "/brand/zyx-notif-icon-192.png"');
    expect(sendTs).toContain('badge: "/brand/zyx-notif-badge-96.png"');

    const swJs = readFileSync(join(root, "public", "firebase-messaging-sw.js"), "utf8");
    expect(swJs).toContain("/brand/zyx-notif-icon-192.png");
    expect(swJs).toContain("/brand/zyx-notif-badge-96.png");

    expect(readFileSync(join(root, "public", "brand", "zyx-notif-icon-192.png")).length).toBeGreaterThan(1000);
    expect(readFileSync(join(root, "public", "brand", "zyx-notif-badge-96.png")).length).toBeGreaterThan(500);
  });
});
