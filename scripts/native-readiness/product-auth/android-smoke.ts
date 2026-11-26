import { createHash, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { EXPO_STAGING_SCHEME } from "@/lib/native/expo-auth-config";
import { notificationId } from "./inbox-fixture";
import { fixtureOrigin } from "./scope";
import { startAuthFixture } from "./server";
import { oppositeStaffRole, staffRole, staffRoles } from "./staff-role";

const [certificate, key, maestro, device] = process.argv.slice(2);
const flows = ".maestro/native-integration/authenticated";
let fixture: Awaited<ReturnType<typeof startAuthFixture>> | undefined;
let step = "open the runner-local HTTPS browser fixture";
let lastDeviceCheck = "none";

async function emulator(...args: string[]) {
  const child = Bun.spawn(["adb", "-s", device, ...args], { stdout: "ignore", stderr: "ignore" });
  const timeout = setTimeout(() => child.kill(), 10_000);
  try {
    if (await child.exited !== 0) throw new Error();
  } finally {
    clearTimeout(timeout);
  }
}

function openChrome(url: string) {
  return emulator("shell", "am", "start", "-W", "-a", "android.intent.action.VIEW", "-d", url, "-p", "com.android.chrome");
}

async function connectOfflineFixture() {
  await emulator("reverse", "tcp:9443", "tcp:9443");
  await emulator("shell", "cmd", "connectivity", "airplane-mode", "disable");
  await emulator("shell", "svc", "wifi", "enable");
  await emulator("shell", "svc", "data", "enable");
}

async function disconnectOfflineFixture() {
  await emulator("reverse", "--remove", "tcp:9443");
  await emulator("shell", "cmd", "connectivity", "airplane-mode", "enable");
  await emulator("shell", "svc", "wifi", "disable");
  await emulator("shell", "svc", "data", "disable");
}

async function runFlow(name: string, inputs: string[] = [], label = name) {
  const privateDir = dirname(key);
  const child = Bun.spawn([maestro, "--platform", "android", "--device", device, "test",
    "--debug-output", join(privateDir, label + "-debug"), "--test-output-dir", join(privateDir, label + "-results"),
    ...inputs, join(flows, name + ".yaml")], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, MAESTRO_CLI_NO_ANALYTICS: "true", MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: "true" },
  });
  const timeout = setTimeout(() => child.kill(), 210_000);
  try {
    const [exit, output, errors] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    if (exit === 0) return;
    // Only emit a fixed label for a failed command, never a secret or future command.
    const failedCommands = [output, errors].flatMap(stream => stream.split(/\r?\n/)
      .filter(line => /❌|\bFAILED\b|Assertion is false|Element not found/i.test(line)).slice(-5));
    for (const [needle, label] of [
      ["Preview HTTPS ready", "Chrome health page"],
      ["native-auth-google", "native sign-in button"],
      ["Native Preview Sign-in", "browser sign-in form"],
      ["Runner code", "browser claim input"],
      ["Continue as preview", "browser form submission"],
      ["Zyx Academy", "browser return link"],
      ["student-dashboard-preview", "Student dashboard"],
      ["student-inbox", "Student inbox"],
      ["PREVIEW_RECORD", "protected staff read"],
      ["Preview Tutor Course", "protected Tutor read"], ["Preview Admin Form", "protected Admin read"],
      ["native-account-add", "add saved account"], ["native-saved-account-0", "select saved account"],
      ["native-account-confirm-remove", "confirm saved-account removal"],
      ["admin-navbar-ops-ai", "Admin Ops AI entry"], ["admin-ops-ai-input", "Admin Ops AI composer"],
      ["Formulir preview tersedia", "Admin Ops AI Ask response"], ["Izinkan sekali", "Admin Ops AI proposal"],
      ["Aksi selesai", "Admin Ops AI action outcome"],
      ["navbar-account", "staff account menu"], ["Expo Preview", "staff account name"],
      ["role-account-profile", "staff profile shortcut"], ["role-account-preferences", "staff settings shortcut"],
      ["Pengaturan", "staff settings"], ["Settings", "staff settings"], ["Bahasa", "language selector"],
      ["role-account-sign-out", "staff sign-out shortcut"],
      ["Profil akademis", "signed staff profile"], ["Academic profile", "signed staff profile"],
      ["Kuis Live Preview", "Tutor live quiz"],
      ["Buka ruang tunggu", "Tutor opens lobby"], ["1 peserta", "Tutor lobby participant"],
      ["Soal Live Preview", "Tutor live question"], ["menjawab", "Tutor live answer count"],
      ["Seleksi Preview", "Tutor question source"], ["Tampilkan jawaban", "Tutor reveal action"],
      ["Akhiri kuis", "Tutor ends quiz"],
      ["native-reading-screen", "Student native reading"],
      ["pet-scene-rendered", "Pet Studio first rendered 3D frame"], ["Latihan berhitung", "Pet practice"],
      ["Benar 1", "Pet practice score"],
      ["artikel kanonis", "canonical Article body"],
      ["diktat PKA", "canonical PKA Diktat body"],
      ["student-open-material-pdf", "Student PDF open"],
      ["student-material-pdf-page", "Student PDF page indicator"],
      ["student-pdf-open-previews", "Student PDF previews control"],
      ["student-pdf-thumbnail", "Student PDF local thumbnail"],
      ["student-pdf-note", "Student private PDF note"],
      ["student-pdf-search", "Student authorized PDF text search"],
      ["Lintasan uji Article", "signed Article scene entry"],
      ["student-solution-scene", "signed Article scene surface"],
      ["Perpindahan uji", "signed Article scene readout"],
      ["student-close-article-visual", "signed Article scene return"],
      ["Kuis selesai", "Tutor live conclusion"],
      ["(Simpan|Save) Diktat verifikasi offline", "offline save action"],
      ["(Hapus|Remove) Diktat verifikasi offline", "offline saved state"],
      ["Masuk untuk melihat bacaan Anda", "signed-out offline entry"],
      ["^(Masuk|Sign in)$", "offline sign-in action"],
      ["offline-library-list", "offline library"],
      ["Akses ditolak", "wrong-role screen"],
      ["Kamu sudah keluar", "sign-out"],
    ] as const) {
      if (failedCommands.some(line => line.includes(needle))) lastDeviceCheck = label;
    }
    throw new Error();
  } finally {
    clearTimeout(timeout);
  }
}

