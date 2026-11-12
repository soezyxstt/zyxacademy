import { build, type Plugin } from "esbuild";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const boundary: Plugin = {
  name: "interactive-scene-browser-boundaries",
  setup(build) {
    const modules: Record<string, string> = {
      "next/dynamic": `import React from 'react'; export default function dynamic(load, options={}) { const Lazy=React.lazy(() => load().then(x => ({default:x.default || x}))); return function Dynamic(props) { return React.createElement(React.Suspense,{fallback:options.loading ? React.createElement(options.loading) : null},React.createElement(Lazy,props)); }; }`,
      "next/navigation": `export const useRouter=()=>({push(){},replace(){},refresh(){},back(){}}); export const usePathname=()=>'/fixture'; export const useSearchParams=()=>new URLSearchParams();`,
      "next/link": `import React from 'react'; export default function Link({href,children,...props}) { return React.createElement('a',{href,...props},children); }`,
      "next/image": `import React from 'react'; export default function Image({src,alt,...props}) { return React.createElement('img',{src:typeof src==='string'?src:src.src,alt,...props}); }`,
      "@/components/providers/locale-provider": `export const useAppLocale=()=>({locale:'id'});`,
      "@/components/student-experience-provider": `export const useStudentExperience=()=>({mode:"full"});`,
      "@/components/course/tutor-drawer": `export const useTutor=()=>({setSuppressPet(){},openTutor(){}});`,
      "@/components/coding/coding-workspace": `export function CodingWorkspace(){ throw new Error('Coding workspace is outside this fixture'); }`,
    };
    build.onResolve({ filter: /^(next\/(dynamic|navigation|link|image)|@\/components\/(providers\/locale-provider|course\/tutor-drawer|student-experience-provider|coding\/coding-workspace))$/ }, args => ({ path: args.path, namespace: "fixture-boundary" }));
    build.onLoad({ filter: /.*/, namespace: "fixture-boundary" }, args => ({ contents: modules[args.path], loader: "js", resolveDir: process.cwd() }));
  },
};
export async function buildFixture() {
  const stylesheet = resolve("app/globals.css");
  const styles = (await postcss([tailwind()]).process(readFileSync(stylesheet), { from: stylesheet })).css;
  const bundle = await build({ entryPoints: ["tests/visual/fixtures/interactive-scene.tsx"], bundle: true, write: false, format: "iife", outdir: "fixture-output", loader: { ".woff2": "dataurl", ".woff": "dataurl", ".ttf": "dataurl" }, minify: true, define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" }, plugins: [boundary] });
  return { styles: styles + (bundle.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? ""), script: bundle.outputFiles.find(file => file.path.endsWith(".js"))!.text };
}
