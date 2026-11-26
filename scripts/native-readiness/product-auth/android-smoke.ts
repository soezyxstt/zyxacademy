import { dirname, join } from "node:path";
import { notificationId } from "./inbox-fixture";
import { startAuthFixture } from "./server";

const [certificate, key, maestro, device] = process.argv.slice(2);
let fixture: Awaited<ReturnType<typeof startAuthFixture>> | undefined;
let step = "open the runner-local HTTPS browser fixture";
try {
  if (!certificate || !key || !maestro || !device || !/^emulator-\d+$/.test(device)) throw new Error();
  fixture = await startAuthFixture(certificate, key, { studentProduct: true });
  step = "complete browser login, open the Student dashboard, mark a notification read and sign out";
  const flow = ".maestro/native-integration/authenticated/student.yaml";
  const privateDir = dirname(key);
  const child = Bun.spawn([maestro, "--platform", "android", "--device", device, "test",
    "--debug-output", join(privateDir, "maestro-debug"), "--test-output-dir", join(privateDir, "maestro-results"),
    "-e", `PREVIEW_CLAIM=${fixture.claim}`, "-e", `PREVIEW_INBOX_ROW=student-inbox-row-${notificationId}`, flow], {
    stdout: "ignore",
    stderr: "ignore",
    env: { ...process.env, MAESTRO_CLI_NO_ANALYTICS: "true", MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: "true" },
  });
  const timeout = setTimeout(() => child.kill(), 210_000);
  let exit: number;
  try {
    exit = await child.exited;
  } finally {
    clearTimeout(timeout);
  }
  if (exit !== 0) throw new Error();
  step = "verify the dashboard, recipient-scoped inbox update and revoked session";
  if (!await fixture.verifiedAndRevoked()) throw new Error();
  console.log("Android completed a real browser handoff, opened the Student dashboard, marked one inbox row read and revoked the native session");
} catch {
  console.error("Authenticated Android preview could not " + step + " (last server stage: " + (fixture?.progress() ?? "none") + ")");
  process.exitCode = 1;
} finally {
  await fixture?.stop();
}
