import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { buildFixture } from "./fixtures/interactive-document-build";
import { interactiveDocumentSchema, type InteractiveDocumentSpec } from "@/lib/materials/interactive-document";
import { interactiveDocumentResponse, verifyInteractiveDocumentAsset } from "@/lib/materials/interactive-document-server";

const origin = "http://fixture.invalid";
const directory = resolve("tests/visual/fixtures/rich-documents/built");
const embed = (spec: InteractiveDocumentSpec) => `\`\`\`zyx-visual\n${JSON.stringify(spec)}\n\`\`\``;
let fixture: Awaited<ReturnType<typeof buildFixture>>;
let specs: Record<string, InteractiveDocumentSpec>;
let bytes: Record<string, { document: Uint8Array; print: Uint8Array }>;

function pathYAtX(path: string, x: number) {
  const points = [...path.matchAll(/([ML])\s*([-\d.e+]+)[ ,]+([-\d.e+]+)/gi)].map(([, command, px, py]) => ({ command: command.toUpperCase(), x: Number(px), y: Number(py) }));
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (b.command === 'L' && a.x <= x && x <= b.x && b.x > a.x) return a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
  }
  return undefined;
}

test.beforeAll(async () => {
  fixture = await buildFixture();
  const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8"));
  specs = Object.fromEntries(Object.entries(manifest).map(([id, spec]) => [id, interactiveDocumentSchema.parse(spec)]));
  specs.museum_copy = interactiveDocumentSchema.parse({ ...specs.museum, id: "museum_copy", label: "Denah pilihan" });
  bytes = Object.fromEntries(Object.keys(specs).map(id => [id, {
    document: readFileSync(resolve(directory, `${id === "museum_copy" ? "museum" : id}.html`)),
    print: readFileSync(resolve(directory, `${id === "museum_copy" ? "museum" : id}.png`)),
  }]));
  for (const id of Object.keys(specs)) for (const kind of ["document", "print"] as const) await verifyInteractiveDocumentAsset(specs[id], kind, bytes[id][kind]);
});

// This fixture accepts only the explicit field and version associated with each visual.
function authorized(url: URL): { id: string; kind: "document" | "print" } | undefined {
  const q = url.searchParams, id = q.get("visualId") ?? "", kind = q.get("kind");
  if (!(id in specs) || (kind !== "document" && kind !== "print")) return;
  if (q.get("hash") !== (kind === "document" ? specs[id].documentSha256 : specs[id].printSha256)) return;
  const common = q.get("courseId") === "fixture-course";
  const article = common && q.get("articleId") === "fixture-article" && q.get("articleVersion") === "1";
  const articleScope = article && url.pathname === "/api/materials/interactive-document/article" && q.get("field") === "visual_ref" && q.get("partId") === `${id}-part` && q.get("sectionId") === (id === "museum" ? "museum" : "physics") && q.get("blockId") === id && ["museum", "mechanics", "brick", "annulus"].includes(id);
  const optionScope = article && id === "museum_copy" && url.pathname === "/api/materials/interactive-document/option" && q.get("sectionId") === "exercise" && q.get("blockId") === "formative" && q.get("optionId") === "a";
  const attemptScope = common && url.pathname === "/api/materials/interactive-document/attempt" && q.get("attemptId") === "fixture-attempt" && q.get("questionId") === "q1" && ((id === "milk" && q.get("field") === "prompt") || (id === "sampling" && q.get("field") === "option" && q.get("option") === "0"));
  const revealScope = id === "affine" && url.pathname === "/api/materials/interactive-document/reveal" && q.get("grant") === "fixture-explanation-grant";
  return articleScope || optionScope || attemptScope || revealScope ? { id, kind } : undefined;
}

async function boot(page: Page, failFirstMuseum = false) {
  const errors: string[] = [], requests: string[] = [];
  let failGet = failFirstMuseum;
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("response", response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    requests.push(`${request.method()} ${url.pathname}?${url.searchParams}`);
    if (url.origin !== origin) { errors.push(`Unexpected request: ${request.url()}`); return route.abort(); }
    if (url.pathname === "/" && request.method() === "GET") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>' });
    if (url.pathname === "/api/materials/formative-check/reveal" && request.method() === "POST") return route.fulfill({ json: { answer: "Jawaban tersedia.", explanation: embed(specs.affine), visualAccess: { explanation: "fixture-explanation-grant" } } });
    const binding = authorized(url);
    if (binding && ["HEAD", "GET"].includes(request.method())) {
      if (binding.id === "museum" && request.method() === "GET" && failGet) { failGet = false; return route.fulfill({ status: 503, contentType: "text/html", body: "<!doctype html><p>Unavailable</p>" }); }
      const asset = bytes[binding.id][binding.kind];
      await verifyInteractiveDocumentAsset(specs[binding.id], binding.kind, asset);
      const response = interactiveDocumentResponse(asset, binding.kind);
      return route.fulfill({ status: 200, headers: Object.fromEntries(response.headers), body: request.method() === "HEAD" ? "" : Buffer.from(await response.arrayBuffer()) });
    }
    errors.push(`Unexpected request: ${request.method()} ${url}`);
    return route.abort();
  });

  await page.goto(origin);
  await page.addStyleTag({ content: fixture.styles });
  await page.evaluate(value => { window.fixtureSpecs = value; }, specs);
  await page.addScriptTag({ content: fixture.script });
  await expect(page.locator('[data-fixture="quiz"]')).toBeVisible();
  return { errors, requests };
}

async function open(page: Page, id: string) {
  const figure = page.locator(`figure[id="${id}"]`);
  await figure.scrollIntoViewIfNeeded();
  await figure.getByRole("button", { name: "Buka visual" }).click();
  const frame = figure.locator("iframe");
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
  await expect(figure.getByRole("button", { name: "Tutup visual" })).toBeVisible();
  await expect(frame).not.toHaveAttribute("inert", "", { timeout: 16000 });
  const child = frame.contentFrame();
  await child.locator("main").waitFor();
  await child.locator("main").evaluate(() => document.fonts.ready);
  return { figure, child, frame };
}

async function capture(page: Page, info: TestInfo, id: string, state: string) {
  const figure = page.locator(`figure[id="${id}"]`);
  await figure.scrollIntoViewIfNeeded();
  const iframe = figure.locator('iframe');
  if (await iframe.count()) await expect.poll(async () => {
    const contentHeight = await iframe.contentFrame().locator('main').evaluate(element=>Math.ceil(element.getBoundingClientRect().height));
    return contentHeight < 240 || contentHeight > 2400 || await iframe.evaluate(element=>element.clientHeight) === contentHeight;
  }).toBe(true);
  await figure.evaluate(async element => {
    let previous = "", stable = 0;
    const deadline = performance.now() + 3000;
    while (performance.now() < deadline) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const box = element.getBoundingClientRect();
      const current = [box.x, box.y, box.width, box.height].map(value => Math.round(value)).join();
      if (current === previous) { if (++stable >= 6) return; }
      else { previous = current; stable = 0; }
    }
    throw new Error("Fixture layout did not settle before capture");
  });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const path = info.outputPath(`${id}-${state}.png`);
  const screenshot = await figure.screenshot({ path, animations: "disabled" });
  const pixels = await sharp(screenshot).stats();
  expect(Math.max(...pixels.channels.slice(0, 3).map(channel => channel.stdev)), "Captured visual must not be blank").toBeGreaterThan(3);
  await info.attach(`${id}-${state}`, { path, contentType: "image/png" });
}

