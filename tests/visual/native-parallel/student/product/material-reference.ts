import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  learningEndpoint, type CourseData, type LearningQuery, type MaterialDetailData, type MaterialListData,
} from "../../../../../packages/native-parity/student/courses/contract";
import { localStudentCookie } from "./session";

const origin = new URL(process.env.BETTER_AUTH_URL ?? "");
assert.ok(["127.0.0.1", "localhost"].includes(origin.hostname), "Expected a local Next.js origin");

const courseId = "matematika-1";
const materialId = "dokumen-4";
const previewId = "dokumen-1";
const states = ["enrolled", "unenrolled", "revoked"] as const;
const groups = [
  { group: "course-detail", view: "course" },
  { group: "material-list", view: "material-list" },
  { group: "material-reader", view: "material-detail" },
] as const;
const fixturePath = "packages/native-parity/student/courses/material-reference.json";
const seedPath = process.env.STUDENT_PRODUCT_SEED_SOURCE ?? "tests/visual/native-parallel/student/product/seed.ts";
const output = process.env.STUDENT_MATERIAL_REFERENCE_DIR ?? "artifacts/student-evidence/reference";
const serverSha = process.env.STUDENT_SERVER_SHA ?? execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const sha256 = (input: Uint8Array | string) => createHash("sha256").update(input).digest("hex");
const seedSha256 = sha256(await readFile(seedPath));
const fixture = { courseId, materialId, previewId, responses: {} as Record<string, unknown> };

for (const state of states) {
  const cookie = await localStudentCookie(state);
  const userId = "student-evidence-" + state;
  const headers = { cookie: cookie.name + "=" + cookie.value, "x-student-id": userId, "x-app-locale": "id" };
  const fetchView = (query: LearningQuery, account = userId) => fetch(new URL(learningEndpoint(query), origin), {
    headers: { ...headers, "x-student-id": account }, redirect: "error",
  });
  async function read<Reply extends CourseData | MaterialListData | MaterialDetailData>(query: LearningQuery) {
    const response = await fetchView(query);
    assert.equal(response.status, 200, state + "/" + query.view);
    const body = await response.json() as Reply;
    assert.equal(body.view, query.view);
    assert.equal(body.course.id, courseId);
    assert.equal(body.course.title, "Matematika I");
    assert.equal(body.course.hasFullContentAccess, state === "enrolled");
    return body;
  }
  const course = await read<CourseData>({ view: "course", courseId });
  const list = await read<MaterialListData>({ view: "material-list", courseId });
  const readerQuery = { view: "material-detail", courseId, materialId } as const;
  const reader = await read<MaterialDetailData>(readerQuery);
  const preview = await read<MaterialDetailData>({ ...readerQuery, materialId: previewId });
  const row = list.materials.find(material => material.id === materialId);
  assert.ok(row, state + "/missing listed material");
  assert.equal(row.title, "Turunan");
  assert.equal(row.locked, state !== "enrolled");
  assert.deepEqual(Object.keys(reader).sort(), ["course", "material", "view"]);
  assert.deepEqual(reader.material, { id: materialId, title: row.title, group: "materi", kind: "article", completed: false, locked: row.locked });
  assert.equal(preview.material.id, previewId);
  assert.equal(preview.material.title, "Sistem bilangan real");
  assert.equal(preview.material.locked, false);
  assert.equal((await fetchView(readerQuery, "wrong-account")).status, 409);
  const missing = await fetchView({ ...readerQuery, materialId: "missing" });
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "COURSE_RESOURCE_NOT_FOUND" });
  fixture.responses[state] = { course, "material-list": list, "material-detail": reader, preview };
  console.log(state, "course/list/reader/preview 200, identity mismatch 409, unknown reader 404");
}

const fixtureJSON = JSON.stringify(fixture, null, 2) + "\n";
if (process.argv.includes("--write-inputs")) {
  await writeFile(fixturePath, fixtureJSON);
} else {
  assert.deepEqual(JSON.parse(fixtureJSON), JSON.parse(await readFile(fixturePath, "utf8")), "Signed responses differ from the device fixture");
}
if (process.argv.includes("--inputs-only")) process.exit(0);
const fixtureSha256 = sha256(await readFile(fixturePath));
const captureScript = "tests/visual/native-parallel/student/product/capture.ts";
const caseIds = states.flatMap(state => groups.map(({ view }) => `student-${state}-${view}`));
type ProductCapture = { id: string; path: string; status: number; visibleContent: string[]; reducedMotion: string; hydrationWarnings?: string[] };
const tmp = await mkdtemp(join(tmpdir(), "student-material-reference-"));
let complete = false;

try {
  for (const platform of ["android", "ios"] as const) {
    const captureDir = join(tmp, platform);
    execFileSync(process.execPath, [captureScript], { env: {
      ...process.env,
      STUDENT_SERVER_SHA: serverSha,
      STUDENT_CAPTURE_DIR: captureDir,
      STUDENT_CAPTURE_PLATFORM: platform,
      STUDENT_CAPTURE_CASES: caseIds.join(","),
    }, stdio: "inherit" });
    const { results, width, height, dpr, browser, timezone } = JSON.parse(await readFile(join(captureDir, "web.json"), "utf8")) as {
      results: ProductCapture[]; width: number; height: number; dpr: number; browser: string; timezone: string;
    };
    assert.equal(results.length, caseIds.length);
    for (const { group, view } of groups) {
      const destination = join(output, group, "web", platform);
      await mkdir(destination, { recursive: true });
      const captures: Record<string, string> = {};
      const details = Object.fromEntries(await Promise.all(states.map(async state => {
        const result = results.find(({ id }) => id === `student-${state}-${view}`);
        assert.ok(result && result.status === 200);
        const filename = `${group}-${state}.png`;
        const image = await readFile(join(captureDir, result.id + ".png"));
        assert.equal(image.readUInt32BE(16), width * dpr);
        assert.equal(image.readUInt32BE(20), height * dpr);
        await writeFile(join(destination, filename), image);
        captures[filename] = sha256(image);
        const { id: _id, ...metadata } = result;
        return [state, {
          ...metadata, scenario: "course-material-" + state, courseAccess: state === "enrolled" ? "full" : "preview",
          ...(view === "material-detail" ? { materialAccess: state === "enrolled" ? "open" : "locked" } : {}),
        }];
      })));
      await writeFile(join(destination, group + "-reference.json"), JSON.stringify({
        platform, viewport: { width, height }, deviceScaleFactor: dpr, locale: "id", theme: "light",
        states: details, captures: Object.fromEntries(Object.entries(captures).sort()), fixtureSha256, seedSha256,
        courseId, materialId, serverSha, browser, timezone,
      }, null, 2) + "\n");
    }
  }
  complete = true;
} finally {
  if (complete) await rm(tmp, { recursive: true, force: true });
  else console.error("Raw browser results retained at " + tmp);
}
