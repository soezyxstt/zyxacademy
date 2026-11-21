import { execSync, spawnSync } from "node:child_process";
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
tauriArgs.push(...rest);

console.log(
  `[Zyx Desktop] Running "tauri ${command}" on channel "${channel}" (${
    channel === "nightly"
      ? "https://staging.zyxacademy.com"
      : "https://www.zyxacademy.com"
  })`,
);

const bin = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(bin, ["tauri", ...tauriArgs], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    ZYX_APP_CHANNEL: channel,
  },
});

process.exit(result.status ?? 1);
