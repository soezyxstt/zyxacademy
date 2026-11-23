import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CapacitorConfig } from "@capacitor/cli";

type AppChannel = "nightly" | "stable";

function detectGitBranch(): string {
  const envBranch =
    process.env.GITHUB_REF_NAME ||
    process.env.VERCEL_GIT_COMMIT_REF ||
    process.env.GIT_BRANCH;
  if (envBranch) return envBranch.trim();

  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

function resolveChannel(): AppChannel {
  const explicit = process.env.ZYX_APP_CHANNEL?.trim().toLowerCase();
  if (explicit === "nightly" || explicit === "stable") {
    return explicit;
  }
  const branch = detectGitBranch();
  if (branch === "staging") {
    return "nightly";
  }
  return "stable";
}

function detectBuildId(): string {
  const explicit = process.env.ZYX_APP_BUILD_ID?.trim();
  if (explicit) return explicit;
  const sha = process.env.GITHUB_SHA?.trim();
  if (sha) return sha.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

function detectAppVersion(): string {
  const explicit = process.env.ZYX_APP_VERSION?.trim().replace(/^v/i, "");
  if (explicit) return explicit;
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      version?: string;
    };
    if (pkg.version?.trim()) return pkg.version.trim();
  } catch {
    // Fallback below
  }
  return "0.1.0-alpha.2";
}

const channel = resolveChannel();
const isNightly = channel === "nightly";
const buildId = detectBuildId();
const appVersion = detectAppVersion();

const defaultServerUrl = isNightly
  ? "https://staging.zyxacademy.com"
  : "https://www.zyxacademy.com";

const serverUrl = process.env.ZYX_MOBILE_SERVER_URL?.trim() || defaultServerUrl;

const config: CapacitorConfig = {
  appId: isNightly ? "com.zyx.academy.nightly" : "com.zyx.academy",
  appName: isNightly ? "Zyx Academy Nightly" : "Zyx Academy",
  webDir: "www",
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith("http://"),
    allowNavigation: isNightly
      ? ["staging.zyxacademy.com", "accounts.google.com"]
      : ["www.zyxacademy.com", "zyxacademy.com", "zyx.academy", "accounts.google.com"],
    errorPath: "index.html",
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_zyx",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#ffffff",
    },
    StatusBar: {
      overlaysWebView: true,
      style: "DEFAULT",
    },
  },
  android: {
    allowMixedContent: false,
    adjustMarginsForEdgeToEdge: "disable",
    flavor: channel,
    appendUserAgent: `ZyxMobileApp/${appVersion} (Capacitor; ${channel}; build=${buildId})`,
  },
  ios: {
    appendUserAgent: `ZyxMobileApp/${appVersion} (Capacitor; ${channel}; build=${buildId})`,
    contentInset: "automatic",
  },
};

export default config;
