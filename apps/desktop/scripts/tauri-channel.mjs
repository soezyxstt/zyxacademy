import { execSync, spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

function detectGitBranch() {
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

function resolveChannel(explicitArg) {
  const candidate = (explicitArg || process.env.ZYX_APP_CHANNEL || "")
    .trim()
    .toLowerCase();
  if (candidate === "nightly" || candidate === "stable") {
    return candidate;
  }
  return detectGitBranch() === "staging" ? "nightly" : "stable";
}

const [command = "dev", channelArg = "auto", ...rest] = process.argv.slice(2);
const channel = resolveChannel(channelArg === "auto" ? "" : channelArg);

const tauriArgs = [command];
if (channel === "nightly") {
  tauriArgs.push("--config", "src-tauri/tauri.nightly.conf.json");
}

let tempOverrideConfigPath = null;
const overrideConfig = {};

const explicitVersion = process.env.ZYX_APP_VERSION?.trim().replace(/^v/i, "");
if (explicitVersion && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(explicitVersion)) {
  overrideConfig.version = explicitVersion;
}

const updaterPubkey = process.env.TAURI_UPDATER_PUBKEY?.trim();
const defaultUpdaterEndpoint =
  channel === "nightly"
    ? "https://github.com/soezyxstt/zyxacademy/releases/latest/download/latest-nightly.json"
    : "https://github.com/soezyxstt/zyxacademy/releases/latest/download/latest.json";
const updaterEndpoint =
  process.env.TAURI_UPDATER_ENDPOINT?.trim() || defaultUpdaterEndpoint;

if (updaterPubkey) {
  overrideConfig.plugins = {
    updater: {
      pubkey: updaterPubkey,
      endpoints: [updaterEndpoint],
    },
  };
  if (command === "build" && process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()) {
    overrideConfig.bundle = {
      createUpdaterArtifacts: true,
    };
  }
}

if (Object.keys(overrideConfig).length > 0) {
  tempOverrideConfigPath = join(tmpdir(), `zyx-tauri-override-${process.pid}.json`);
  writeFileSync(tempOverrideConfigPath, JSON.stringify(overrideConfig), "utf8");
  tauriArgs.push("--config", tempOverrideConfigPath);
}
tauriArgs.push(...rest);

console.log(
  `[Zyx Desktop] Running "tauri ${command}" on channel "${channel}" (${
    channel === "nightly"
      ? "https://staging.zyxacademy.com"
      : "https://www.zyxacademy.com"
  })${explicitVersion ? ` v${explicitVersion}` : ""}${
    updaterPubkey ? " [signed updater enabled]" : " [installer fallback updater]"
  }`,
);

const bin = process.platform === "win32" ? "npx.cmd" : "npx";
try {
  const result = spawnSync(bin, ["tauri", ...tauriArgs], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      ZYX_APP_CHANNEL: channel,
    },
  });
  process.exitCode = result.status ?? 1;
} finally {
  if (tempOverrideConfigPath) {
    try {
      rmSync(tempOverrideConfigPath, { force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