async function reportDeviceState() {
  if (!device || !/^emulator-\d+$/.test(device)) return;
  const shellOutput = async (...args: string[]) => {
    const child = Bun.spawn(["adb", "-s", device, ...args], { stdout: "pipe", stderr: "ignore" });
    const timeout = setTimeout(() => child.kill(), 6_000);
    try { return await new Response(child.stdout).text(); }
    finally { clearTimeout(timeout); }
  };
  const logs = await shellOutput("logcat", "-d", "-t", "400", "ReactNativeJS:I", "ReactNative:E", "AndroidRuntime:E", "ActivityTaskManager:I", "*:S");
  const focus = await shellOutput("shell", "dumpsys", "activity", "activities");
  const focused = focus.split("\n").find(line => /(?:m|top)ResumedActivity/.test(line));
  const screen = focused?.includes("com.android.chrome") ? "Chrome"
    : focused?.includes("com.zyx.academy.nativeparity") ? "Expo" : "other";
  const opened = logs.includes("ZYX_AUTH_PREVIEW_BROWSER_OPEN");
  const failed = logs.includes("ZYX_AUTH_PREVIEW_BROWSER_FAILED");
  console.error("Android diagnostic: " + screen + " foreground, native browser " +
    (failed ? "reported failure" : opened ? "requested" : "not requested"));
  if (screen === "Chrome") {
    const hierarchy = await shellOutput("exec-out", "uiautomator", "dump", "/dev/tty");
    // Chrome's hierarchy can contain the URL, handoff or claim. Report only
    // known static UI and control presence. Never write or upload the raw tree.
    const visible = [
      ["Native Preview Sign-in", "preview document"], ["Runner code", "runner label"],
      ["android.widget.EditText", "text editor"], ["password=\"true\"", "password field"],
      ["focused=\"true\"", "focus"], ["Continue as preview", "preview submit"],
      ["Open Zyx Academy", "return link"], ["Buka Zyx Academy", "return link"],
      ["Use without an account", "Chrome setup"], ["Your connection is not private", "TLS warning"],
    ].filter(([needle]) => hierarchy.includes(needle)).map(([, label]) => label);
    console.error("Chrome accessibility snapshot: " + (visible.join(", ") || "no recognized controls"));
  } else if (screen === "Expo") {
    const hierarchy = await shellOutput("exec-out", "uiautomator", "dump", "/dev/tty");
    const visible = [
      ["student-material-pdf-screen", "Student PDF reader"],
      ["student-material-pdf-prepare-error", "Student PDF file preparation error"],
      ["student-material-pdf-render-error", "Student PDF native rendering error"],
      ["student-material-pdf-access-error", "Student PDF access ended"],
      ["student-material-pdf-page", "Student PDF page indicator"],
      ["student-pdf-open-previews", "Student PDF previews control"],
      ["student-pdf-note-input", "Student PDF note editor"],
      ["student-pdf-query", "Student PDF search input"],
      ["Bacaan offline", "offline library title"], ["Offline readings", "offline library title"],
      ["Diktat verifikasi offline", "offline Diktat title"], ["Simpan Diktat", "offline save action"],
      ["Hapus Diktat", "offline saved state"], ["Periksa pembaruan", "online refresh action"],
      ["Belum ada bacaan", "offline empty state"], ["Pembaruan belum berhasil", "offline sync error"],
      ["Hubungkan ke internet", "offline verification message"], ["Masuk", "sign-in control"],
      ["Memuat bacaan", "library loading"], ["Loading readings", "library loading"],
      ["belum dapat dimuat", "library storage or access failure"], ["Could not load the reading list", "library storage or access failure"],
      ["murid.", "Student access gate"], ["available to students", "Student access gate"],
      ["Halaman yang diminta belum tersedia", "login return unavailable"], ["requested page is not available", "login return unavailable"],
      ["tidak memiliki akses ke halaman", "login return denied"], ["does not have access to the requested", "login return denied"],
      ["Memeriksa akun", "account verification"], ["Masuk untuk melihat bacaan Anda", "offline sign-in gate"],
      ["native-auth-google", "signed-out entry"], ["student-dashboard", "Student dashboard"],
      ["native-saved-accounts", "saved accounts"], ["native-account-add", "add account"],
      ["tutor-navbar-account", "Tutor navigation"], ["admin-navbar-account", "Admin navigation"],
      ["Preview Tutor Course", "Tutor protected record"], ["Preview Admin Form", "Admin protected record"],
      ["role-account-preferences", "staff account menu"], ["Profil akademis", "staff profile"],
      ["Kuis Live Preview", "Tutor live activity"], ["admin-ops-ai-input", "Admin Ops AI chat"],
      ["Akses ditolak", "wrong role denied"], ["Access denied", "wrong role denied"],
      ["native-tour", "guided tour"], ["Sign in", "sign-in control"], ["Dashboard", "dashboard navigation"],
      ["offline-library-list", "library collection"], ["Coba lagi", "retry action"], ["Try again", "retry action"],
    ].filter(([needle]) => hierarchy.includes(needle)).map(([, label]) => label);
    const snapshot = hierarchy.includes("<hierarchy") ? "loaded" : "unavailable";
    const faults = ["ReactNativeJS: TypeError", "TypeError:", "RangeError:", "Maximum update depth", "SQLiteException",
      "FATAL EXCEPTION", "JavascriptException", "ReferenceError:", "Invariant Violation"].filter(kind => logs.includes(kind));
    console.error("Expo accessibility snapshot (" + snapshot + "): " + ([...new Set(visible)].join(", ") || "no recognized controls"));
    if (faults.length) console.error("Android error categories: " + faults.join(", "));
  }
}

