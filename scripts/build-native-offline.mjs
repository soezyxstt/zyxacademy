import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as lucide from "lucide-react";
import { STUDENT_MOBILE_DESTINATIONS } from "../components/navigation/student/student-mobile-destinations.ts";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const iconNames = [
  "ArrowLeft", "Bell", "BookOpen", "CalendarRange", "Home", "LayoutDashboard",
  "Medal", "MessageSquareText", "PanelLeftClose", "PanelLeftOpen", "PawPrint",
  "Search", "Trophy", "UserRound", "Users",
];
const icons = Object.fromEntries(iconNames.map(name => [
  name, renderToStaticMarkup(createElement(lucide[name], { size: 16, "aria-hidden": true })),
]));
const destinations = STUDENT_MOBILE_DESTINATIONS.map(({ id, href, iconName }) => ({ id, href, icon: iconName }));
const logos = await Promise.all(["color", "reversed"].map(variant =>
  readFile(join(root, "public/brand", `zyx-logo-symbol-${variant}.svg`), "utf8"),
));
const result = await build({
  absWorkingDir: root,
  entryPoints: ["lib/offline/native-shell-entry.ts"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: ["chrome100", "safari16"],
  minify: true,
  legalComments: "none",
  outfile: "offline-shell.js",
  alias: { "@": root },
  define: {
    "process.env.NODE_ENV": '"production"',
    NATIVE_NAV_LOGOS: JSON.stringify(logos),
    NATIVE_NAV_ICONS: JSON.stringify(icons),
    NATIVE_MOBILE_DESTINATIONS: JSON.stringify(destinations),
  },
});
const css = await readFile(join(root, "lib/offline/native-shell.css"), "utf8");
const bundle = result.outputFiles.find(file => file.path.endsWith(".js"));
if (!bundle) throw new Error("Native offline bundle was not generated");
for (const destination of ["apps/mobile/www", "apps/desktop/dist"]) {
  const folder = join(root, destination);
  await mkdir(join(folder, "vendor/fonts"), { recursive: true });
  await writeFile(join(folder, "offline-shell.js"), bundle.contents);
  await writeFile(join(folder, "offline-shell.css"), css);
  const origin = process.env.ZYX_APP_CHANNEL === "nightly" ? "https://staging.zyxacademy.com" : "https://www.zyxacademy.com";
  await writeFile(join(folder, "offline-origin.js"), `window.__ZYX_NATIVE_SERVER_ORIGIN__=${JSON.stringify(origin)};\n`);
  for (const font of ["inter-latin.woff2", "lexend-latin.woff2", "inter-OFL.txt", "lexend-OFL.txt"]) {
    await cp(join(root, "tests/visual/fixtures/fonts", font), join(folder, "vendor/fonts", font));
  }
  // Both native shells already bundle the compact WOFF2-only KaTeX assets.
  const mathCss = await readFile(join(folder, "vendor/katex/katex.min.css"), "utf8");
  if (!mathCss.includes(".woff2")) throw new Error(`Missing local math fonts in ${destination}`);
}
process.stdout.write(`Native offline shell built (${Math.round(bundle.contents.byteLength / 1024)} KiB).\n`);
