import { dirname, join } from "node:path";
import { notificationId } from "./inbox-fixture";
import { fixtureOrigin } from "./scope";
import { startAuthFixture } from "./server";

const [certificate, key, maestro, device] = process.argv.slice(2);
const flows = ".maestro/native-integration/authenticated";
let fixture: Awaited<ReturnType<typeof startAuthFixture>> | undefined;
let step = "open the runner-local HTTPS browser fixture";
let lastDeviceCheck = "none";

async function runFlow(name: string, inputs: string[] = []) {
  const privateDir = dirname(key);
  const child = Bun.spawn([maestro, "--platform", "android", "--device", device, "test",
    "--debug-output", join(privateDir, name + "-debug"), "--test-output-dir", join(privateDir, name + "-results"),
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
      ["Masuk dengan Google", "native sign-in button"],
      ["Native Preview Sign-in", "browser sign-in form"],
      ["student-dashboard-preview", "Student dashboard"],
      ["student-inbox", "Student inbox"],
      ["Kamu sudah keluar", "sign-out"],
    ] as const) {
      if (output.includes(needle)) lastDeviceCheck = label;
    }
    throw new Error();
  } finally {
    clearTimeout(timeout);
  }
}

try {
  if (!certificate || !key || !maestro || !device || !/^emulator-\d+$/.test(device)) throw new Error();
  fixture = await startAuthFixture(certificate, key, { studentProduct: true });
  const chrome = Bun.spawn(["adb", "-s", device, "shell", "am", "start", "-W", "-a", "android.intent.action.VIEW",
    "-d", fixtureOrigin + "/__preview/health", "-p", "com.android.chrome"], { stdout: "ignore", stderr: "ignore" });
  if (await chrome.exited !== 0) throw new Error();
  await runFlow("browser-trust");
  if (!fixture.browserTrustVerified()) throw new Error();
  console.log("Verified Chrome trusts the runner-local HTTPS certificate");

  step = "complete browser login, open the Student dashboard, mark a notification read and sign out";
  await runFlow("student", ["-e", `PREVIEW_CLAIM=${fixture.claim}`, "-e", `PREVIEW_INBOX_ROW=student-inbox-row-${notificationId}`]);
  step = "verify the dashboard, recipient-scoped inbox update and revoked session";
  if (!await fixture.verifiedAndRevoked()) throw new Error();
  console.log("Android completed a real browser handoff, opened the Student dashboard, marked one inbox row read and revoked the native session");
} catch {
  console.error("Authenticated Android preview could not " + step +
    " (device check: " + lastDeviceCheck + ", last server stage: " + (fixture?.progress() ?? "none") + ")");
  process.exitCode = 1;
} finally {
  await fixture?.stop();
}
