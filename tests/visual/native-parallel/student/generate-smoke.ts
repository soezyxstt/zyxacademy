import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { studentPatterns, matchStudentRoute, type StudentArea } from "../../../../apps/mobile-native/features/student/routes";
import { studentCourseCases, courseFixtureScenarios } from "../../../../packages/native-parity/student/courses/fixtures";
import { assessmentFixtureCases } from "../../../../packages/native-parity/student/assessment/fixtures";
import { learningFixtureCases } from "../../../../packages/native-parity/student/learning/fixtures";
import { communityCases } from "../../../../packages/native-parity/student/community/routes";

type Marker = { text: string } | { id: string };
type Case = { source: string; route: string; area: StudentArea; id: string; path: string; scenario: string; theme: string; marker?: Marker; reason?: string; limitation?: string };
const webRoutes = (await readFile("plans/native-parallel/routes.tsv", "utf8")).trim().split("\n").slice(1)
  .map(line => line.split("\t")).filter(([owner]) => owner === "student").map(([, path]) => path);
const sourceFor = (pattern: string) => `app/(student)${pattern}/page.tsx`;
const allPatterns = Object.values(studentPatterns).flat();
if (allPatterns.length !== 50 || new Set(allPatterns).size !== 50 || webRoutes.length !== 50 ||
    webRoutes.some(path => !allPatterns.some(pattern => sourceFor(pattern) === path))) throw new Error("Native routes and Student route inventory differ");
const cases: Case[] = [];
function add(area: StudentArea, pattern: string, id: string, path: string, scenario: string, theme: string, marker?: Marker, reason?: string) {
  if (!matchStudentRoute(path) || matchStudentRoute(path)?.pattern !== pattern) throw new Error(`Bad route for ${id}: ${path}`);
  const limitation = pattern === "/courses/[id]/live/host" || pattern === "/settings/notifications/browser" ?
    "Checks the handoff or unavailable control; does not exercise the external browser." :
    pattern === "/discussions" || pattern === "/leaderboard/academic" ?
      "Checks destination content after alias resolution; does not prove Back or query retention." :
    pattern.endsWith("/material/[materialId]") ? "Checks the current reader dependency status; the renderer is not exercised." :
    area === "courses" ? "Checks a rendered control; it does not by itself establish the course access policy." : undefined;
  cases.push({ source: sourceFor(pattern), route: pattern, area, id, path, scenario, theme, marker, limitation,
    ...(!marker ? { reason: reason ?? "No scenario-specific content assertion is defined." } : {}) });
}
const text = (s: string): Marker => ({ text: s });
const id = (s: string): Marker => ({ id: s });

// The course module currently declares dashboard/catalog cases, plus scenario
// transports usable for course and material pages. Keep the distinction visible.
for (const item of studentCourseCases) {
  const pattern = matchStudentRoute(item.initialPath)!.pattern;
  const marker = item.scenario === "offline" ? id("student-learning-retry") :
    item.scenario === "catalog-parity" ? id(item.initialPath.includes("jurusan=pka") ? "student-course-tutorial-pka" : "student-course-ma1101") : id("student-course-matematika-1");
  add("courses", pattern, item.id, item.initialPath, item.scenario, item.theme, marker);
}
for (const [pattern, path, marker] of [
  ["/courses/[id]", "/courses/matematika-1", id("student-course-open-materials")],
  ["/courses/[id]/material", "/courses/matematika-1/material", id("student-material-pengantar")],
  ["/courses/[id]/material/[materialId]", "/courses/matematika-1/material/pengantar", text("Pembaca materi belum tersedia di aplikasi ini.")],
] as const) {
  for (const scenario of ["enrolled", "unenrolled", "revoked"] as const) {
    if (!courseFixtureScenarios.includes(scenario)) throw new Error(`Missing scenario ${scenario}`);
    add("courses", pattern, `course.${pattern}.${scenario}`, path, scenario, "light", marker);
  }
}

