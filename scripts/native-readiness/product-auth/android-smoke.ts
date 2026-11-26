import { dirname, join } from "node:path";
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

async function connectOfflineFixture() {
  await emulator("reverse", "tcp:9443", "tcp:9443");
  await emulator("shell", "cmd", "connectivity", "airplane-mode", "disable");
  await emulator("shell", "svc", "wifi", "enable");
}

async function disconnectOfflineFixture() {
  await emulator("reverse", "--remove", "tcp:9443");
  await emulator("shell", "cmd", "connectivity", "airplane-mode", "enable");
  await emulator("shell", "svc", "wifi", "disable");
}

async function runFlow(name: string, inputs: string[] = [], label = name) {
  const privateDir = dirname(key);
  const child = Bun.spawn([maestro, "--platform", "android", "--device", device, "test",
    "--debug-output", join(privateDir, label + "-debug"), "--test-output-dir", join(privateDir, label + "-results"),
    ...inputs, join(flows, name + ".yaml")], {
    stdout: "pipe",
    stderr: "ignore",
    env: { ...process.env, MAESTRO_CLI_NO_ANALYTICS: "true", MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: "true" },
  });
  const timeout = setTimeout(() => child.kill(), 210_000);
  try {
    const [exit, output] = await Promise.all([child.exited, new Response(child.stdout).text()]);
    if (exit === 0) return;
    // Only emit a fixed label for a failed command, never a secret or future command.
    const failedCommand = output.split(/\r?\n/).findLast(line => /❌|\bFAILED\b/.test(line)) ?? "";
    for (const [needle, label] of [
      ["Preview HTTPS ready", "Chrome health page"],
      ["native-auth-google", "native sign-in button"],
      ["Native Preview Sign-in", "browser sign-in form"],
      ["Runner code", "browser claim input"],
      ["Continue as preview", "browser form submission"],
      ["student-dashboard-preview", "Student dashboard"],
      ["student-inbox", "Student inbox"],
      ["PREVIEW_RECORD", "protected staff read"],
      ["Kuis Live Preview", "Tutor live quiz"],
      ["Kuis selesai", "Tutor live conclusion"],
      ["Diktat verifikasi offline", "saved reading"],
      ["offline-library-list", "offline library"],
      ["Akses ditolak", "wrong-role screen"],
      ["Kamu sudah keluar", "sign-out"],
    ] as const) {
      if (failedCommand.includes(needle)) lastDeviceCheck = label;
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
  const logs = await shellOutput("logcat", "-d", "-t", "400", "ReactNativeJS:I", "ActivityTaskManager:I", "*:S");
  const focus = await shellOutput("shell", "dumpsys", "activity", "activities");
  const focused = focus.split("\n").find(line => /(?:m|top)ResumedActivity/.test(line));
  const screen = focused?.includes("com.android.chrome") ? "Chrome"
    : focused?.includes("com.zyx.academy.nativeparity") ? "Expo" : "other";
  const opened = logs.includes("ZYX_AUTH_PREVIEW_BROWSER_OPEN");
  const failed = logs.includes("ZYX_AUTH_PREVIEW_BROWSER_FAILED");
  console.error("Android diagnostic: " + screen + " foreground, native browser " +
    (failed ? "reported failure" : opened ? "requested" : "not requested"));
}

try {
  if (!certificate || !key || !maestro || !device || !/^emulator-\d+$/.test(device)) throw new Error();
  const offlineProduct = process.env.NATIVE_PRODUCT_AUTH_ROLE === "offline";
  const staff = offlineProduct ? undefined : staffRole(process.env.NATIVE_PRODUCT_AUTH_ROLE);
  fixture = await startAuthFixture(certificate, key, { studentProduct: !staff && !offlineProduct, staff, offlineProduct });
  const chrome = Bun.spawn(["adb", "-s", device, "shell", "am", "start", "-W", "-a", "android.intent.action.VIEW",
    "-d", fixtureOrigin + "/__preview/health", "-p", "com.android.chrome"], { stdout: "ignore", stderr: "ignore" });
  if (await chrome.exited !== 0) throw new Error();
  await runFlow("browser-trust", [], `${process.env.NATIVE_PRODUCT_AUTH_ROLE ?? "student"}-browser-trust`);
  if (!fixture.browserTrustVerified()) throw new Error();
  console.log("Verified Chrome trusts the runner-local HTTPS certificate");

  if (offlineProduct) {
    try {
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
  } else if (staff) {
    const selected = staffRoles[staff];
    const opposite = staffRoles[oppositeStaffRole(staff)];
    const scheme = "zyx-native-parity://";
    const inputs = Object.entries({
      PREVIEW_SIGN_IN_URL: `${scheme}sign-in?next=${encodeURIComponent(selected.route)}&locale=id`,
      PREVIEW_CLAIM: fixture.claim,
      PREVIEW_BROWSER_BUTTON: `Continue as preview ${staff}`,
      PREVIEW_RECORD: selected.recordTitle,
      PREVIEW_OTHER_RECORD: opposite.recordTitle,
      PREVIEW_WRONG_ROLE_URL: scheme + opposite.route.slice(1),
      PREVIEW_READ_URL: scheme + selected.route.slice(1),
      PREVIEW_TUTOR_LIVE: staff === "tutor" ? "true" : "false",
    }).flatMap(([name, value]) => ["-e", `${name}=${value}`]);
    step = `complete ${selected.label} browser login, read data, reject the wrong role and sign out`;
    await runFlow("staff", inputs, staff);
    step = `verify the ${selected.label} account context, database record, opposite-role HTTP denial and revocation`;
    if (!await fixture.verifiedAndRevoked()) throw new Error();
    if (staff === "tutor") {
      step = "verify room ownership, one command per phase and the Tutor socket reconnect";
      if (!await fixture.verifiedTutorLive()) throw new Error();
      console.log("Android opened a Tutor room with the loopback Worker, recovered after reopen and socket interruption, and ended the quiz");
    }
    console.log(`Android verified ${selected.label} login, a protected read, opposite-role denial and session revocation`);
  } else {
    step = "complete browser login, open the Student dashboard, mark a notification read and sign out";
    await runFlow("student", ["-e", `PREVIEW_CLAIM=${fixture.claim}`, "-e", `PREVIEW_INBOX_ROW=student-inbox-row-${notificationId}`]);
    step = "verify the dashboard, recipient-scoped inbox update and revoked session";
    if (!await fixture.verifiedAndRevoked()) throw new Error();
    console.log("Android completed a real browser handoff, opened the Student dashboard, marked one inbox row read and revoked the native session");
  }
} catch {
  await reportDeviceState().catch(() => {});
  console.error("Authenticated Android preview could not " + step +
    " (device check: " + lastDeviceCheck + ", last server stage: " + (fixture?.progress() ?? "none") + ")");
  process.exitCode = 1;
} finally {
  await fixture?.stop();
}
