import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { studentPatterns, matchStudentRoute, type StudentArea } from "../../../../apps/mobile-native/features/student/routes";
import { studentCourseCases, courseFixtureScenarios } from "../../../../packages/native-parity/student/courses/fixtures";
import { assessmentFixtureCases, assessmentFixturePaths } from "../../../../packages/native-parity/student/assessment/fixtures";
import { learningFixtureCases } from "../../../../packages/native-parity/student/learning/fixtures";
import { communityCases } from "../../../../packages/native-parity/student/community/routes";

type Marker = { text: string } | { id: string; enabled?: boolean };
type Step = { tap: Marker } | { assert: Marker } | { absent: Marker } | { scroll: Marker } | { input: string } | { erase: number } | { hideKeyboard: true };
type Case = { source: string; route: string; area: StudentArea; id: string; path: string; scenario: string; theme: string; marker?: Marker; reason?: string; limitation?: string; steps?: Step[] };
const webRoutes = (await readFile("plans/native-parallel/routes.tsv", "utf8")).trim().split("\n").slice(1)
  .map(line => line.split("\t")).filter(([owner]) => owner === "student").map(([, path]) => path);
const sourceFor = (pattern: string) => `app/(student)${pattern}/page.tsx`;
const allPatterns = Object.values(studentPatterns).flat();
if (allPatterns.length !== 50 || new Set(allPatterns).size !== 50 || webRoutes.length !== 50 ||
    webRoutes.some(path => !allPatterns.some(pattern => sourceFor(pattern) === path))) throw new Error("Native routes and Student route inventory differ");
const cases: Case[] = [];
function add(area: StudentArea, pattern: string, id: string, path: string, scenario: string, theme: string, marker?: Marker, reason?: string, steps?: Step[]) {
  if (!matchStudentRoute(path) || matchStudentRoute(path)?.pattern !== pattern) throw new Error(`Bad route for ${id}: ${path}`);
  const limitation = pattern === "/courses/[id]/live/host" || pattern === "/settings/notifications/browser" ?
    "Checks the handoff or unavailable control; does not exercise the external browser." :
    pattern === "/discussions" || pattern === "/leaderboard/academic" ?
      "Checks destination content after alias resolution; does not prove Back or query retention." :
    pattern.endsWith("/material/[materialId]") ? "Checks the current reader dependency status; the renderer is not exercised." :
    area === "courses" ? "Checks a rendered control; it does not by itself establish the course access policy." : undefined;
  cases.push({ source: sourceFor(pattern), route: pattern, area, id, path, scenario, theme, marker, limitation, steps,
    ...(!marker ? { reason: reason ?? "No scenario-specific content assertion is defined." } : {}) });
}
const text = (s: string): Marker => ({ text: s });
const id = (s: string, enabled?: boolean): Marker => ({ id: s, ...(enabled === undefined ? {} : { enabled }) });

