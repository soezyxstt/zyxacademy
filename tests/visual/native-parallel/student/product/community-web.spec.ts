import { expect, test, type Page } from "@playwright/test";
import { stubVisualTelemetry } from "../../../telemetry-stubs";
import { waitForVisualReadiness } from "../../../visual-readiness";
import { localStudentCookie } from "./session";

const base = process.env.STUDENT_COMMUNITY_HTTP_BASE;
test.skip(!base, "Opt-in synthetic Student product server");
test.setTimeout(240_000);
test.use({ locale: "id-ID", contextOptions: { reducedMotion: "reduce" } });

async function open(page: Page, scenario: "enrolled" | "unenrolled" | "revoked", path: string) {
  const origin = new URL(base!);
  if (!["127.0.0.1", "localhost"].includes(origin.hostname)) throw new Error("Expected loopback Student product server");
  const { name, value } = await localStudentCookie(scenario);
  await page.context().addCookies([{ name, value, url: origin.href, httpOnly: true, sameSite: "Lax" }]);
  await stubVisualTelemetry(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => {
    if (response.status() >= 400 && new URL(response.url()).origin === origin.origin) errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  const response = await page.goto(new URL(path, origin).href, { waitUntil: "domcontentloaded", timeout: 200_000 });
  expect(response?.status()).toBe(200);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await waitForVisualReadiness(page);
  return errors;
}

const rankingCases = [
  { scenario: "enrolled", path: "/leaderboard", urlPath: "/leaderboard", key: "participation", tab: undefined },
  { scenario: "enrolled", path: "/leaderboard/academic?course=matematika-1&custom=first&custom=second", urlPath: "/leaderboard", key: "academic", tab: "academic" },
  { scenario: "revoked", path: "/courses/matematika-1/leaderboard", urlPath: "/courses/matematika-1/leaderboard", key: "course-revoked", tab: undefined },
] as const;

for (const scenario of rankingCases) {
  test(`Student ranking reference: ${scenario.key}`, async ({ page }, info) => {
    const errors = await open(page, scenario.scenario, scenario.path);
    expect(new URL(page.url()).pathname).toBe(scenario.urlPath);
    expect(new URL(page.url()).searchParams.get("tab") ?? undefined).toBe(scenario.tab);
    if (scenario.tab) expect(new URL(page.url()).searchParams.getAll("custom")).toEqual(["first", "second"]);
    await expect(page.getByRole("main").last()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(errors).toEqual([]);
    const png = info.outputPath(`student-community-web-${scenario.key}.png`);
    await page.screenshot({ path: png, animations: "disabled" });
    await info.attach(scenario.key, { path: png, contentType: "image/png" });
  });
}
