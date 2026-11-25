const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../../..");
const output = path.resolve(process.env.ONBOARDING_FIXTURE_OUT || path.join(root, "artifacts/visual-quality/onboarding-fixture"));
const esbuild = require(path.join(root, "node_modules/esbuild"));
const postcss = require(path.join(root, "node_modules/postcss"));
const tailwind = require("@tailwindcss/postcss");

const aliases = {
  "next/link": "link.tsx",
  "next/image": "image.tsx",
  "next/navigation": "navigation.ts",
  "nextjs-toploader/app": "navigation.ts",
  "next/dynamic": "dynamic.tsx",
  "@/lib/auth-client": "data.ts",
  "@/hooks/use-query-account": "data.ts",
  "@/hooks/use-student-sidebar-data": "data.ts",
  "@/lib/i18n/actions": "data.ts",
  "@/lib/auth/account-switch": "data.ts",
  "@/lib/native/auth": "data.ts",
  "@/lib/native/haptics": "data.ts",
  "@/lib/gamification/social-actions": "data.ts",
  "@/app/(student)/dashboard/search-actions": "data.ts",
  "@/app/(student)/profile/edit/zyra-appearance-action": "data.ts",
  "@/app/actions/tutor": "data.ts",
  "@/app/actions/google-calendar": "data.ts",
  "@/components/notifications/notification-runtime": "offscope.tsx",
  "@/components/native/app-update-control": "offscope.tsx",
  "@/components/gamification/student-identity": "offscope.tsx",
  "@/components/gamification/zyra-mascot-3d": "offscope.tsx",
  "@/components/course/article-parts": "offscope.tsx",
  "@/components/course/markdown-renderer": "offscope.tsx",
  "@/components/course/math-text": "offscope.tsx",
  "@/components/course/learning-canvas/learning-canvas-renderer": "offscope.tsx",
  "@/components/course/tutor-drawer-view": "zyra-view.tsx",
};

const resolveFile = base => [base, ...[".ts", ".tsx", ".js", ".jsx", ".json"].map(extension => base + extension), ...["index.ts", "index.tsx", "index.js"].map(name => path.join(base, name))]
  .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());

const plugin = {
  name: "onboarding-fixture-adapters",
  setup(build) {
    build.onResolve({ filter: /.*/ }, args => {
      if (aliases[args.path]) return { path: path.join(__dirname, aliases[args.path]) };
      const local = args.path.startsWith("@/") ? path.join(root, args.path.slice(2)) : args.path.startsWith(".") ? path.resolve(args.resolveDir, args.path) : null;
      if (!local) return;
      const relative = "@/" + path.relative(root, local).replace(/\\/g, "/").replace(/\.(tsx?|jsx?)$/, "");
      if (aliases[relative]) return { path: path.join(__dirname, aliases[relative]) };
      if (args.path.startsWith("@/")) {
        const resolved = resolveFile(local);
        if (resolved) return { path: resolved };
      }
    });
  },
};

async function compile() {
  fs.mkdirSync(output, { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(__dirname, "entry.tsx")], outfile: path.join(output, "bundle.js"),
    bundle: true, format: "iife", platform: "browser", target: "es2022", jsx: "automatic",
    nodePaths: [path.join(root, "node_modules")], plugins: [plugin],
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" }, logLevel: "info",
  });
  let css = fs.readFileSync(path.join(root, "app/globals.css"), "utf8")
    .replace('@import "tailwindcss";', '@import "tailwindcss" source(none);');
  const sources = ["components", "features", "app/(student)/settings/settings-client.tsx", "tests/visual/onboarding-harness"];
  css += "\n" + sources.map(source => `@source "${path.join(root, source)}";`).join("\n");
  css += '\n@font-face{font-family:Inter;src:url(/fonts/inter-latin.woff2) format("woff2");font-weight:100 900;font-style:normal;font-display:swap}\n@font-face{font-family:Lexend;src:url(/fonts/lexend-latin.woff2) format("woff2");font-weight:100 900;font-style:normal;font-display:swap}\n:root{--font-inter:Inter;--font-lexend:Lexend}\n';
  const styles = await postcss([tailwind({ base: root })]).process(css, { from: path.join(root, "app/globals.css"), to: path.join(output, "styles.css") });
  fs.writeFileSync(path.join(output, "styles.css"), styles.css);
  fs.mkdirSync(path.join(output, "fonts"), { recursive: true });
  for (const name of ["inter-latin.woff2", "lexend-latin.woff2"]) fs.copyFileSync(path.join(root, "tests/visual/fixtures/fonts", name), path.join(output, "fonts", name));
  fs.writeFileSync(path.join(output, "index.html"), '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/bundle.css"><title>Zyx onboarding visual fixture</title></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  if (!fs.existsSync(path.join(output, "bundle.css"))) fs.writeFileSync(path.join(output, "bundle.css"), "");
  fs.writeFileSync(path.join(output, "fixture-manifest.json"), JSON.stringify({
    entry: "GuidedTourFlow", realSurfaces: ["student/tutor navigation", "account popover", "settings", "student/tutor schedules", "Zyra trigger/provider/chat-frame primitives", "search dialog"],
    partialSurfaces: ["Zyra conversation content and drawer composition use a local shell; full chat behavior is outside this fixture", "Course/dashboard content is deterministic fixture data"],
    fixtureData: "Fictional account, fixed week, one optional course, empty schedules and conversations",
    mockedBoundaries: Object.keys(aliases), externalWrites: false,
  }, null, 2));
  console.log(`Onboarding fixture: ${output}`);
}

compile().catch(error => { console.error(error); process.exitCode = 1; });