// The course module currently declares dashboard/catalog cases, plus scenario
// transports usable for course and material pages. Keep the distinction visible.
for (const item of studentCourseCases) {
  const pattern = matchStudentRoute(item.initialPath)!.pattern;
  const marker = item.scenario === "offline" ? id("student-learning-retry") :
    item.scenario === "catalog-parity" ? id(item.initialPath.includes("jurusan=pka") ? "student-course-tutorial-pka" : "student-course-ma1101") : id("student-course-matematika-1");
  const steps: Step[] | undefined = item.scenario === "offline" ? [{ tap: id("student-learning-retry") }, { assert: id("student-course-matematika-1") }] : item.scenario !== "catalog-parity" ? undefined :
    item.initialPath.includes("jurusan=pka") ? [{ absent: id("student-course-ma1101") }] :
    item.initialPath.includes("jurusan=tpb") ? [{ absent: id("student-course-tutorial-pka") }] :
    [{ scroll: id("student-course-tutorial-pka") }];
  add("courses", pattern, item.id, item.initialPath, item.scenario, item.theme, marker, undefined, steps);
}
for (const [pattern, path, marker] of [
  ["/courses/[id]", "/courses/matematika-1", id("student-course-open-materials")],
  ["/courses/[id]/material", "/courses/matematika-1/material", id("student-material-pengantar")],
  ["/courses/[id]/material/[materialId]", "/courses/matematika-1/material/pengantar", text("Pembaca materi belum tersedia di aplikasi ini.")],
] as const) {
  for (const scenario of ["enrolled", "unenrolled", "revoked"] as const) {
    if (!courseFixtureScenarios.includes(scenario)) throw new Error(`Missing scenario ${scenario}`);
    const detail = pattern.endsWith("/material/[materialId]");
    const target = detail && scenario !== "enrolled" ? path.replace("pengantar", "catatan-fungsi") : path;
    const actualMarker = detail && scenario !== "enrolled" ? id("student-material-locked") : marker;
    const restrictedSteps: Step[] | undefined = scenario === "enrolled" || detail ? undefined : pattern === "/courses/[id]" ?
      scenario === "unenrolled" ? [{ assert: text("Masukkan token untuk mengakses seluruh materi.") }] :
        [{ tap: id("student-course-open-materials") }, { assert: id("student-material-catatan-fungsi") }, { tap: id("student-material-catatan-fungsi") }, { assert: id("student-material-locked") }] :
      [{ assert: id("student-material-catatan-fungsi") }, { tap: id("student-material-catatan-fungsi") }, { assert: id("student-material-locked") }];
    add("courses", pattern, `course.${pattern}.${scenario}`, target, scenario, "light", actualMarker, undefined, restrictedSteps);
  }
  const recovered = marker;
  add("courses", pattern, `course.${pattern}.offline`, path, "offline", "dark", id("student-learning-retry"), undefined,
    [{ tap: id("student-learning-retry") }, { assert: recovered }]);
}