const communityReady: Record<string, Partial<Record<string, Marker>>> = {
  "/achievements": { loaded: text("Papan lencana") },
  "/calendar": { loaded: text("Kuis limit"), empty: text("Belum ada agenda.") },
  "/courses/[id]/discussions": { loaded: text("Limit kiri dan kanan pada fungsi potongan"), empty: text("Belum ada diskusi.") },
  "/courses/[id]/leaderboard": { loaded: text("#1 Nara Putri") },
  "/dashboard/discussions": { loaded: text("Limit kiri dan kanan pada fungsi potongan"), empty: text("Belum ada diskusi.") },
  "/dashboard/groups": { loaded: text("Kelompok turunan"), empty: text("Belum ada kelompok belajar.") },
  "/dashboard/schedule": { loaded: text("Sesi kelompok"), empty: text("Belum ada sesi minggu ini.") },
  "/discussions": { loaded: text("Limit kiri dan kanan pada fungsi potongan"), empty: text("Belum ada diskusi.") },
  "/feedback": { loaded: text("Kirim masukan") },
  "/leaderboard": { loaded: text("#1 Nara Putri"), empty: text("Belum ada siswa dalam peringkat ini.") },
  "/leaderboard/academic": { loaded: text("Semua kelas"), empty: text("Belum ada kursus yang diikuti.") },
  "/pet": { loaded: text("Koleksi") },
  "/profile": { loaded: text("Aruni Rasyid") },
  "/profile/edit": { loaded: text("Fakultas") },
  "/profile/reflections": { empty: text("Belum ada refleksi mingguan.") },
  "/settings": { loaded: text("Bahasa Indonesia") },
  "/settings/notifications": { loaded: text("Email opsional") },
  "/settings/notifications/browser": { loaded: text("Browser perangkat belum tersedia.") },
  "/students/[publicId]": { loaded: text("Nara Putri"), empty: text("Konten tidak tersedia atau akses berubah.") },
};
const communityStatic = new Set(["/feedback", "/settings", "/settings/notifications/browser"]);
for (const item of communityCases) {
  const marker = item.fixture === "unavailable" && item.component === "/dashboard/schedule" ? undefined : item.fixture === "unavailable" && !communityStatic.has(item.component)
    ? text("Koneksi bermasalah. Coba lagi.") : communityReady[item.component]?.[item.fixture];
  add("community", item.component, item.id, item.path, item.fixture, item.theme, marker,
    item.fixture === "unavailable" && communityStatic.has(item.component) ? "This route does not invoke a fixture read at entry." :
      item.fixture === "unavailable" && item.component === "/dashboard/schedule" ? "Two concurrent fixture reads race for the single injected failure." : undefined);
}

const learningReady: Record<string, Marker> = {
  "/courses/[id]/concept/[slug]": text("Definisi"),
  "/courses/[id]/flashcard": text("Standar"),
  "/courses/[id]/mastery": text("Topik untuk diulang"),
  "/courses/[id]/path": text("Limit fungsi"),
  "/courses/[id]/playground": text("Buka Playground Python"),
  "/courses/[id]/progress": text("Analisis lebih lanjut"),
  "/courses/[id]/video": text("Pembahasan limit"),
  "/courses/[id]/live": text("Kode sesi"),
  "/courses/[id]/live/host": text("Buka halaman tutor"),
  "/courses/tutorial-pka": text("Mulai dari simulasi awal"),
  "/courses/tutorial-pka/daftar": text("Pendaftaran ditutup"),
  "/courses/tutorial-pka/jadwal": text("Pembahasan fungsi limit"),
  "/courses/tutorial-pka/laporan": text("Matematika"),
  "/courses/tutorial-pka/material": id("student-material-pengantar"),
  "/courses/tutorial-pka/material/[materialId]": text("Pembaca materi belum tersedia di aplikasi ini."),
  "/courses/tutorial-pka/simulasi": text("Matematika, tahap satu"),
  "/courses/tutorial-pka/simulasi/[subject]/[stage]": text("Mulai simulasi"),
};
const learningEmpty: Record<string, Marker> = {
  "/courses/[id]/flashcard": text("Semua flashcard terbit sudah Anda pelajari atau tidak ada kartu yang perlu diulas hari ini. Silakan kembali lagi nanti."),
  "/courses/[id]/mastery": text("Belum ada hasil per topik"),
};
for (const item of learningFixtureCases) {
  let marker: Marker | undefined;
  if (item.pattern === "/courses/[id]/live/host") marker = item.scenario === "enrolled" ? learningReady[item.pattern] : undefined;
  else if (item.scenario === "offline") marker = text("Data belajar gagal dimuat. Periksa koneksi dan coba lagi.");
  else if (item.scenario === "no-enrollment" && item.pattern.startsWith("/courses/tutorial-pka")) marker = text("Pendaftaran ditutup");
  else if (item.pattern === "/courses/tutorial-pka/daftar" && item.scenario === "enrolled") marker = text("Mulai dari simulasi awal");
  else marker = item.scenario === "empty" ? learningEmpty[item.pattern] : learningReady[item.pattern];
  add("learning", item.pattern, item.id, item.path, item.scenario, item.theme, marker);
}

