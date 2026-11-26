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
    // Only emit fixed labels, never Maestro output or the browser form argument.
    for (const [needle, label] of [
      ["Preview HTTPS ready", "Chrome health page"],
      ["native-auth-google", "native sign-in button"],
      ["Native Preview Sign-in", "browser sign-in form"],
      ["student-dashboard-preview", "Student dashboard"],
      ["student-inbox", "Student inbox"],
      ["PREVIEW_RECORD", "protected staff read"],
      ["Akses ditolak", "wrong-role screen"],
      ["Kamu sudah keluar", "sign-out"],
    ] as const) {
      if (output.includes(needle)) lastDeviceCheck = label;
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
  const focus = await shellOutput("shell", "dumpsys", "window", "windows");
  const focused = focus.split("\n").find(line => line.includes("mCurrentFocus"));
  const screen = focused?.includes("com.android.chrome") ? "Chrome"
    : focused?.includes("com.zyx.academy.nativeparity") ? "Expo" : "other";
  const opened = logs.includes("ZYX_AUTH_PREVIEW_BROWSER_OPEN");
  const failed = logs.includes("ZYX_AUTH_PREVIEW_BROWSER_FAILED");
  console.error("Android diagnostic: " + screen + " foreground, native browser " +
    (failed ? "reported failure" : opened ? "requested" : "not requested"));
}

try {
  if (!certificate || !key || !maestro || !device || !/^emulator-\d+$/.test(device)) throw new Error();
  const staff = staffRole(process.env.NATIVE_PRODUCT_AUTH_ROLE);
  fixture = await startAuthFixture(certificate, key, { studentProduct: !staff, staff });
  const chrome = Bun.spawn(["adb", "-s", device, "shell", "am", "start", "-W", "-a", "android.intent.action.VIEW",
    "-d", fixtureOrigin + "/__preview/health", "-p", "com.android.chrome"], { stdout: "ignore", stderr: "ignore" });
  if (await chrome.exited !== 0) throw new Error();
  await runFlow("browser-trust", [], staff ? `${staff}-browser-trust` : "browser-trust");
  if (!fixture.browserTrustVerified()) throw new Error();
  console.log("Verified Chrome trusts the runner-local HTTPS certificate");

  if (staff) {
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
    }).flatMap(([name, value]) => ["-e", `${name}=${value}`]);
    step = `complete ${selected.label} browser login, read data, reject the wrong role and sign out`;
    await runFlow("staff", inputs, staff);
    step = `verify the ${selected.label} account context, database record, opposite-role HTTP denial and revocation`;
    if (!await fixture.verifiedAndRevoked()) throw new Error();
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