const communityReady: Record<string, Partial<Record<string, Marker>>> = {
  "/achievements": { loaded: text("Papan lencana"), empty: text("Pencapaian") },
  "/calendar": { loaded: text("Kuis limit"), empty: text("Belum ada agenda.") },
  "/courses/[id]/discussions": { loaded: text("Limit kiri dan kanan pada fungsi potongan"), empty: text("Belum ada diskusi.") },
  "/courses/[id]/leaderboard": { loaded: text("#1 Nara Putri"), empty: text("Konten tidak tersedia atau akses berubah.") },
  "/dashboard/discussions": { loaded: text("Limit kiri dan kanan pada fungsi potongan"), empty: text("Belum ada diskusi.") },
  "/dashboard/groups": { loaded: text("Kelompok turunan"), empty: text("Belum ada kelompok belajar.") },
  "/dashboard/schedule": { loaded: text("Sesi kelompok"), empty: text("Belum ada sesi minggu ini.") },
  "/discussions": { loaded: text("Limit kiri dan kanan pada fungsi potongan"), empty: text("Belum ada diskusi.") },
  "/feedback": { loaded: text("Masukan"), empty: text("Masukan"), unavailable: text("Masukan") },
  "/leaderboard": { loaded: text("#1 Nara Putri"), empty: text("Belum ada siswa dalam peringkat ini.") },
  "/leaderboard/academic": { loaded: text("Semua kelas"), empty: text("Belum ada kursus yang diikuti.") },
  "/pet": { loaded: text("Koleksi"), empty: text("Pakaian") },
  "/profile": { loaded: text("Aruni Rasyid"), empty: text("Aruni Rasyid") },
  "/profile/edit": { loaded: text("Fakultas"), empty: text("Fakultas") },
  "/profile/reflections": { loaded: text(".*23 Nov 2026.*"), empty: text("Belum ada refleksi mingguan.") },
  "/settings": { loaded: text("Bahasa Indonesia"), empty: text("Tampilan"), unavailable: text("English") },
  "/settings/notifications": { loaded: text("Email opsional"), empty: text("Pengingat flashcard") },
  "/settings/notifications/browser": { loaded: text("Browser perangkat belum tersedia.") },
  "/students/[publicId]": { loaded: text("Nara Putri"), empty: text("Konten tidak tersedia atau akses berubah.") },
};
const communityStatic = new Set(["/feedback", "/settings", "/settings/notifications/browser"]);
for (const item of communityCases) {
  const marker = item.fixture === "unavailable" && !communityStatic.has(item.component)
    ? text("Koneksi bermasalah. Coba lagi.") : communityReady[item.component]?.[item.fixture];
  const key = `${item.component}:${item.fixture}`;
  const behavior: Record<string, Step[]> = {
    "/achievements:empty": [{ scroll: text("Belum ada lencana.") }],
    "/pet:empty": [{ tap: text("Pakaian") }, { assert: text("Belum ada item.") }],
    "/profile:empty": [{ scroll: text("Belum ada kelas yang diikuti.") }],
    "/profile/edit:empty": [{ scroll: id("student-profile-entry-year") }, { tap: id("student-profile-entry-year") }, { erase: 4 }, { input: "2024" }, { hideKeyboard: true }, { scroll: text("Simpan profil") }, { tap: text("Simpan profil") }, { assert: text("Profil tersimpan.") }],
    "/profile/reflections:loaded": [{ tap: text(".*23 Nov 2026.*") }, { assert: text(".*Pertumbuhan penguasaan.*12.*") }],
    "/settings:empty": [{ tap: text("Tampilan") }, { assert: text("Tema mengikuti pengaturan perangkat.") }],
    "/settings:unavailable": [{ tap: text("English") }, { assert: text("Koneksi bermasalah. Coba lagi.") }, { tap: text("English") }, { assert: text("Bahasa tersimpan.") }],
    "/settings/notifications:empty": [{ tap: text("Pengingat flashcard") }, { assert: text("Preferensi tersimpan.") }],
    "/dashboard/schedule:unavailable": [{ tap: text("Coba lagi") }, { assert: text("Sesi kelompok") }],
    "/feedback:loaded": [{ scroll: id("student-feedback-message") }],
    "/feedback:empty": [{ scroll: id("student-feedback-message") }, { tap: id("student-feedback-message") }, { input: "Materi membantu saya belajar." }, { hideKeyboard: true }, { scroll: text("Kirim masukan") }, { tap: text("Kirim masukan") }, { assert: text("Masukan terkirim.") }],
    "/feedback:unavailable": [{ scroll: id("student-feedback-message") }, { tap: id("student-feedback-message") }, { input: "Materi membantu saya belajar." }, { hideKeyboard: true }, { scroll: text("Kirim masukan") }, { tap: text("Kirim masukan") }, { assert: text("Pengiriman belum terkonfirmasi. Masukan mungkin sudah diterima.") }],
  };
  add("community", item.component, item.id, item.path, item.fixture, item.theme, marker,
    item.component === "/settings/notifications/browser" && !marker ?
      "This route has no empty or offline fixture data. Validating pause, browser permissions and return requires an injected browser handoff and device browser." :
      item.fixture === "unavailable" && communityStatic.has(item.component) ? "This route does not invoke a fixture read at entry." : undefined, behavior[key]);
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
  "/courses/[id]/concept/[slug]": text("Limit fungsi"),
  "/courses/[id]/flashcard": text("Semua flashcard terbit sudah Anda pelajari atau tidak ada kartu yang perlu diulas hari ini. Silakan kembali lagi nanti."),
  "/courses/[id]/mastery": text("Belum ada hasil per topik"),
  "/courses/[id]/path": text("Alur belajar akan tersedia setelah konten kelas diproses."),
  "/courses/[id]/playground": text("Buka Playground Python"),
  "/courses/[id]/progress": text("Progres belajar: Kalkulus Dasar"),
  "/courses/[id]/video": text("Video pembelajaran untuk mata kuliah ini belum tersedia."),
  "/courses/[id]/live": text("Belum ada sesi kuis langsung"),
};
for (const item of learningFixtureCases) {
  let marker: Marker | undefined;
  if (item.pattern === "/courses/[id]/live/host") marker = item.scenario === "offline" ? undefined : learningReady[item.pattern];
  else if (item.scenario === "offline") marker = text("Data belajar gagal dimuat. Periksa koneksi dan coba lagi.");
  else if (item.scenario === "no-enrollment" && item.pattern.startsWith("/courses/tutorial-pka")) marker = text("Pendaftaran ditutup");
  else if (item.pattern === "/courses/tutorial-pka/daftar" && item.scenario === "enrolled") marker = text("Mulai dari simulasi awal");
  else marker = item.scenario === "empty" ? learningEmpty[item.pattern] : learningReady[item.pattern];
  const steps: Step[] | undefined = item.scenario !== "empty" ? undefined :
    item.pattern === "/courses/[id]/concept/[slug]" ? [{ absent: text("Definisi") }, { absent: text("Fungsi real") }] :
    item.pattern === "/courses/[id]/progress" ? [{ scroll: text("Belum ada aktivitas belajar.") }] :
    item.pattern === "/courses/[id]/playground" ? [{ tap: text("Buka Playground Python") }, { assert: text("Editor Python tidak tersedia di aplikasi ini.") }] :
    item.pattern === "/courses/[id]/live/host" ? [{ tap: text("Buka halaman tutor") }, { assert: text("Halaman tutor tidak dapat dibuka.") }] : undefined;
  add("learning", item.pattern, item.id, item.path, item.scenario, item.theme, marker,
    item.pattern === "/courses/[id]/live/host" && item.scenario === "offline" ? "Host alias does not request a fixture resource; offline behavior requires a real browser handoff." : undefined, steps);
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
  const populated = listMarker ?? (
    component === "quizPlayer" ? id("student-assessment-option-0") :
    component === "solutions" ? id("student-assessment-reveal") :
    component === "results" ? id("student-assessment-native-completed-attempt") :
    component === "quiz" || component === "quizReview" || component === "quizSummary" || component === "summary" ? text("Fungsi, limit, dan turunan") :
    component === "tryout" || component === "review" ? text("Simulasi Ujian Tengah Semester") : undefined);
  const unavailable = ["quizSummary", "summary", "review", "solutions"].includes(component);
  const longQuestion = text(".*Jelaskan hubungan koefisien dengan perubahan gradien.*");
  const locked = text(unavailable ? "Asesmen tidak tersedia" : "Aktivasi token kelas");
  const longStart: Record<string, Marker> = {
    quizList: id("student-assessment-native-quiz"), quiz: id("student-assessment-start", true),
    quizPlayer: text("Fungsi, limit, dan turunan"), quizReview: text("Fungsi, limit, dan turunan"),
    quizSummary: text("Ringkasan hasil"), tryoutList: id("student-assessment-native-tryout"),
    tryout: text("Simulasi Ujian Tengah Semester"), results: id("student-assessment-native-completed-attempt"),
    review: text("Simulasi Ujian Tengah Semester"), summary: text("Ringkasan hasil"),
    solutions: text("Pembahasan turunan fungsi"),
  };
  const longSteps: Record<string, Step[]> = {
    quizList: [{ tap: id("student-assessment-native-quiz") }, { assert: id("student-assessment-start", true) }, { tap: id("student-assessment-start") }, { scroll: longQuestion }],
    quiz: [{ tap: id("student-assessment-start") }, { scroll: longQuestion }],
    quizPlayer: [{ scroll: longQuestion }], quizReview: [{ scroll: longQuestion }],
    quizSummary: [{ tap: text("Kembali") }, { scroll: longQuestion }],
    tryoutList: [{ tap: id("student-assessment-native-tryout") }, { scroll: longQuestion }],
    tryout: [{ scroll: longQuestion }],
    results: [{ tap: id("student-assessment-native-completed-attempt") }, { scroll: longQuestion }],
    review: [{ scroll: longQuestion }], summary: [{ tap: text("Kembali") }, { scroll: longQuestion }],
    solutions: [{ scroll: longQuestion }],
  };
  const marker = item.scenario === "locked" ? locked : item.scenario === "long" ? longStart[component] : populated;
  const steps: Step[] | undefined = item.scenario === "locked" ?
    unavailable ? [{ assert: text("Coba lagi") }] : [{ absent: id("student-assessment-start") }, { absent: id("student-assessment-option-0") }] :
    item.scenario === "long" ? longSteps[component] : undefined;
  add("assessment", pattern, item.id, item.path, item.scenario, item.theme, marker, undefined, steps);
}