try {
  if (!certificate || !key || !maestro || !device || !/^emulator-\d+$/.test(device)) throw new Error();
  const offlineProduct = process.env.NATIVE_PRODUCT_AUTH_ROLE === "offline";
  const chromeProbe = process.env.NATIVE_PRODUCT_AUTH_ROLE === "probe";
  const savedAccountsProduct = process.env.NATIVE_PRODUCT_AUTH_ROLE === "saved-accounts";
  const staff = offlineProduct || chromeProbe || savedAccountsProduct ? undefined : staffRole(process.env.NATIVE_PRODUCT_AUTH_ROLE);
  fixture = await startAuthFixture(certificate, key, {
    studentProduct: !staff && !offlineProduct && !chromeProbe && !savedAccountsProduct, staff, offlineProduct, savedAccountsProduct,
  });
  await openChrome(fixtureOrigin + "/__preview/health");
  await runFlow("browser-trust", [], `${process.env.NATIVE_PRODUCT_AUTH_ROLE ?? "student"}-browser-trust`);
  if (!fixture.browserTrustVerified()) throw new Error();
  console.log("Verified Chrome trusts the runner-local HTTPS certificate");

  if (chromeProbe) {
    step = "submit a one-time claim in Chrome and complete the real native browser handoff";
    const verifier = randomBytes(32).toString("hex");
    const query = new URLSearchParams({ scheme: EXPO_STAGING_SCHEME, next: "/dashboard",
      state: randomBytes(24).toString("hex"), challenge: createHash("sha256").update(verifier).digest("base64url") });
    // adb passes intent arguments through the device shell. Keep the path and
    // query in one argument. The verifier and runner claim stay out of the URL.
    await openChrome(`'${fixtureOrigin}/api/auth/native/start?${query}'`);
    await runFlow("browser-claim", ["-e", `PREVIEW_CLAIM=${fixture.claim}`]);
    await runFlow("browser-return-ready");
    const deadline = Date.now() + 8_000;
    while (fixture.progress() !== "browser completion" && Date.now() < deadline) await Bun.sleep(100);
    if (fixture.progress() !== "browser completion") throw new Error();
    console.log("Chrome reached the real app return page on runner-local HTTPS");
  } else if (offlineProduct) {
    try {
      await connectOfflineFixture();
      step = "sign in as a Student and save the authorized reading";
      await runFlow("offline/download", ["-e", `PREVIEW_CLAIM=${fixture.claim}`], "offline-download");
      step = "show the saved reading after a disconnected cold start";
      await disconnectOfflineFixture();
      await runFlow("offline/cold-reading", [], "offline-cold-reading");
      step = "withdraw the seeded enrollment and confirm delivery in the live sync response";
      await fixture.withdrawOfflineEnrollment();
      await connectOfflineFixture();
      await runFlow("offline/revoked", [], "offline-revoked");
      if (!fixture.sawOfflineRevocation()) throw new Error();
      step = "keep the revoked reading out of the disconnected library after a second cold start";
      await disconnectOfflineFixture();
      await runFlow("offline/cold-revoked", [], "offline-cold-revoked");
    } finally {
      await connectOfflineFixture();
    }
    step = "sign out and verify the same Student session is revoked";
    await runFlow("offline/sign-out", [], "offline-sign-out");
    if (!await fixture.verifiedAndRevoked()) throw new Error();
    console.log("Android verified a Student download, two disconnected cold starts, enrollment withdrawal and session revocation");
  } else if (savedAccountsProduct) {
    const [first, second] = fixture.savedAccountClaims ?? [];
    if (!first || !second || first === second) throw new Error();
    step = "sign in as the first identity and open the authorized Tutor course";
    await runFlow("saved-accounts-login", ["-e", `PREVIEW_CLAIM=${first}`]);
    step = "add the second identity and open the authorized Admin form";
    await runFlow("saved-accounts-add", ["-e", `PREVIEW_CLAIM=${second}`]);
    step = "switch back, remove the inactive account and restore the original account after restart";
    await runFlow("saved-accounts-switch-remove");
    step = "verify both assigned audiences, the retained Tutor session and the revoked Admin session";
    if (!await fixture.verifiedSavedAccounts()) throw new Error();
    console.log("Android verified two distinct saved accounts, changed roles, revoked the removed account and restored the retained session after restart");
  } else if (staff) {
    const selected = staffRoles[staff];
    const opposite = staffRoles[oppositeStaffRole(staff)];
    const scheme = "zyx-native-parity://";
    const inputs = Object.entries({
      PREVIEW_SIGN_IN_URL: `${scheme}sign-in?next=${encodeURIComponent(selected.route)}&locale=id`,
      PREVIEW_CLAIM: fixture.claim,
      PREVIEW_RECORD: selected.recordTitle,
      PREVIEW_OTHER_RECORD: opposite.recordTitle,
      PREVIEW_WRONG_ROLE_URL: scheme + opposite.route.slice(1),
      PREVIEW_READ_URL: scheme + selected.route.slice(1),
    }).flatMap(([name, value]) => ["-e", `${name}=${value}`]);
    step = `complete ${selected.label} browser login and open the protected record`;
    await runFlow("staff", inputs, `${staff}-login`);
    step = staff === "tutor" ? "exercise the authorized Tutor live quiz" : "exercise Admin Ops AI and approve the fixture action";
    await runFlow(staff === "tutor" ? "tutor-live" : "admin-ops-ai");
    step = `reject the opposite role, view ${selected.label} settings and profile, and sign out`;
    await runFlow("staff-profile-sign-out", inputs, `${staff}-profile-sign-out`);
    step = `verify the ${selected.label} account context, database record, opposite-role HTTP denial and revocation`;
    if (!await fixture.verifiedAndRevoked()) throw new Error();
    if (staff === "tutor") {
      step = "verify room ownership, one command per phase and the Tutor socket reconnect";
      if (!await fixture.verifiedTutorLive()) throw new Error();
      console.log("Android opened a Tutor room with the loopback Worker, recovered after reopen and socket interruption, and ended the quiz");
    }
    if (staff === "admin") {
      step = "verify the approved Ops AI action created the fixture form with responses closed";
      if (!await fixture.verifiedAdminOpsAi()) throw new Error();
      console.log("Android streamed a synthetic Ops AI response and approved a signed plan through the canonical Admin endpoint");
    }
    console.log(`Android verified ${selected.label} login, a protected read, opposite-role denial and session revocation`);
  } else {
    step = "complete browser login, open the Student dashboard and mark a notification read";
    await runFlow("student", ["-e", `PREVIEW_CLAIM=${fixture.claim}`, "-e", `PREVIEW_INBOX_ROW=student-inbox-row-${notificationId}`]);
    step = "read the admitted Article and registered PKA Diktat";
    await runFlow("student-reading");
    step = "open the private PDF and use previews, notes and search";
    await runFlow("student-pdf-controls");
    if (!fixture.verifiedOnlinePdfSearch()) throw new Error("The signed PDF search did not return its page-scoped match");
    console.log("Android previewed a private PDF page, reopened its note and bookmark, and jumped to its authorized text match");
    step = "change the authorized Article scene and return to reading";
    await runFlow("student-reading-widget");
    console.log("Android changed a signed Article scene from 0 m to 3 m and returned to the reader");
    step = "withdraw the runner-only enrollment and PKA registration";
    await fixture.revokeOnlineReading();
    step = "reject the withdrawn Article from the normal Android document route";
    await runFlow("student-reading-denied");
    if (!fixture.verifiedOnlineReading()) throw new Error();
    console.log("Android displayed the current Article and PKA Diktat, received the admitted image and denied the withdrawn reading");
    step = "load the equipped Pet Studio model, rotate it and solve a practice question";
    await runFlow("student-pet");
    if (!fixture.verifiedPetScene()) throw new Error("The signed pet read and credential-free model load were not both observed");
    console.log("Android rendered the equipped Student mascot and completed one mental-math round");
    step = "sign out from the Student account menu";
    await runFlow("student-sign-out");
    step = "verify the dashboard, recipient-scoped inbox update and revoked session";
    if (!await fixture.verifiedAndRevoked()) throw new Error();
    console.log("Android completed a real browser handoff, opened the Student dashboard, marked one inbox row read and revoked the native session");
  }
} catch {
  await reportDeviceState().catch(() => {});
  console.error("Authenticated Android preview could not " + step +
    " (device check: " + lastDeviceCheck + ", last server stage: " + (fixture?.progress() ?? "none") + ")");
  if (fixture?.readingProgress()) console.error("Reading fixture: " + fixture.readingProgress());
  process.exitCode = 1;
} finally {
  if (fixture) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      // Assertions and revocation checks have completed. Release client sockets
      // before stopping their loopback listener, also when a test failed.
      if (process.env.NATIVE_PRODUCT_AUTH_ROLE !== "probe") await emulator("shell", "am", "force-stop", "com.zyx.academy.nativeparity");
      await Promise.race([fixture.stop(), new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Fixture shutdown timed out")), 35_000);
      })]);
      console.log("Closed the loopback listener and PostgreSQL pool");
    } catch {
      console.error("Authenticated Android fixture could not close its listener and PostgreSQL pool");
      process.exitCode = 1;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
// A completed fixture cannot hold the next Android role open through an idle
// SDK handle. This script runs as an isolated process for each role.
process.exit(process.exitCode ?? 0);
