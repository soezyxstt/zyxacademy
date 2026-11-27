import { build } from "esbuild";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { renderToPipeableStream } from "react-dom/server";
import { PassThrough } from "node:stream";
import type { ReactNode } from "react";
import type { LearningData } from "../../../packages/native-parity/student/learning/contracts";

export async function buildStudentConceptPage(entry: string) {
  const bundle = await build({
    entryPoints: [entry], bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic",
    outdir: "fixture-output", loader: { ".woff2": "dataurl", ".woff": "dataurl", ".ttf": "dataurl" },
    external: ["react", "react-dom", "next-intl"],
    plugins: [{
      name: "student-concept-server-boundaries",
      setup(builder) {
        const modules: Record<string, string> = {
          "@/lib/auth-session": "export const getAuthSession = async () => ({user:{id:'student-fixture'}});",
          "@/lib/course-utils": "export const getCourse = async id => id === fixtureCourseId ? {title: fixture.courseTitle} : null;",
          "@/lib/concept-explorer-service": `export async function getConceptExplorerData(id, slug, actor) {
            if (fixture.state !== 'ready' || id !== fixtureCourseId || slug !== fixtureSlug || actor !== 'student-fixture') {
              throw new Error('Concept read is outside the fixture scope');
            }
            return fixture.concept;
          }`,
          "@/app/(student)/dashboard/actions": `export async function checkFullCourseContentAccess(id) {
            if (id !== fixtureCourseId) throw new Error('Course access lookup is outside the fixture scope');
            return fixture.state === 'ready';
          }
          export async function enrollWithToken(){ throw new Error('Course enrollment is outside this fixture'); }`,
          "@/lib/i18n/server": "export async function getTranslations(){ throw new Error('Concept metadata is outside this fixture'); }",
          "@/lib/site": "export const createMetadata = source => source;",
          "@/lib/auth-client": "export const useSession = () => ({data:null,isPending:false});",
          "@/components/providers/locale-provider": "export const useAppLocale = () => ({locale:'id'});",
          "./coding-workspace": "export function CodingWorkspace(){ throw new Error('Coding workspace is outside this reference'); }",
          "@/app/actions/tutor": `async function outside(){ throw new Error('Tutor interaction is outside this reference'); }
            export const quickExplainSnippetAction=outside, explainConceptAction=outside, analyzeMistakeAction=outside,
              buildStudyPlanAction=outside, saveTutorMessagesAction=outside, loadTutorHistoryAction=outside,
              clearTutorHistoryAction=outside, getTutorCourseContextAction=outside, listTutorSessionsAction=outside;`,
          "next/navigation": "export const usePathname = () => '/courses/matematika-1/concept/limit'; export const useRouter = () => ({}); export const useSearchParams = () => new URLSearchParams(); export function notFound(){ throw new Error('Concept was not found'); }",
          "next/link": "import {createElement} from 'react'; export default function Link(props){ return createElement('a',props); }",
          "next/image": "import {createElement} from 'react'; export default function Image(props){ return createElement('img',props); }",
          "next/dynamic": "export default function dynamic(){return () => null;}",
        };
        builder.onResolve({ filter: /.*/ }, args => Object.hasOwn(modules, args.path)
          ? { path: args.path, namespace: "student-concept-server" }
          : undefined);
        builder.onLoad({ filter: /.*/, namespace: "student-concept-server" }, args => ({
          contents: modules[args.path], loader: "js", resolveDir: process.cwd(),
        }));
      },
    }],
  });
  const script = bundle.outputFiles.find(file => file.path.endsWith(".js"))?.text ?? "";
  if (!script) throw new Error("Production concept page produced no server bundle");
  const styles = bundle.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? "";

  async function render(fixture: LearningData, courseId: string, slug: string) {
    if (!("courseTitle" in fixture) || fixture.view !== "concept") throw new Error("Expected a concept payload");
    const harness: { exports: { renderConceptReference?: (id: string, slug: string, course: string) => Promise<ReactNode> } } = { exports: {} };
    runInNewContext(script, {
      module: harness, require: createRequire(resolve(entry)), fixture, fixtureCourseId: courseId, fixtureSlug: slug,
      process, console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, TextEncoder, TextDecoder,
    });
    const renderConceptReference = harness.exports.renderConceptReference;
    if (!renderConceptReference) throw new Error("Production concept page was not bundled");
    const tree = await renderConceptReference(courseId, slug, fixture.courseTitle);
    return await new Promise<string>((resolve, reject) => {
      const stream = new PassThrough();
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      stream.once("error", reject);
      const result = renderToPipeableStream(tree, {
        onAllReady() { result.pipe(stream); },
        onShellError: reject,
        onError: reject,
      });
    });
  }
  return { render, styles };
}