test("document retries and receives theme and motion preferences", async ({ page }, info) => {
  test.setTimeout(120_000);
  const { errors, requests } = await boot(page, true);
  const figure = page.locator('figure[id="museum"]');
  await figure.scrollIntoViewIfNeeded();
  await figure.getByRole("button", { name: "Buka visual" }).click();
  await expect(figure.locator("iframe")).toHaveAttribute("inert", "");
  await expect(figure.locator("iframe")).toHaveAttribute("tabindex", "-1");
  await page.evaluate(() => window.postMessage({ type: "zyx:ready" }, "*"));
  await page.waitForTimeout(100);
  await expect(figure.getByRole("status")).toBeVisible();
  await expect(figure.getByRole("alert")).toBeVisible({ timeout: 20000 });
  expect(requests.filter(item => item.startsWith("GET /api/materials/interactive-document/article?") && item.includes("visualId=museum"))).toHaveLength(1);
  await figure.getByRole("button", { name: "Coba lagi" }).click();
  const iframe = figure.locator("iframe");
  await expect(iframe).not.toHaveAttribute("inert", "", { timeout: 16000 });
  const frame = iframe.contentFrame();
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(frame.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(frame.locator("html")).toHaveAttribute("data-reduced-motion", "true");
  for (const heights of [[700, 850], [850, 700]]) {
    await frame.locator('main').evaluate(async (_element, values) => {
      for (const height of values) {
        parent.postMessage({ type: 'zyx:resize', height }, '*');
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
    }, heights);
    await expect.poll(() => iframe.evaluate(element => element.clientHeight)).toBe(heights[1]);
  }
  await frame.locator('main').evaluate(() => parent.postMessage({type:'zyx:resize',height:2400}, '*'));
  await expect.poll(() => iframe.evaluate(element=>element.clientHeight)).toBe(2400);
  await frame.locator('main').evaluate(() => { for(const height of [2401,239,NaN,Infinity]) parent.postMessage({type:'zyx:resize',height}, '*'); });
  await page.waitForTimeout(150);
  await expect.poll(() => iframe.evaluate(element=>element.clientHeight)).toBe(2400);
  await frame.locator('main').evaluate(element => parent.postMessage({ type: 'zyx:resize', height: Math.max(240, Math.ceil(element.getBoundingClientRect().height)) }, '*'));
  await frame.locator('[data-room="1"]').press('Enter');
  await iframe.evaluate(element => { element.dataset.retained = 'yes'; });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(async () => (await figure.boundingBox())!.y + (await figure.boundingBox())!.height < -400).toBe(true);
  await page.waitForTimeout(150);
  await figure.scrollIntoViewIfNeeded();
  await expect(iframe).toHaveAttribute('data-retained', 'yes');
  await expect(frame.locator('[data-path]')).toHaveText('2 > 1');
  await capture(page, info, 'museum', 'retained-after-scroll');
  await capture(page, info, "museum", "dark-reduced");
  await figure.getByRole("button", { name: "Tutup visual" }).click();
  await expect(figure.locator("iframe")).toHaveCount(0);
  expect(requests.filter(item => item.startsWith("GET /api/materials/interactive-document/article?") && item.includes("visualId=museum"))).toHaveLength(2);
  expect(errors.filter(error => !error.startsWith("HTTP 503:") && !error.includes("Failed to load resource"))).toEqual([]);
});

test("interactive documents in real learning boundaries", async ({ page }, info) => {
    test.setTimeout(180_000);
    const { errors, requests } = await boot(page);
    expect(requests.filter(item => item.includes("interactive-document"))).toEqual([]);
    const museum = await open(page, "museum");
    const directPath = await museum.frame.getAttribute("src");
    const originalHeight = await museum.frame.evaluate(element => element.getBoundingClientRect().height);
    await page.evaluate(() => window.postMessage({ type: "zyx:resize", height: 1100 }, "*"));
    await expect.poll(() => museum.frame.evaluate(element => element.getBoundingClientRect().height)).toBe(originalHeight);
    await capture(page, info, "museum", "initial");
    await page.waitForTimeout(150);
    await museum.child.locator("main").evaluate(element => { element.style.minHeight = "1000px"; });
    await expect.poll(() => museum.frame.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(900);
    await page.waitForTimeout(150);
    await museum.child.locator("main").evaluate(element => { element.style.minHeight = ""; });
    await expect.poll(() => museum.frame.evaluate(element => element.getBoundingClientRect().height)).toBeLessThan(900);
    await museum.child.locator('[data-room="1"]').press("Enter");
    await museum.child.locator('[data-room="5"]').click();
    await expect(museum.child.getByRole("status")).toContainText("Tidak ada pintu");
    await expect(museum.child.locator('[data-path]')).toHaveText('2 > 1');
    await capture(page, info, "museum", "rejected-door");
    await museum.child.locator('[data-room="2"]').press("Space");
    await expect(museum.child.getByRole("status")).toContainText("sudah dilalui");
    await expect(museum.child.locator('[data-path]')).toHaveText('2 > 1');
    await museum.child.locator("[data-undo]").click();
    await expect(museum.child.getByRole('button', { name: 'Ruang 2, posisi sekarang' })).toBeFocused();
    await capture(page, info, "museum", "undo-focus");
    for (const route of [[1,3,5,6,7,4], [4,7,6,5,3,1]]) {
      await museum.child.locator('[data-reset]').click();
      for (const room of route) await museum.child.locator(`[data-room="${room}"]`).press('Enter');
      await expect(museum.child.getByRole('status')).toContainText('bukan pintu keluar');
      await expect(museum.child.getByRole('status')).toContainText('ruang 5');
      await capture(page, info, 'museum', `wrong-exit-${route.at(-1)}`);
      await museum.child.locator('[data-undo]').click();
      await expect(museum.child.locator(`[data-room="${route.at(-2)}"]`)).toHaveAttribute('aria-current', 'location');
      await capture(page, info, 'museum', `wrong-exit-${route.at(-1)}-undo`);
    }
    await museum.child.locator('[data-reset]').click();
    for (const n of [1,3,4,7,6,5]) await museum.child.locator(`[data-room="${n}"]`).press("Enter");
    await expect(museum.child.getByRole('status')).toContainText('Semua ruang dilalui satu kali');
    await expect(museum.child.locator('[data-path]')).toHaveText('2 > 1 > 3 > 4 > 7 > 6 > 5');
    await capture(page, info, "museum", "complete");
    await museum.child.locator("[data-reset]").click();
    await museum.child.locator('[data-room="1"]').click();
    await capture(page, info, "museum", "changed");
    await museum.child.locator("[data-reset]").click();
    await expect(museum.child.getByRole("status")).toContainText("Pintu berikutnya");
    await museum.figure.getByRole("button", { name: "Tutup visual" }).click();
    await expect(museum.frame).toHaveCount(0);

    const mechanics = await open(page, "mechanics");
    expect(await mechanics.child.locator('[data-scene] text').evaluateAll(nodes=>Math.min(...nodes.map(node=>parseFloat(getComputedStyle(node).fontSize)*(node as SVGGraphicsElement).getScreenCTM()!.a)))).toBeGreaterThanOrEqual(13);
    expect(await mechanics.child.locator('main > p').first().evaluate(node => getComputedStyle(node).fontSize)).toBe('16px');
    expect(await mechanics.child.locator('[data-play]').evaluate(node => getComputedStyle(node).fontSize)).toBe('14px');
    expect(await mechanics.child.locator('[data-time]').evaluate(node => getComputedStyle(node).fontSize)).toBe('14px');
    await mechanics.child.locator('[data-time]').press('Home');
    await mechanics.child.locator('[data-time]').press('ArrowRight');
    await expect(mechanics.child.locator('[data-clock]')).toHaveText('0.05 s');
    await mechanics.child.locator('[data-time]').press('Home');
    await capture(page, info, "mechanics", "initial");
    await mechanics.child.locator("[data-play]").click();
    await expect(mechanics.child.locator("[data-clock]")).not.toHaveText("0.00 s");
    await mechanics.child.locator("[data-play]").click();
    const pausedClock = await mechanics.child.locator("[data-clock]").innerText();
    const pausedGeometry = await mechanics.child.locator("[data-scene]").innerHTML();
    await page.waitForTimeout(300);
    await expect(mechanics.child.locator("[data-clock]")).toHaveText(pausedClock);
    expect(await mechanics.child.locator("[data-scene]").innerHTML()).toBe(pausedGeometry);
    await mechanics.child.locator("[data-play]").click();
    await page.waitForTimeout(180);
    await mechanics.child.locator("[data-play]").click();
    const resumedTime = parseFloat(await mechanics.child.locator("[data-clock]").innerText());
    expect(resumedTime - parseFloat(pausedClock)).toBeGreaterThan(0);
    expect(resumedTime - parseFloat(pausedClock)).toBeLessThan(0.4);
    await mechanics.child.locator('[data-play]').click();
    await mechanics.frame.evaluate(frame => (frame as HTMLIFrameElement).contentWindow!.postMessage({type:'zyx:visibility',active:false}, '*'));
    await expect(mechanics.child.locator('[data-play]')).toBeDisabled();
    await expect(mechanics.child.locator('[data-play]')).toHaveText('Putar');
    await mechanics.frame.evaluate(frame => (frame as HTMLIFrameElement).contentWindow!.postMessage({type:'zyx:visibility',active:true}, '*'));
    await expect(mechanics.child.locator('[data-play]')).toBeEnabled();
    await mechanics.frame.evaluate(frame => (frame as HTMLIFrameElement).contentWindow!.postMessage({type:'zyx:preferences',reducedMotion:true}, '*'));
    await expect(mechanics.child.locator('[data-play]')).toBeDisabled();
    await expect(mechanics.child.locator('[data-reduced-notice]')).toBeVisible();
    await mechanics.frame.evaluate(frame => (frame as HTMLIFrameElement).contentWindow!.postMessage({type:'zyx:preferences',reducedMotion:false}, '*'));
    await expect(mechanics.child.locator('[data-play]')).toBeEnabled();
    await mechanics.child.locator("[data-r]").fill("1");
    await expect(mechanics.child.locator("[data-amplitude]")).toContainText("2.404");
    const springHeights: number[] = [];
    const fixedCylinder = await mechanics.child.locator('[data-damper-cylinder]').getAttribute('d');
    for (const time of [0,0.5,1]) {
      await mechanics.child.locator('[data-time]').fill(String(time));
      const rotor = await mechanics.child.locator('[data-scene] circle[r="34"]').evaluate(node => ({ x: Number(node.getAttribute('cx')), y: Number(node.getAttribute('cy')) }));
      const omega = Math.sqrt(80000/2080), amplitude = (10*0.04)/(520*2*0.16);
      const theta = amplitude*Math.sin(omega*time-Math.PI/2);
      expect(rotor.x).toBeCloseTo(90+410*Math.cos(40*theta),5);
      expect(rotor.y).toBeCloseTo(110-410*Math.sin(40*theta),5);
      expect(rotor.y-45).toBeGreaterThan(16);
      expect(rotor.y+34).toBeLessThan(215);
      const spring = await mechanics.child.locator('[data-spring]').evaluate(node => ({
        x: Number(node.getAttribute('data-start-x')), y: Number(node.getAttribute('data-start-y')),
        endX: Number(node.getAttribute('data-end-x')), endY: Number(node.getAttribute('data-end-y')),
        path: node.getAttribute('d')!,
      }));
      expect(spring.x).toBeCloseTo(90+(rotor.x-90)/2, 8);
      expect(spring.y).toBeCloseTo(110+(rotor.y-110)/2, 8);
      expect(spring.endX).toBe(295); expect(spring.endY).toBe(215);
      const points = spring.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      expect(points[0]).toBeCloseTo(spring.x, 8); expect(points[1]).toBeCloseTo(spring.y, 8);
      expect(points.at(-2)).toBe(295); expect(points.at(-1)).toBe(215);
      for (let i=1; i<=7; i++) expect(points[2*i+1]).toBeCloseTo(spring.y+(215-spring.y)*i/8, 8);
      springHeights.push(215-spring.y);
      await expect(mechanics.child.locator('[data-floor]')).toHaveAttribute('d', 'M60 215H540');
      await expect(mechanics.child.locator('[data-damper-cylinder]')).toHaveAttribute('d', fixedCylinder!);
      await capture(page, info, 'mechanics', `resonance-${time}`);
    }
    expect(new Set(springHeights.map(height => height.toFixed(3))).size).toBe(3);
    const verifyRotorForce = async (ratio: number, time: number) => {
      await mechanics.child.locator('[data-r]').fill(String(ratio));
      await mechanics.child.locator('[data-time]').fill(String(time));
      const omega = ratio * Math.sqrt(80000 / 2080);
      const force = 10 * 0.04 * omega ** 2 * Math.sin(omega * time);
      const arrow = mechanics.child.locator('[data-force-arrow]');
      expect(Number(await arrow.getAttribute('data-force-value'))).toBeCloseTo(force, 8);
      await expect(mechanics.child.locator('[data-force-readout]')).toHaveText(`Gaya eksitasi Fy ${force.toFixed(2)} N`);
      await expect(arrow).toHaveAttribute('visibility', force === 0 ? 'hidden' : 'visible');
      await expect(mechanics.child.locator('[data-force-scale]')).toHaveAttribute('d', 'M32 22V28 M32 25H62 M62 22V28');
      if (force !== 0) {
        const geometry = await arrow.evaluate(node => {
          const path = node as SVGGraphicsElement, svg = path.ownerSVGElement!;
          const matrix = path.getScreenCTM()!, box = path.getBBox(), frame = svg.getBoundingClientRect();
          const anchor = new DOMPoint(0, 0).matrixTransform(matrix), tip = new DOMPoint(0, -30).matrixTransform(matrix);
          const corners = [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix));
          return { dy: tip.y - anchor.y, svgScale: svg.getScreenCTM()!.d, inside: corners.every(point => point.x >= frame.left && point.x <= frame.right && point.y >= frame.top && point.y <= frame.bottom) };
        });
        expect(geometry.dy).toBeCloseTo(-30 * force / 25 * geometry.svgScale, 3);
        expect(geometry.inside).toBe(true);
      }
    };
    for (const time of [0, 0.25, 0.75]) {
      await verifyRotorForce(1, time);
      await capture(page, info, 'mechanics', `force-${time}`);
    }
    for (const ratio of [0.2, 1.5]) for (const time of [0, 0.15, 0.5, 1.25, 3.8]) await verifyRotorForce(ratio, time);
    for (const [time, name] of [[0.15, 'positive'], [0.5, 'negative']] as const) {
      await verifyRotorForce(1.5, time);
      await capture(page, info, 'mechanics', `force-range-${name}`);
    }
    await mechanics.child.locator('[data-r]').fill('1');
    await mechanics.child.locator("[data-time]").fill("5");
    await expect(mechanics.child.locator("[data-clock]")).toHaveText("5.00 s");
    await capture(page, info, "mechanics", "changed");
    await mechanics.child.locator("[data-reset]").click();
    await expect(mechanics.child.locator("[data-clock]")).toHaveText("0.00 s");
    await mechanics.child.locator('[data-model] summary').click();
    await expect(mechanics.child.locator('[data-definitions]')).toBeVisible();
    await expect(mechanics.frame).toHaveAttribute('title', 'Balok dan rotor');
    await expect(mechanics.frame).toHaveAttribute('tabindex', '0');
    await capture(page, info, 'mechanics', 'expanded-host');
    const frameHeight = await mechanics.frame.evaluate(node => node.getBoundingClientRect().height);
    expect(frameHeight).toBeLessThanOrEqual(2402);
    const scrollable = await mechanics.child.locator('main').evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight + 1);
    if (scrollable) {
      await mechanics.frame.focus();
      await mechanics.frame.press('End');
      await expect.poll(() => mechanics.child.locator('main').evaluate(() => window.scrollY)).toBeGreaterThan(0);
      await expect(mechanics.child.locator('[data-definitions]')).toBeInViewport();
      await capture(page, info, 'mechanics', 'expanded-host-bottom');
      await mechanics.frame.press('Home');
      await expect.poll(() => mechanics.child.locator('main').evaluate(() => window.scrollY)).toBe(0);
      const box = await mechanics.frame.boundingBox();
      if (!box) throw new Error('Mechanics frame missing');
      await page.mouse.move(box.x+box.width/2, Math.max(1, Math.min(box.y+box.height/2, page.viewportSize()!.height-1)));
      await page.mouse.wheel(0, 600);
      await expect.poll(() => mechanics.child.locator('main').evaluate(() => window.scrollY)).toBeGreaterThan(0);
    }
    await mechanics.child.locator('[data-model]').screenshot({ path: info.outputPath('mechanics-model-parameters.png'), animations: 'disabled' });
    await mechanics.child.locator('[data-model] summary').click();

    const brick = await open(page, "brick");
    await capture(page, info, "brick", "initial");
    await expect(brick.child.locator('[data-play]')).toHaveText('Putar');
    await expect(brick.child.locator('[data-play]')).toHaveAttribute('aria-pressed', 'false');
    await brick.child.locator('[data-play]').click();
    await expect(brick.child.locator('[data-play]')).toHaveText('Jeda');
    await expect.poll(async () => Number(await brick.child.locator('[data-param="time"]').inputValue())).toBeGreaterThan(30);
    await brick.frame.evaluate(frame => (frame as HTMLIFrameElement).contentWindow!.postMessage({type:'zyx:visibility',active:false}, '*'));
    await expect(brick.child.locator('[data-play]')).toBeDisabled();
    await expect(brick.child.locator('[data-play]')).toHaveText('Putar');
    await brick.frame.evaluate(frame => (frame as HTMLIFrameElement).contentWindow!.postMessage({type:'zyx:visibility',active:true}, '*'));
    await brick.frame.evaluate(frame => (frame as HTMLIFrameElement).contentWindow!.postMessage({type:'zyx:preferences',reducedMotion:true}, '*'));
    await expect(brick.child.locator('[data-play]')).toBeDisabled();
    await brick.frame.evaluate(frame => (frame as HTMLIFrameElement).contentWindow!.postMessage({type:'zyx:preferences',reducedMotion:false}, '*'));
    await expect(brick.child.locator('[data-play]')).toBeEnabled();
    await brick.child.locator("canvas").press("ArrowRight");
    const history = brick.child.locator('.history');
    await expect(history.locator('[data-history-curve]')).toHaveCount(2);
    expect(await history.locator('text').evaluateAll(nodes=>Math.min(...nodes.map(node=>parseFloat(getComputedStyle(node).fontSize)*(node as SVGGraphicsElement).getScreenCTM()!.a)))).toBeGreaterThanOrEqual(12.95);
    const checkHistory = async (center: number, corner: number) => {
      expect(Number(await history.locator('[data-history-center]').getAttribute('data-temperature'))).toBeCloseTo(center, 0);
      expect(Number(await history.locator('[data-history-corner]').getAttribute('data-temperature'))).toBeCloseTo(corner, 0);
      const time = Number(await brick.child.locator('[data-param="time"]').inputValue());
      const x = 38 + ((await history.evaluate(node=>(node as SVGSVGElement).viewBox.baseVal.width))-50)*time/90;
      expect(Number(await history.locator('[data-history-center]').getAttribute('cx'))).toBeCloseTo(x, 5);
      expect(Number(await history.locator('[data-history-corner]').getAttribute('cy'))).toBeCloseTo(140-108*(corner-30)/1170, 1);
    };
    await brick.child.locator('[data-param="time"]').press('Home');
    await checkHistory(30, 30);
    await capture(page, info, 'brick', 'history-zero');
    const curvePaths = await history.locator('[data-history-curve]').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')));
    const verifyHistoryLine = async () => {
      for (const name of ['center', 'corner']) {
        const marker = history.locator(`[data-history-${name}]`);
        const y = pathYAtX((await history.locator(`[data-history-curve="${name}"]`).getAttribute('d'))!, Number(await marker.getAttribute('cx')));
        expect(y).toBeDefined();
        expect(Math.abs(30 + (140 - y!) * 1170 / 108 - Number(await marker.getAttribute('data-temperature')))).toBeLessThanOrEqual(2);
      }
    };
    for (const [seconds, center, corner] of [[1, 30, 160.184612], [5, 30, 297.999691], [15, 30, 448.362973], [30, 30.000449, 567.423151], [45, 30.027178, 643.594406], [60, 30.233115, 699.332742], [300, 132.511413, 991.423889], [1800, 956.568979, 1177.542394]]) {
      await brick.child.locator('[data-param="time"]').evaluate((input, minutes) => {
        (input as HTMLInputElement).value = String(minutes);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, seconds / 60);
      await checkHistory(center, corner);
      await verifyHistoryLine();
      if (seconds === 15) await capture(page, info, 'brick', 'history-fifteen-seconds');
    }
    expect(await history.locator('[data-history-curve]').evaluateAll(nodes => nodes.map(node => node.getAttribute('d')))).toEqual(curvePaths);
    await brick.child.locator('[data-param="time"]').fill('0.25');
    await brick.child.locator('[data-play]').click();
    await expect.poll(async () => Number(await brick.child.locator('[data-param="time"]').inputValue())).toBeGreaterThan(0.25);
    await brick.child.locator('[data-play]').click();
    await verifyHistoryLine();
    await brick.child.locator('[data-param="time"]').evaluate(input => {
      (input as HTMLInputElement).value = String(0.0001 / 60);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(brick.child.getByRole('status').filter({ hasText: 'Deret belum konvergen' })).toBeVisible();
    for (const name of ['center', 'corner']) await expect(history.locator(`[data-history-${name}]`)).toHaveAttribute('visibility', 'hidden');
    await capture(page, info, 'brick', 'history-unconverged');
    await brick.child.locator('[data-param="time"]').press('Home');
    for(let i=0;i<5;i++) await brick.child.locator('[data-param="time"]').press('ArrowRight');
    await expect(brick.child.locator('[data-param="time"]')).toHaveValue('5');
    await brick.child.locator('[data-param="slice"]').fill("0.065");
    await expect(brick.child.locator(".readouts")).toContainText("132,5");
    await expect(brick.child.locator(".readouts")).toContainText("991,4");
    await checkHistory(132.5, 991.4);
    await capture(page, info, "brick", "changed");
    await brick.child.locator('[aria-label="Arah irisan"]').selectOption('0');
    await expect(brick.child.locator('[data-param="slice"]')).toHaveValue('0.0195');
    await expect(brick.child.locator('.readouts')).toContainText('Probe (0,0195, 0, 0,065)');
    await capture(page, info, 'brick', 'slice-x');
    await brick.child.locator('[aria-label="Arah irisan"]').selectOption('1');
    await capture(page, info, 'brick', 'slice-y');
    await brick.child.locator('[aria-label="Arah irisan"]').selectOption('2');
    await brick.child.locator('[data-param="time"]').press('Home');
    for(let i=0;i<30;i++) await brick.child.locator('[data-param="time"]').press('ArrowRight');
    await expect(brick.child.locator('.readouts')).toContainText('956,6');
    await expect(brick.child.locator('.readouts')).toContainText('1.177,5');
    await checkHistory(956.6, 1177.5);
    await capture(page, info, 'brick', 'thirty-minutes');
    // Pick a visible side with a pointer, then move the cut beyond that point.
    const brickCanvas = brick.child.locator('canvas'), brickBox = await brickCanvas.boundingBox();
    if (!brickBox) throw new Error('Brick canvas missing');
    let sidePicked = false;
    for (const [x,y] of [.2,.3,.4,.5,.6,.7,.8].flatMap(y=>[.2,.3,.4,.5,.6,.7,.8].map(x=>[x,y]))) {
      await brickCanvas.click({position:{x:brickBox.width*x,y:brickBox.height*y}});
      const text = await brick.child.locator('.readouts').innerText();
      const coordinates = text.match(/Probe \(([^)]*)\)/)?.[1].split(', ').map(v=>Number(v.replace(',', '.')));
      if (coordinates && coordinates[2] < -.001 && coordinates[2] > -.099) { sidePicked = true; break; }
    }
    expect(sidePicked, 'Pointer must select a side away from the z cut').toBe(true);
    await capture(page, info, 'brick', 'pointer-side');
    await brick.child.locator('[data-param="slice"]').press('Home');
    await expect(brick.child.locator('.readouts')).toContainText('-0,1)');
    const probeReadout = brick.child.locator('.readouts > span').filter({ hasText: /^Probe \(/ });
    const physicalBefore = await probeReadout.innerText();
    await brickCanvas.press('ArrowRight');
    await expect.poll(() => probeReadout.innerText()).toBe(physicalBefore);
    await capture(page, info, 'brick', 'cut-clamped');
    for (const axis of ['0','1','2']) {
      await brick.child.locator('[aria-label="Arah irisan"]').selectOption(axis);
      await brick.child.locator('[data-param="slice"]').press('End');
      await capture(page, info, 'brick', `cut-axis-${axis}-end`);
      await brick.child.locator('[data-param="slice"]').press('Home');
      await expect(brick.child.locator('[data-param="slice"]')).toHaveAttribute('aria-valuetext', ['x -0,03 meter','y -0,05 meter','z -0,1 meter'][Number(axis)]);
      await capture(page, info, 'brick', `cut-axis-${axis}`);
    }

    await brickCanvas.press('Home');
    const probePosition = await brickCanvas.evaluate(canvas => {
      const bounds = canvas.getBoundingClientRect(), yaw = 35 * Math.PI / 180, pitch = 24 * Math.PI / 180;
      const rotate = ([x, y, z]: number[]) => [x * Math.cos(yaw) - y * Math.sin(yaw), (x * Math.sin(yaw) + y * Math.cos(yaw)) * Math.sin(pitch) - z * Math.cos(pitch)];
      const corners = [-0.03, 0.03].flatMap(x => [-0.05, 0.05].flatMap(y => [-0.1, 0.1].map(z => rotate([x, y, z]))));
      const scale = Math.min((bounds.width - 92) / (Math.max(...corners.map(p => p[0])) - Math.min(...corners.map(p => p[0]))), (bounds.height - 86) / (Math.max(...corners.map(p => p[1])) - Math.min(...corners.map(p => p[1]))));
      const point = rotate([0.03, -0.009375, -0.059375]);
      return { x: bounds.width / 2 + point[0] * scale, y: bounds.height / 2 + point[1] * scale };
    });
    await brickCanvas.click({ position: probePosition });
    const selectedCoordinates = (await probeReadout.innerText()).match(/Probe \(([^)]*)\)/)![1].split(', ').map(value => Number(value.replace(',', '.')));
    for (const [index, expected] of [0.03, -0.009375, -0.059375].entries()) expect(selectedCoordinates[index]).toBeCloseTo(expected, 4);
    const selectedProbe = await probeReadout.innerText(), occluded = brick.child.locator('[data-probe-occluded]');
    await expect(occluded).toHaveCount(0);
    await capture(page, info, 'brick', 'probe-before-rotation');
    for (let i = 0; i < 5; i++) await brickCanvas.press('ArrowLeft');
    await expect(occluded).toHaveText('Probe tertutup arah pandang');
    await expect(brickCanvas).toHaveAttribute('aria-label', /Probe tertutup arah pandang/);
    await expect(probeReadout).toHaveText(selectedProbe);
    await capture(page, info, 'brick', 'probe-occluded');
    const rotateProbeWithPointer = async (distance: number) => {
      await brickCanvas.scrollIntoViewIfNeeded();
      const box = await brickCanvas.boundingBox();
      if (!box) throw new Error('Brick rotation canvas missing');
      const startX = box.x + (distance > 0 ? 0.2 : 0.8) * box.width, y = box.y + box.height / 2;
      await page.mouse.move(startX, y); await page.mouse.down();
      await page.mouse.move(startX + distance, y, { steps: 5 }); await page.mouse.up();
    };
    await rotateProbeWithPointer(187.5);
    await expect(occluded).toHaveCount(0);
    await expect(probeReadout).toHaveText(selectedProbe);
    await capture(page, info, 'brick', 'probe-recovered');
    await rotateProbeWithPointer(-187.5);
    await expect(occluded).toBeVisible();
    for (let i = 0; i < 5; i++) await brickCanvas.press('ArrowRight');
    await expect(occluded).toHaveCount(0);
    await expect(probeReadout).toHaveText(selectedProbe);

    const annulus = await open(page, "annulus");
    await capture(page, info, "annulus", "initial");
    await annulus.child.locator("canvas").press("ArrowRight");
    await annulus.child.locator('[data-param="massFlowKgS"]').fill("0.1");
    await expect(annulus.child.locator("[data-result]")).toContainText("29.30");
    expect(Math.abs(Number((await annulus.child.locator('[data-result]').innerText()).match(/Panjang ([\d.]+)/)![1])-99.96)).toBeLessThan(0.02);
    await capture(page, info, 'annulus', 'double-flow');
    await annulus.child.locator('[data-param="targetOutletC"]').fill("90");
    await annulus.child.locator('svg[role="slider"]').press("Home");
    await annulus.child.locator('svg[role="slider"]').press("ArrowRight");
    expect(Number(await annulus.child.locator('svg[role="slider"]').getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    await expect(annulus.child.locator('[data-result]')).toContainText('fluks lokal');
    await capture(page, info, "annulus", "changed");
    await annulus.child.locator('[data-param="targetOutletC"]').fill("200");
    await expect(annulus.child.getByRole("alert")).toBeVisible();
    await annulus.child.locator("[data-recover]").click();
    await expect(annulus.child.getByRole("alert")).toBeHidden();
    await annulus.child.locator('[data-param="massFlowKgS"]').fill('0.2');
    const position = annulus.child.locator('[data-position]');
    const verifyPosition = async (expected: number, tolerance: number) => {
      const x = Number(await position.inputValue());
      expect(Math.abs(x-expected)).toBeLessThan(tolerance);
      const bulk = 125 - 100*Math.exp(-64.2*Math.PI*.025*x/(.2*4186));
      await expect(position).toHaveAttribute('aria-valuetext', new RegExp(`suhu ${bulk.toFixed(2)} derajat Celsius, fluks lokal ${(64.2*(125-bulk)).toFixed(1)}`));
      await expect(annulus.child.locator('[data-result]')).toContainText(`x ${x.toFixed(2)} m`);
      await expect(annulus.child.locator('canvas')).toHaveAttribute('aria-label', new RegExp(`probe x ${x.toFixed(2)} meter, suhu ${bulk.toFixed(2)}`));
      if (x > 120) await expect(annulus.child.locator('[data-result]')).toContainText('posisi di luar grafik');
      else await expect(annulus.child.locator('[data-graph] circle')).toHaveCount(1);
    };
    const length = Number(await position.getAttribute('max'));
    expect(length).toBeCloseTo(199.92, 0);
    for (const x of [0,100,150,length]) {
      const positionBox = await position.boundingBox();
      if (!positionBox) throw new Error('Position control missing');
      const inset = await position.evaluate(element=>{
        const style=getComputedStyle(element);
        return {left:parseFloat(style.paddingLeft)+parseFloat(style.borderLeftWidth)+8,right:parseFloat(style.paddingRight)+parseFloat(style.borderRightWidth)+8};
      });
      await position.click({position:{x:inset.left+(positionBox.width-inset.left-inset.right)*x/length,y:positionBox.height/2}});
      await verifyPosition(x, 3);
      await capture(page, info, 'annulus', `position-pointer-${Math.round(x)}`);
    }
    await position.press('Home');
    await verifyPosition(0, .01);
    await capture(page, info, 'annulus', 'position-keyboard-zero');
    for(let i=0;i<150;i++) {
      await position.press('ArrowRight');
      if(i===99) { await verifyPosition(100, 1.1); await capture(page, info, 'annulus', 'position-keyboard-100'); }
    }
    await verifyPosition(150, 1.1);
    await capture(page, info, 'annulus', 'position-keyboard-150');
    await position.press('End');
    await verifyPosition(length, .01);
    await capture(page, info, 'annulus', 'position-keyboard-outlet');
    const beforeCamera = await annulus.child.locator('[data-result]').innerText();
    await annulus.child.locator('canvas').press('ArrowRight');
    await expect(annulus.child.locator('[data-result]')).toHaveText(beforeCamera);
    await capture(page, info, 'annulus', 'outlet-rotated');
    const graph = annulus.child.locator('svg[role="slider"]'), graphBox = await graph.boundingBox();
    if (!graphBox) throw new Error('Annulus graph missing');
    await graph.click({position:{x:graphBox.width*(48+330*25/120)/400,y:graphBox.height*.5}});
    await verifyPosition(25, .1);
    await capture(page, info, 'annulus', 'return-to-graph');
    for (const target of ['95', '124.999999', '124.99999999999999']) {
      const targetInput = annulus.child.locator('[data-param="targetOutletC"]');
      await targetInput.fill(target);
      await targetInput.blur();
      await expect(targetInput).toHaveValue(target);
      expect(await targetInput.evaluate(element => getComputedStyle(element).fontSize)).toBe('14px');
      expect(await targetInput.evaluate((element: HTMLInputElement) => {
        const style = getComputedStyle(element), canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')!;
        ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 20 >= ctx.measureText(element.value).width;
      })).toBe(true);
      expect(await annulus.child.locator('.ann3').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await graph.press('Home');
      await verifyPosition(0, .001);
      await graph.press('ArrowRight');
      await verifyPosition(1, .001);
      await graph.press('ArrowRight');
      await verifyPosition(2, .001);
      await capture(page, info, 'annulus', `graph-keyboard-two-${target}`);
      await position.fill('2');
      await verifyPosition(2, .001);
      await graph.click({position:{x:graphBox.width*(48+330*2/120)/400,y:graphBox.height*.5}});
      await verifyPosition(2, .01);
      await graph.press('End');
      await verifyPosition(Number(await position.getAttribute('max')), .001);
      await expect(annulus.child.locator('[data-graph] circle')).toHaveCount(0);
      await capture(page, info, 'annulus', `graph-end-${target}`);
      await graph.press('Home');
      await verifyPosition(0, .001);
      await capture(page, info, 'annulus', `graph-recovered-${target}`);
      for (const x of [1.5, 29.3, 60, 88.5, 119]) {
        await position.fill(String(x));
        const expected = 125 - 100 * Math.exp(-64.2 * Math.PI * 0.025 * x / (0.2 * 4186));
        const marker = annulus.child.locator('[data-graph] circle');
        expect(Number(await marker.getAttribute('cx'))).toBeCloseTo(48 + 330 * x / 120, 6);
        expect(Number(await marker.getAttribute('cy'))).toBeCloseTo(185 - 145 * (expected - 25) / 100, 6);
        const y = pathYAtX((await annulus.child.locator('[data-graph] path[stroke="var(--primary)"]').getAttribute('d'))!, 48 + 330 * x / 120);
        expect(y).toBeDefined();
        expect(Math.abs(25 + (185 - y!) * 100 / 145 - expected)).toBeLessThanOrEqual(0.1);
      }
      await position.fill('60');
      await capture(page, info, 'annulus', `curve-target-${target}`);
    }

    const editedTarget = annulus.child.locator('[data-param="targetOutletC"]');
    const editedMass = annulus.child.locator('[data-param="massFlowKgS"]');
    const expectedLength = (mass: number, target: number) => mass * 4186 / (64.2 * Math.PI * .025) * Math.log(100 / (125 - target));
    await editedMass.fill('0.2');
    await editedTarget.fill('124.999999');
    await editedTarget.press('End');
    await editedTarget.press('0');
    await expect(editedTarget).toHaveValue('124.9999990');
    await editedTarget.press('1');
    await expect(editedTarget).toHaveValue('124.99999901');
    await editedTarget.blur();
    await expect(editedTarget).toHaveValue('124.99999901');
    await expect(annulus.child.locator('[data-result]')).toContainText(`Panjang ${expectedLength(.2, 124.99999901).toFixed(2)} m`);
    await capture(page, info, 'annulus', 'target-sequential-edit');
    await editedMass.press('End');
    await editedMass.press('0');
    await expect(editedMass).toHaveValue('0.20');
    await editedMass.press('1');
    await expect(editedMass).toHaveValue('0.201');
    await expect(annulus.child.locator('[data-result]')).toContainText(`Panjang ${expectedLength(.201, 124.99999901).toFixed(2)} m`);
    await capture(page, info, 'annulus', 'mass-sequential-edit');
    for (const key of ['Home', 'ArrowRight', 'ArrowRight', '0', '1']) await editedMass.press(key);
    await expect(editedMass).toHaveValue('0.01201');
    await editedMass.blur();
    await expect(annulus.child.locator('[data-result]')).toContainText(`Panjang ${expectedLength(.01201, 124.99999901).toFixed(2)} m`);
    await capture(page, info, 'annulus', 'mass-middle-edit');
    await editedTarget.fill('200');
    await expect(annulus.child.getByRole('alert')).toBeVisible();
    await annulus.child.locator('[data-recover]').click();
    await expect(editedTarget).toHaveValue('95');
    await expect(editedMass).toHaveValue('0.05');
    await expect(annulus.child.getByRole('alert')).toBeHidden();
    await editedMass.fill('');
    await editedMass.pressSequentially('0.05');
    await expect(editedMass).toHaveValue('0.05');
    await expect(annulus.child.getByRole('alert')).toBeHidden();
    await editedMass.press('End');
    await editedMass.press('0');
    await expect(editedMass).toHaveValue('0.050');
    await annulus.child.locator('canvas').press('Home');
    await expect(editedMass).toHaveValue('0.05');
    await expect(editedTarget).toHaveValue('95');

    const milk = await open(page, "milk");
    await expect(milk.child.locator('[data-change-icon]')).toHaveCount(2);
    expect(await milk.child.locator("svg text").evaluateAll(elements => Math.min(...elements.map(element => parseFloat(getComputedStyle(element).fontSize) * (element as SVGGraphicsElement).getScreenCTM()!.a)))).toBeGreaterThanOrEqual(12);
    await capture(page, info, "milk", "initial");
    await milk.child.locator('[data-milk="a"]').press("Enter");
    await expect(milk.child.locator('[data-milk="a"]')).toBeFocused();
    await expect(milk.child.getByRole('status')).toContainText('Hasil akhir Cokelat');
    await capture(page, info, 'milk', 'mixed-left');
    await milk.child.locator('[data-milk="b"]').press("Space");
    await expect(milk.child.getByRole('status')).toContainText('Hasil akhir Putih');
    await capture(page, info, "milk", "changed");
    await milk.child.locator('[data-milk="a"]').click();
    await expect(milk.child.getByRole('status')).toContainText('Masukan kiri Cokelat, kanan Putih');
    await expect(milk.child.getByRole('status')).toContainText('Hasil akhir Cokelat');
    await capture(page, info, 'milk', 'mixed-right');
    await milk.child.locator('[data-reset]').click();
    await expect(milk.child.getByRole('status')).toContainText('Masukan kiri Cokelat, kanan Cokelat');
    await expect(milk.child.locator('[data-reset]')).toBeFocused();
    const quizRadio = page.locator('[data-fixture="quiz"] [data-question-option]').first().getByRole("radio");
    const sampling = await open(page, "sampling");
    expect(await sampling.child.locator("svg text").evaluateAll(elements => Math.min(...elements.map(element => parseFloat(getComputedStyle(element).fontSize) * (element as SVGGraphicsElement).getScreenCTM()!.a)))).toBeGreaterThanOrEqual(12.95);
    expect(await sampling.child.locator('main > p').last().evaluate(node => getComputedStyle(node).fontSize)).toBe('16px');
    expect(await sampling.child.locator('.controls label').first().evaluate(node => getComputedStyle(node).fontSize)).toBe('14px');
    expect(await sampling.child.locator('[data-n]').evaluate(node => getComputedStyle(node).fontSize)).toBe('14px');
    await expect(sampling.child.locator('[data-n]')).toHaveValue('16');
    await capture(page, info, 'sampling', 'initial');
    for (let n=1; n<=64; n++) {
      await sampling.child.locator('[data-n]').fill(String(n));
      let seed=4271, below=0, above=0, within=0;
      const bins=Array(36).fill(0), se=380/Math.sqrt(n);
      for (let sample=0; sample<600; sample++) {
        let sum=0;
        for (let i=0; i<n; i++) { seed=(Math.imul(1664525,seed)+1013904223)>>>0; sum-=Math.log((seed+.5)/4294967296); }
        const value=2070+380*sum/n;
        if (Math.abs(value-2450)<=se) within++;
        if (value<1900) below++; else if (value>3000) above++; else bins[Math.min(35,Math.floor((value-1900)/1100*36))]++;
      }
      const chart=await sampling.child.locator('[data-sampling]').evaluate(node => ({
        bars: Array.from(node.querySelectorAll('[data-bin]'), bar => ({count: Number(bar.getAttribute('data-count')), height: Number(bar.getAttribute('height'))})),
        ticks: Array.from(node.querySelectorAll('[data-y-tick]'), tick => ({count: Number(tick.getAttribute('data-y-tick')), y: Number(tick.getAttribute('y'))})),
        peak: Number(node.querySelector('[data-normal]')!.getAttribute('data-peak')),
        curve: node.querySelector('[data-normal]')!.getAttribute('d')!,
      }));
      expect(chart.bars.map(bar=>bar.count)).toEqual(bins);
      expect(bins.reduce((a,b)=>a+b,0)+below+above).toBe(600);
      expect(chart.ticks.length).toBe(5);
      const scale=(chart.ticks[0].y-chart.ticks[1].y)/(chart.ticks[1].count-chart.ticks[0].count);
      expect(scale).toBeGreaterThan(0);
      for (let i=0; i<chart.bars.length; i++) expect(chart.bars[i].height).toBeCloseTo(bins[i]*scale, 7);
      for (const tick of chart.ticks) expect(tick.y).toBeCloseTo(chart.ticks[0].y-tick.count*scale, 7);
      expect(chart.peak).toBeCloseTo(600*(1100/36)/(se*Math.sqrt(2*Math.PI)), 8);
      const curveY=Number(chart.curve.split(/[ML]/)[51].split(',')[1]);
      expect(curveY).toBeCloseTo(190-chart.peak*scale, 1);
      await expect(sampling.child.locator('[data-result]')).toContainText(`Teramati dalam satu SE: ${within}/600 (${(within/6).toFixed(1)}%); acuan normal: 68,27%`);
      await expect(sampling.child.locator('[data-result]')).toContainText(`di bawah ${below}, di atas ${above}`);
      if (n===1) expect(within).toBe(523);
      if (n===64) expect(within).toBe(409);
    }
    await sampling.child.locator('[data-n]').press('Home');
    for (const [n,count] of [[1,554],[2,572],[16,600],[64,600]]) {
      if (n===2) await sampling.child.locator('[data-n]').press('ArrowRight');
      else if (n===64) await sampling.child.locator('[data-n]').press('End');
      else if (n!==1) await sampling.child.locator('[data-n]').fill(String(n));
      await expect(sampling.child.locator('[data-sampling]')).toHaveAttribute('aria-label',new RegExp(`${count} dari 600`));
      await expect(sampling.child.locator('[data-result]')).toContainText(`n = ${n};`);
      await capture(page, info, 'sampling', `n-${n}`);
      await sampling.child.locator('[data-band]').press('Space');
      await expect(sampling.child.locator('[data-sampling]')).toHaveAttribute('aria-label',/disembunyikan/);
      await capture(page, info, 'sampling', `n-${n}-band-off`);
      await sampling.child.locator('[data-band]').press('Space');
    }
    await sampling.child.locator("[data-n]").fill("64");
    await expect(sampling.child.locator("main")).toContainText("SE 47.5 kg");
    await expect(quizRadio).toHaveAttribute("aria-checked", "false");
    await capture(page, info, "sampling", "changed");

    const formative = page.locator('[data-fixture="formative"]');
    const copy = await open(page, "museum_copy");
    await copy.child.locator('[data-room="1"]').press("Enter");
    await expect(formative.getByRole("radio").first()).toHaveAttribute("aria-checked", "false");
    expect(requests.some(item => item.includes("visualId=affine"))).toBe(false);
    await formative.getByRole("button", { name: "Buka jawaban dan pembahasan" }).click();
    const affine = await open(page, "affine");
    await capture(page, info, "affine", "initial");
    const initialGrid = await affine.child.locator('[data-image-grid] [data-grid-line]').evaluateAll(lines => lines.map(line => line.getAttribute('d')));
    expect(initialGrid).toEqual(await affine.child.locator('[data-original-grid] [data-grid-line]').evaluateAll(lines => lines.map(line => line.getAttribute('d'))));
    const coordinates = ['(0, 0)', '(2, 0)', '(2, 1)', '(1, 2)', '(0, 1)'];
    await expect(affine.child.locator('[data-axis-labels]')).toHaveText('011+x+y');
    for (const [index, coordinate] of coordinates.entries()) {
      const point = affine.child.locator(`[data-point="${index}"]`);
      for (const [dx, dy] of [[-8, 0], [8, 0], [0, -8], [0, 8]]) {
        await affine.child.locator(`[data-point="${(index + 1) % coordinates.length}"]`).press('Enter');
        await expect(point).toHaveAttribute('aria-pressed', 'false');
        const mark = await point.locator('[data-point-mark]').boundingBox();
        if (!mark) throw new Error(`Affine point ${index + 1} missing`);
        await page.mouse.click(mark.x + mark.width / 2 + dx, mark.y + mark.height / 2 + dy);
        await expect(point).toHaveAttribute('aria-pressed', 'true');
        await expect(affine.child.locator('[data-coordinate]')).toHaveText(`Titik ${index + 1}: asal ${coordinate}, hasil ${coordinate}`);
      }
    }
    await affine.child.locator('[data-point="2"]').focus();
    await affine.child.locator('[data-point="2"]').press(' ');
    await expect(affine.child.locator('[data-point="2"]')).toHaveAttribute('aria-pressed', 'true');
    const scale = affine.child.locator('[data-a]'), originalScale = await scale.elementHandle(), box = await scale.boundingBox();
    if (!box || !originalScale) throw new Error('Affine scale control missing');
    const beforeDrag = Number(await scale.inputValue());
    await page.mouse.move(box.x+8,box.y+box.height/2);
    await page.mouse.down();
    let previousDragValue = Number(await scale.inputValue());
    for (const fraction of [0.4, 0.75]) {
      await page.mouse.move(box.x+box.width*fraction,box.y+box.height/2,{steps:4});
      await expect.poll(async () => Number(await scale.inputValue())).not.toBe(previousDragValue);
      previousDragValue = Number(await scale.inputValue());
      await expect(affine.child.locator('[data-coordinate]')).toHaveText(`Titik 3: asal (2, 1), hasil (${Number((2 * previousDragValue).toFixed(2))}, 1)`);
      expect(await originalScale.evaluate(node => node.isConnected)).toBe(true);
    }
    await page.mouse.up();
    expect(await originalScale.evaluate(node=>node.isConnected)).toBe(true);
    const dragged = Number(await scale.inputValue());
    expect(dragged).not.toBe(beforeDrag);
    await expect(affine.child.locator('[data-coordinate]')).toHaveText(`Titik 3: asal (2, 1), hasil (${Number((2 * dragged).toFixed(2))}, 1)`);
    await scale.press('ArrowLeft');
    expect(Number(await scale.inputValue())).toBeLessThan(dragged);
    await expect(scale).toBeFocused();
    await affine.child.locator('[data-a]').fill('1');
    await affine.child.locator('[data-b]').fill('1');
    await affine.child.locator('[data-tx]').fill('0');
    await expect(affine.child.locator('[data-coordinate]')).toHaveText('Titik 3: asal (2, 1), hasil (3, 1)');
    await capture(page, info, 'affine', 'shear');
    await affine.child.locator('[data-a]').press('End');
    await affine.child.locator('[data-b]').press('End');
    await affine.child.locator('[data-tx]').press('End');
    await affine.child.locator('[data-point="2"]').press('Enter');
    await expect(affine.child.locator('[data-coordinate]')).toHaveText('Titik 3: asal (2, 1), hasil (6, 1)');
    await expect(affine.child.locator('[data-image-point]')).toHaveAttribute('cx','420');
    await expect(affine.child.locator('[data-image-grid] [data-grid-line="4"]')).toHaveAttribute('d','M180,160 L340,0');
    await capture(page, info, 'affine', 'extreme');
    await affine.child.locator('[data-a]').press('Home');
    await affine.child.locator('[data-b]').fill('0');
    await affine.child.locator('[data-tx]').fill('0');
    await expect(affine.child.locator('[data-coordinate]')).toHaveText('Titik 3: asal (2, 1), hasil (-2, 1)');
    await capture(page, info, 'affine', 'reflection');
    await affine.child.locator('[data-b]').press('Home');
    await affine.child.locator('[data-tx]').press('Home');
    await expect(affine.child.locator('[data-coordinate]')).toHaveText('Titik 3: asal (2, 1), hasil (-4, 1)');
    await expect(affine.child.locator('[data-image-point]')).toHaveAttribute('cx','20');
    await capture(page, info, 'affine', 'opposite-extreme');
    await affine.child.locator("[data-a]").fill("0");
    await expect(affine.child.locator("main")).toContainText("tidak memiliki invers");
    await capture(page, info, "affine", "changed");
    await affine.child.locator("[data-reset]").click();
    await expect(affine.child.locator("main")).toContainText("dapat dibalik");
    await expect(affine.child.locator('[data-a]')).toHaveValue('1');
    await expect(affine.child.locator('[data-b]')).toHaveValue('0');
    await expect(affine.child.locator('[data-tx]')).toHaveValue('0');
    await expect(affine.child.locator('[data-point="0"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(affine.child.locator('[data-coordinate]')).toHaveText('Titik 1: asal (0, 0), hasil (0, 0)');
    expect(await affine.child.locator('[data-image-grid] [data-grid-line]').evaluateAll(lines => lines.map(line => line.getAttribute('d')))).toEqual(initialGrid);
    const direct = await page.goto(`${origin}${directPath}`);
    expect(direct?.status()).toBe(200);
    expect(direct?.headers()["content-security-policy"]).toContain("sandbox allow-scripts");
    expect(direct?.headers()["content-security-policy"]).toContain("connect-src 'none'");
    expect(direct?.headers()["x-content-type-options"]).toBe("nosniff");
    const pngUrl = new URL(`${origin}${directPath}`);
    pngUrl.searchParams.set("kind", "print");
    pngUrl.searchParams.set("hash", specs.museum.printSha256);
    const png = await page.goto(pngUrl.href);
    expect(png?.headers()["content-type"]).toBe("image/png");
    expect((await png!.body()).byteLength).toBe(specs.museum.printBytes);
    expect(errors).toEqual([]);
  });