for (const item of assessmentFixtureCases) {
  const pattern = matchStudentRoute(item.path)!.pattern;
  // The public component name can be shared by several route fixtures.
  // The declared case ID retains the fixture path key.
  const component = item.id.split(".")[2];
  // The fixture offers explicit list and detail identities. Mark only checks
  // which distinguish those routes and do not rely on placeholder screenshots.
  const listMarker = component === "quizList" ? id("student-assessment-native-quiz") :
    component === "tryoutList" ? id("student-assessment-native-tryout") : undefined;
  const marker = item.scenario !== "populated" ? undefined : listMarker ?? (
    component === "quizPlayer" ? id("student-assessment-option-0") :
    component === "solutions" ? id("student-assessment-reveal") :
    component === "results" ? id("student-assessment-native-completed-attempt") :
    component === "quiz" || component === "quizReview" || component === "quizSummary" || component === "summary" ? text("Fungsi, limit, dan turunan") :
    component === "tryout" || component === "review" ? text("Simulasi Ujian Tengah Semester") : undefined);
  add("assessment", pattern, item.id, item.path, item.scenario, item.theme, marker);
}

const out = process.argv[2] ?? "artifacts/student-evidence/generated";
await mkdir(out, { recursive: true });
for (const area of Object.keys(studentPatterns) as StudentArea[]) await mkdir(join(out, area), { recursive: true });
const seen = new Set<string>();
for (const [index, entry] of cases.entries()) {
  if (seen.has(entry.id)) throw new Error(`Duplicate fixture ID: ${entry.id}`);
  seen.add(entry.id);
  if (!entry.marker) continue;
  const name = `smoke-${String(index + 1).padStart(3, "0")}`;
  const url = `zyx-native-parity://student-fixture?scenario=${encodeURIComponent(entry.scenario)}&theme=${entry.theme}&locale=id&path=${encodeURIComponent(entry.path)}`;
  const selector = "id" in entry.marker ? `      id: ${JSON.stringify(entry.marker.id)}` : `      text: ${JSON.stringify(entry.marker.text)}`;
  const flow = `appId: com.zyx.academy.nativeparity\nname: ${name}\n---\n- launchApp:\n    clearState: true\n- extendedWaitUntil:\n    visible: separator\n    timeout: 30000\n- openLink: ${JSON.stringify(url)}\n- extendedWaitUntil:\n    visible:\n${selector}\n    timeout: 30000\n- takeScreenshot: ${name}\n`;
  await writeFile(join(out, entry.area, `${name}.yaml`), flow);
  Object.assign(entry, { flow: `${entry.area}/${name}.yaml`, testName: name, capture: `${name}.png` });
}
const routes = webRoutes.map(source => ({ source, cases: cases.filter(item => item.source === source) }));
if (routes.some(route => !route.cases.length)) throw new Error("A Student route has no declared fixture scenario");
await writeFile(join(out, "manifest.json"), JSON.stringify({ status: "generated_not_executed",
  limitations: ["A requested theme is not independently verified by a screenshot assertion.",
    "Smoke checks do not establish permission behavior, parity, or backend integration."], routes }, null, 2) + "\n");
console.log(JSON.stringify({ routes: routes.length, cases: cases.length, ready: cases.filter(item => item.marker).length, blocked: cases.filter(item => !item.marker).length }));
