import { expect, type Page } from "@playwright/test";
import { buildFixture } from "./interactive-document-build";
import { fixtureFontStyles } from "./fonts";

type FeedbackFixture = Awaited<ReturnType<typeof buildFixture>>;

export function buildStudentFeedbackFixture(): Promise<FeedbackFixture> {
  return buildFixture("tests/visual/fixtures/student-feedback.tsx", "", {
    "./actions": `export async function submitStudentFeedbackAction(input) {
      const response = await fetch('/__fixture/feedback', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(input) });
      if (!response.ok) throw new Error('Fixture request failed');
      return response.json();
    }`,
    "@/components/student-experience-provider": `export const useStudentExperience=()=>({ mode: new URLSearchParams(location.search).get('mode') === 'demo' ? 'demo' : 'student' });`,
  });
}

export async function openStudentFeedbackForm(page: Page, fixture: FeedbackFixture, theme = "light", query = "") {
  const failures: string[] = [];
  page.on("pageerror", error => failures.push(error.message));
  page.on("console", message => { if (message.type() === "error") failures.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
  await page.route("https://feedback.fixture.test/**", route => {
    if (new URL(route.request().url()).pathname !== "/") return route.fallback();
    return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fixture.styles}${fixtureFontStyles()}</style></head><body class="bg-background text-foreground"><div id="root"></div><script>${fixture.script.replace(/<\/script/gi, "<\\/script")}</script></body></html>` });
  });
  const url = `https://feedback.fixture.test/?theme=${theme}${query}`;
  expect((await page.goto(url))?.status()).toBe(200);
  expect(page.url()).toBe(url);
  await expect(page.getByRole("heading", { name: "Masukan mahasiswa" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return failures;
}
