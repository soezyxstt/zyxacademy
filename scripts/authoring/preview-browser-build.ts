import { build, type Plugin } from "esbuild";
import { readFile } from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { buildSelfContainedKatexCss } from "@/lib/bundle/product-diktat-pdf";

/** Host-only adapters. Production content components are bundled unchanged. */
const localHost: Plugin = {
  name: "offline-authoring-host",
  setup(builder) {
    const modules: Record<string, string> = {
      "next/dynamic": `import React from 'react'; export default function dynamic(load, options={}) { const Lazy=React.lazy(() => load().then(value => ({default:value.default || value}))); return function Dynamic(props) { return React.createElement(React.Suspense,{fallback:options.loading ? React.createElement(options.loading) : null},React.createElement(Lazy,props)); }; }`,
      "next/link": `import React from 'react'; export default function Link({href,children,...props}) { return React.createElement('a',{href,...props},children); }`,
      "next/navigation": `export const usePathname=()=>'/'; export const useSearchParams=()=>new URLSearchParams(); export const useRouter=()=>({push(){throw new Error('PREVIEW_NAVIGATION_UNAVAILABLE')},replace(){throw new Error('PREVIEW_NAVIGATION_UNAVAILABLE')},refresh(){throw new Error('PREVIEW_NAVIGATION_UNAVAILABLE')}});`,
      "@/components/providers/locale-provider": `export const useAppLocale=()=>({locale:'id',setLocale:async()=>false,isPending:false,error:null});`,
      "coding-workspace": `export function CodingWorkspace(){throw new Error('PREVIEW_CODING_EXECUTION_UNAVAILABLE')}`,
    };
    builder.onResolve({ filter: /^(next\/(dynamic|link|navigation)|@\/components\/providers\/locale-provider)$|(?:^|\/)coding-workspace$/ }, args => {
      const key = args.path.endsWith("coding-workspace") ? "coding-workspace" : args.path;
      return Object.hasOwn(modules, key) ? { path: key, namespace: "offline-host" } : undefined;
    });
    builder.onLoad({ filter: /.*/, namespace: "offline-host" }, args => ({ contents: modules[args.path], loader: "js", resolveDir: process.cwd() }));
  },
};

export async function buildDraftPreviewBrowser() {
  const stylesheet = path.resolve("app/globals.css");
  const [styles, bundle, fonts] = await Promise.all([
    readFile(stylesheet, "utf8").then(css => postcss([tailwind()]).process(css, { from: stylesheet })),
    build({ entryPoints: ["scripts/authoring/preview-browser.tsx"], bundle: true, write: false, format: "iife", outdir: "preview-output", minify: true,
      loader: { ".woff2": "dataurl", ".woff": "dataurl", ".ttf": "dataurl" },
      define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" }, plugins: [localHost], logLevel: "silent" }),
    Promise.all((["Inter", "Lexend"] as const).map(async family => {
      const bytes = await readFile(`tests/visual/fixtures/fonts/${family.toLowerCase()}-latin.woff2`);
      return `@font-face{font-family:'${family}';font-style:normal;font-weight:${family === "Inter" ? "400 700" : "700"};font-display:block;src:url(data:font/woff2;base64,${bytes.toString("base64")}) format('woff2')}`;
    })),
  ]);
  return {
    script: bundle.outputFiles.find(file => file.path.endsWith(".js"))!.text,
    styles: styles.css + fonts.join("") + ":root{--font-inter:'Inter';--font-lexend:'Lexend'}" + buildSelfContainedKatexCss() + (bundle.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? ""),
  };
}
