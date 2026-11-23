import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_REPO = "soezyxstt/zyxacademy";

const NIGHTLY_DEB = {
  target: "linux-x86_64-deb",
  pairs: [{ assetExt: ".deb", sigExt: ".deb.sig" }],
};

const PLATFORM_CANDIDATES = [
  {
    target: "windows-x86_64",
    pairs: [
      { assetExt: ".exe", sigExt: ".exe.sig" },
      { assetExt: ".nsis.zip", sigExt: ".nsis.zip.sig" },
    ],
  },
  {
    target: "darwin-aarch64",
    pairs: [{ assetExt: ".app.tar.gz", sigExt: ".app.tar.gz.sig" }],
  },
  {
    target: "linux-x86_64",
    pairs: [
      { assetExt: ".AppImage", sigExt: ".AppImage.sig" },
      { assetExt: ".AppImage.tar.gz", sigExt: ".AppImage.tar.gz.sig" },
    ],
  },
];

export function manifestFileNameForChannel(channel) {
  return channel === "nightly" ? "latest-nightly.json" : "latest.json";
}

export function buildUpdaterManifest({
  version,
  notes,
  pubDate = new Date().toISOString(),
  tag,
  repo = DEFAULT_REPO,
  artifactsDir,
}) {
  const files = readdirSync(artifactsDir).sort();
  const fileSet = new Set(files);
  const platforms = {};

  const candidates = /-nightly\.\d{8}\.[a-f0-9]{7}$/.test(tag)
    ? [...PLATFORM_CANDIDATES, NIGHTLY_DEB]
    : PLATFORM_CANDIDATES;
  for (const { target, pairs } of candidates) {
    for (const { assetExt, sigExt } of pairs) {
      const sigFile = files.find((name) => name.endsWith(sigExt));
      if (!sigFile) continue;

      const assetFile = sigFile.slice(0, -4);
      if (!assetFile.endsWith(assetExt) || !fileSet.has(assetFile)) continue;

      const signature = readFileSync(join(artifactsDir, sigFile), "utf8").trim();
      if (!signature) continue;

      platforms[target] = {
        signature,
        url: `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(assetFile)}`,
      };
      break;
    }
  }

  if (Object.keys(platforms).length === 0) {
    return null;
  }

  return {
    version: version.replace(/^v/i, ""),
    notes: notes || "",
    pub_date: pubDate,
    platforms,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith("--")) {
      args[key.slice(2)] = argv[i + 1] ?? "";
      i += 1;
    }
  }
  return args;
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const artifactsDir = resolve(args.dir || ".");
  const channel = args.channel === "nightly" ? "nightly" : "stable";
  const version = (args.version || "").trim();
  const tag = (args.tag || "").trim();
  const notes = (args.notes || "").trim();
  const repo = (args.repo || DEFAULT_REPO).trim();

  if (!version || !tag) {
    console.error("Usage: generate-updater-manifest.mjs --dir <dir> --channel <nightly|stable> --version <semver> --tag <tag> [--notes <text>]");
    process.exit(1);
  }

  const manifest = buildUpdaterManifest({
    version,
    notes,
    tag,
    repo,
    artifactsDir,
  });

  if (!manifest) {
    console.log("[Zyx Desktop] No signed updater artifacts (.sig) found; skipping updater manifest generation.");
    process.exit(0);
  }

  const fileName = manifestFileNameForChannel(channel);
  const outPath = join(artifactsDir, fileName);
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(
    `[Zyx Desktop] Generated ${fileName} for v${manifest.version} with platforms: ${Object.keys(manifest.platforms).join(", ")}`,
  );
}
