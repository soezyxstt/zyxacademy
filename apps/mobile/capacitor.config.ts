import { execSync } from "node:child_process";
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

const channel = resolveChannel();
const isNightly = channel === "nightly";

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
    allowNavigation: [
      "zyxacademy.com",
      "*.zyxacademy.com",
      "zyx.academy",
      "*.zyx.academy",
      "accounts.google.com",
    ],
    errorPath: "index.html",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#ffffff",
    },
    StatusBar: {
      style: "DEFAULT",
    },
  },
  android: {
    allowMixedContent: false,
    flavor: channel,
    appendUserAgent: `ZyxMobileApp/0.1.0-alpha.1 (Capacitor; ${channel})`,
  },
  ios: {
    appendUserAgent: `ZyxMobileApp/0.1.0-alpha.1 (Capacitor; ${channel})`,
    contentInset: "automatic",
  },
};

export default config;