// Offline is a distinct declared transport case. Its retry remains unavailable
// by design; the assertion checks both the error and the retry path.
for (const component of ["quizList", "quiz", "quizSummary", "tryoutList", "tryout", "results", "review", "summary", "solutions"] as const) {
  const path = assessmentFixturePaths[component];
  const pattern = matchStudentRoute(path)!.pattern;
  const unavailable = text("Asesmen belum dapat dimuat");
  add("assessment", pattern, `student.assessment.${component}.offline.light`, path, "offline", "light", unavailable, undefined,
    [{ tap: text("Coba lagi") }, { assert: unavailable }]);
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
  const element = (marker: Marker, indent: string) => `${indent}${"id" in marker ? `id: ${JSON.stringify(marker.id)}${marker.enabled === undefined ? "" : `\n${indent}enabled: ${marker.enabled}`}` : `text: ${JSON.stringify(marker.text)}`}`;
  const selector = element(entry.marker, "      ");
  const steps = (entry.steps ?? []).map((step) => {
    if ("tap" in step) return `- tapOn:\n${element(step.tap, "    ")}\n`;
    if ("assert" in step) return `- extendedWaitUntil:\n    visible:\n${element(step.assert, "      ")}\n    timeout: 30000\n`;
    if ("absent" in step) return `- assertNotVisible:\n${element(step.absent, "    ")}\n`;
    if ("scroll" in step) return `- scrollUntilVisible:\n    element:\n${element(step.scroll, "      ")}\n    direction: DOWN\n    timeout: 30000\n`;
    if ("input" in step) return `- inputText: ${JSON.stringify(step.input)}\n`;
    if ("hideKeyboard" in step) return "- hideKeyboard\n";
    return `- eraseText: ${step.erase}\n`;
  }).join("");
  const flow = `appId: com.zyx.academy.nativeparity\nname: ${name}\n---\n- launchApp:\n    clearState: true\n- extendedWaitUntil:\n    visible: separator\n    timeout: 30000\n- openLink: ${JSON.stringify(url)}\n- extendedWaitUntil:\n    visible:\n${selector}\n    timeout: 30000\n${steps}- takeScreenshot: ${name}\n`;
  await writeFile(join(out, entry.area, `${name}.yaml`), flow);
  Object.assign(entry, { flow: `${entry.area}/${name}.yaml`, testName: name, capture: `${name}.png` });
}
const routes = webRoutes.map(source => ({ source, cases: cases.filter(item => item.source === source) }));
if (routes.some(route => !route.cases.length)) throw new Error("A Student route has no declared fixture scenario");
const sourceHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const workflowRun = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null;
await writeFile(join(out, "manifest.json"), JSON.stringify({ status: "generated_not_executed", sourceHead, workflowRun,
  limitations: ["A requested theme is not independently verified by a screenshot assertion.",
    "Smoke checks do not establish permission behavior, parity, or backend integration."], routes }, null, 2) + "\n");
console.log(JSON.stringify({ routes: routes.length, cases: cases.length, ready: cases.filter(item => item.marker).length, blocked: cases.filter(item => !item.marker).length }));
