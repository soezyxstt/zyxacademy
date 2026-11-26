import { getCapacitor, getTauri } from "@/lib/native/runtime";
import { createOfflineScope, setOfflineScope, type OfflineCacheScope } from "./cache-scope";
import { createOfflineSyncController } from "./sync-client";
import { clearAllOfflineReadings, hydrateNativeOfflineReadings, setOfflineReadingPinned, removeOfflineReadingByKey } from "./reading-cache";
import { OFFLINE_CACHE_CHANGED_EVENT, type NativeOfflineLibrarySnapshot } from "./library-contract";
import { OFFLINE_LIBRARY_COPY } from "./library-copy";
import { visibleOfflineLibrary } from "./library-access";

type Summary = { key: string; materialId?: string; courseId?: string; title: string; courseTitle?: string; sizeBytes: number; estimatedMinutes?: number; pinned?: boolean; contentVersion?: string; accessValidUntil?: number };
type Section = "courses" | "readings" | "videos" | "achievements" | "storage";
type NativeResult = { snapshot?: NativeOfflineLibrarySnapshot | null; expired?: boolean; identity?: OfflineCacheScope };
type ShellBridge = {
  getLibrary(): Promise<NativeResult>;
  listReadings(): Promise<{ items?: Summary[]; totalBytes?: number }>;
  getReading(key: string): Promise<{ reading?: Record<string, unknown> | null }>;
  clear(): Promise<unknown>;
};
declare global {
  interface Window {
    __ZYX_NATIVE_SERVER_ORIGIN__?: string;
    zyxOfflineShell?: { ready: Promise<void>; hasSnapshot: boolean; hasIdentity: boolean; refresh: () => Promise<void> };
  }
}

const cap = getCapacitor()?.Plugins?.ZyxOfflineStore;
const invoke = getTauri()?.core?.invoke;
const bridge: ShellBridge | null = cap?.getLibrarySnapshot ? {
  getLibrary: () => cap.getLibrarySnapshot!() as Promise<NativeResult>,
  listReadings: () => cap.listReadings() as Promise<{ items?: Summary[]; totalBytes?: number }>,
  getReading: key => cap.getReading({ key }),
  clear: () => cap.clearLibrarySnapshot!(),
} : invoke ? {
  getLibrary: () => invoke("get_offline_library_snapshot") as Promise<NativeResult>,
  listReadings: () => invoke("list_offline_readings") as Promise<{ items?: Summary[]; totalBytes?: number }>,
  getReading: key => invoke("get_offline_reading", { key }) as Promise<{ reading?: Record<string, unknown> | null }>,
  clear: () => invoke("clear_offline_library_snapshot"),
} : null;

function nativeFetcher(scope: OfflineCacheScope): typeof fetch {
  return async (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request?.url ?? String(input), scope.environment);
    if (url.origin !== scope.environment) throw new Error("Offline resource origin is not allowed");
    const headers = new Headers(init?.headers ?? request?.headers);
    const options = {
      path: url.pathname + url.search,
      method: (init?.method ?? request?.method ?? "GET").toUpperCase() as "GET" | "POST",
      body: typeof init?.body === "string" ? init.body : request && request.method !== "GET" ? await request.text() : undefined,
      etag: headers.get("If-None-Match") ?? undefined,
      expectedAccountId: scope.userId,
      expectedScopeKey: scope.scopeKey,
    };
    if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const response = cap?.offlineRequest ? await cap.offlineRequest(options)
      : await invoke!("offline_request", options) as { status: number; headers: Record<string, string>; bodyBase64: string };
    if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const bytes = Uint8Array.from(atob(response.bodyBase64), char => char.charCodeAt(0));
    return new Response(response.status === 304 || response.status === 204 ? null : bytes, { status: response.status, headers: response.headers });
  };
}

let snapshot: NativeOfflineLibrarySnapshot | null = null;
let items: Summary[] = [];
let bytes = 0;
let locale: "id" | "en" = document.documentElement.lang === "en" ? "en" : "id";
let localeChosenByUser = false;
let section: Section = "courses";
let selectedCourse: string | null = null;
let expired = false;
let syncing = false;
let error: "network" | "storage" | "access" | null = null;
let activeKey: string | null = null;
let activeVersion: string | null = null;
let controller: ReturnType<typeof createOfflineSyncController> | null = null;
let currentScope: OfflineCacheScope | null = null;
let configuredOrigin: string | null = null;
let lastCheck = 0;
let isRendering = false;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;

const root = document.createElement("section");
root.className = "offline-v2";
root.id = "offline-library-v2";
document.getElementById("home-view")?.prepend(root);
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag); el.className = className; if (text) el.textContent = text; return el;
}
function action(text: string, onClick: () => void | Promise<void>, className = "offline-v2-text-button"): HTMLButtonElement {
  const el = node("button", className, text); el.type = "button"; el.addEventListener("click", () => { void onClick(); }); return el;
}
function formatBytes(value: number): string { return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`; }
function date(value: number): string { return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", { dateStyle: "medium", timeStyle: "short" }).format(value); }
function empty(title: string, description?: string): HTMLElement {
  const block = node("div", "offline-v2-empty"); block.append(node("strong", "", title)); if (description) block.append(node("p", "", description)); return block;
}
function readingFor(materialId: string): Summary | undefined { return items.find(item => item.materialId === materialId); }
function openReading(item: Summary): void {
  activeKey = item.key; activeVersion = item.contentVersion ?? null;
  window.dispatchEvent(new CustomEvent("zyx:offline-open-reading", { detail: { key: item.key } }));
}
function trustedOrigin(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try { const url = new URL(raw); return url.protocol === "https:" && ["staging.zyxacademy.com", "www.zyxacademy.com", "zyxacademy.com"].includes(url.hostname) ? url.origin : null; } catch { return null; }
}
function showOnline(): void {
  const origin = configuredOrigin;
  if (!origin) { error = "network"; render(); return; }
  // This is a bundled native document, outside the Next router and its origin.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`${origin}/dashboard`);
}
async function refreshNative(): Promise<void> {
  if (!bridge || isRendering) return;
  isRendering = true;
  try {
    const [library, readings] = await Promise.all([bridge.getLibrary(), bridge.listReadings()]);
    snapshot = visibleOfflineLibrary(library.snapshot ?? null); expired = Boolean(library.expired);
    const courseIds = new Set(snapshot?.courses.map(course => course.id));
    items = (readings.items ?? []).filter(item => courseIds.has(item.courseId ?? "") && (item.accessValidUntil ?? 0) > Date.now());
    bytes = readings.totalBytes ?? 0;
    if (expiryTimer) clearTimeout(expiryTimer);
    if (snapshot) {
      const leases = [snapshot.accessValidUntil, ...snapshot.courses.map(course => course.accessValidUntil), ...snapshot.materials.map(material => material.accessValidUntil), ...items.map(item => item.accessValidUntil)].filter((value): value is number => typeof value === "number" && value > Date.now());
      expiryTimer = setTimeout(() => { void refreshNative(); }, Math.max(1, Math.min(...leases) - Date.now() + 1));
    }
    if (window.zyxOfflineShell) window.zyxOfflineShell.hasSnapshot = Boolean(snapshot);
    if (activeKey) {
      const updated = items.find(item => item.key === activeKey);
      if (!updated) { window.dispatchEvent(new Event("zyx:offline-lock-reader")); activeKey = null; activeVersion = null; }
      else if (updated.contentVersion !== activeVersion) showReaderUpdate(updated);
    }
    render();
  } finally { isRendering = false; }
}
function showReaderUpdate(item: Summary): void {
  let bar = document.getElementById("offline-reader-update");
  if (!bar) { bar = node("div"); bar.id = "offline-reader-update"; document.querySelector("#reader-view .reader-bar")?.after(bar); }
  bar.replaceChildren(node("span", "", OFFLINE_LIBRARY_COPY[locale].updateAvailable), action(OFFLINE_LIBRARY_COPY[locale].updateNow, () => { openReading(item); bar!.hidden = true; }));
  bar.hidden = false;
}
async function sync(): Promise<void> {
  if (!controller || syncing) return;
  if (navigator.onLine === false) { error = "network"; render(); return; }
  syncing = true; error = null; render();
  try { await controller.sync(); lastCheck = Date.now(); await refreshNative(); }
  catch { error = "network"; }
  finally { syncing = false; render(); }
}
async function saveMaterial(material: NativeOfflineLibrarySnapshot["materials"][number]): Promise<void> {
  if (!controller || navigator.onLine === false) return;
  syncing = true; render();
  try {
    await controller.refreshResource({ kind: material.kind === "diktat" ? "diktat" : "article", id: material.id, courseId: material.courseId }, { pinned: true });
    await refreshNative();
  } catch { error = "storage"; }
  finally { syncing = false; render(); }
}
function readingRow(item: Summary, storage = false): HTMLElement {
  const copy = OFFLINE_LIBRARY_COPY[locale];
  const row = node("li", "offline-v2-row");
  row.append(node("span", "offline-v2-symbol", item.pinned ? "↓" : "Aa"));
  const main = action("", () => openReading(item), "offline-v2-row-main");
  main.append(node("p", "offline-v2-row-title", item.title), node("p", "offline-v2-row-meta", [item.courseTitle, formatBytes(item.sizeBytes), item.estimatedMinutes ? `${item.estimatedMinutes} ${copy.minutes}` : "", item.pinned ? copy.pinned : ""].filter(Boolean).join(" · ")));
  const controls = node("div", "offline-v2-row-actions");
  if (storage) controls.append(action(item.pinned ? copy.unpin : copy.pin, async () => { await setOfflineReadingPinned(item.key, !item.pinned); await refreshNative(); }));
  controls.append(action(storage ? copy.remove : copy.open, async () => { if (storage) { await removeOfflineReadingByKey(item.key); await refreshNative(); } else openReading(item); }));
  row.append(main, controls); return row;
}
function clearDialog(): void {
  const copy = OFFLINE_LIBRARY_COPY[locale];
  const dialog = node("dialog", "offline-v2-dialog");
  dialog.append(node("h2", "", copy.clearTitle), node("p", "", copy.clearBody));
  const controls = node("div", "offline-v2-dialog-actions");
  controls.append(action(copy.cancel, () => { dialog.close(); dialog.remove(); }, "btn btn-outline"));
  controls.append(action(copy.clear, async () => {
    await clearAllOfflineReadings();
    items = []; bytes = 0;
    dialog.close(); dialog.remove(); await refreshNative();
  }, "btn btn-primary"));
  dialog.append(controls); document.body.append(dialog); dialog.showModal();
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
}
function render(): void {
  if (!bridge) return;
  const copy = OFFLINE_LIBRARY_COPY[locale];
  document.body.classList.add("offline-v2-ready");
  if (window.zyxOfflineShell?.hasIdentity) {
    document.getElementById("startup-splash")?.classList.add("hidden");
    document.getElementById("offline-shell")?.classList.remove("hidden");
  }
  root.replaceChildren();
  const head = node("div", "offline-v2-head");
  const title = node("div"); title.append(node("h1", "", copy.title));
  if (snapshot?.lastVerifiedAt) title.append(node("p", "offline-v2-meta", `${copy.lastChecked} ${date(snapshot.lastVerifiedAt)}`));
  const controls = node("div", "offline-v2-head-actions");
  const state = syncing ? "syncing" : error ? "error" : navigator.onLine === false ? "offline" : "ready";
  const status = node("span", "offline-v2-status", syncing ? copy.syncing : navigator.onLine === false ? copy.offline : copy.ready);
  status.dataset.state = state; status.setAttribute("role", "status"); controls.append(status);
  const syncButton = action(copy.sync, sync, "btn btn-outline"); syncButton.disabled = syncing || !controller; controls.append(syncButton);
  if (navigator.onLine !== false) controls.append(action(copy.openOnline, showOnline, "btn btn-ghost"));
  head.append(title, controls); root.append(head);
  const layout = node("div", "offline-v2-layout");
  const nav = node("nav", "offline-v2-nav"); nav.setAttribute("aria-label", copy.title);
  const narrow = window.matchMedia("(max-width: 640px)").matches;
  for (const key of (narrow ? ["courses", "readings", "videos"] : ["courses", "readings", "videos", "achievements", "storage"]) as Section[]) {
    const button = action(copy[key], () => { section = key; selectedCourse = null; render(); }, "");
    button.dataset.section = key; button.setAttribute("aria-current", key === section ? "page" : "false"); nav.append(button);
  }
  if (narrow) {
    const more = node("details", "offline-v2-more");
    const trigger = node("summary", "", `${copy.more} ▾`);
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.dataset.current = String(section === "achievements" || section === "storage");
    const menu = node("div", "offline-v2-more-menu"); menu.setAttribute("role", "menu");
    for (const key of ["achievements", "storage"] as Section[]) {
      const item = action(copy[key], () => { section = key; selectedCourse = null; render(); document.querySelector<HTMLElement>(".offline-v2-more summary")?.focus(); }, "");
      item.dataset.section = key; item.setAttribute("role", "menuitem"); item.setAttribute("aria-current", section === key ? "page" : "false"); menu.append(item);
    }
    more.append(trigger, menu); nav.append(more);
    more.addEventListener("toggle", () => trigger.setAttribute("aria-expanded", String(more.open)));
    more.addEventListener("keydown", event => {
      if (event.key === "Escape") { more.open = false; trigger.focus(); event.preventDefault(); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault(); more.open = true;
        const buttons = Array.from(menu.querySelectorAll("button")); const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }
    });
  }
  layout.append(nav);
  const content = node("div", "offline-v2-content");
  if (expired || error) {
    const notice = node("p", "offline-v2-notice", expired ? copy.expired : error === "storage" ? copy.storageFailed : error === "access" ? copy.unavailable : copy.syncFailed);
    notice.setAttribute("role", "status"); content.append(notice);
  }
  const contentHead = node("div", "offline-v2-content-head");
  const chosen = snapshot?.courses.find(course => course.id === selectedCourse);
  contentHead.append(node("h2", "", chosen?.title ?? copy[section]));
  if (selectedCourse) contentHead.append(action(copy.allCourses, () => { selectedCourse = null; render(); }));
  else contentHead.append(node("span", "offline-v2-count", section === "courses" ? String(snapshot?.courses.length ?? 0) : section === "readings" ? String(items.length) : ""));
  content.append(contentHead);
  if (!snapshot && section !== "storage") {
    content.append(empty(copy.emptyTitle, expired ? copy.expired : copy.emptyBody), action(copy.openOnline, showOnline, "btn btn-primary"));
  } else if (section === "courses") {
    const list = node("ul", "offline-v2-list");
    if (selectedCourse) {
      const materials = snapshot!.materials.filter(item => item.courseId === selectedCourse && item.kind !== "video");
      for (const material of materials) {
        const saved = readingFor(material.id);
        const row = node("li", "offline-v2-row");
        row.append(node("span", "offline-v2-symbol", material.kind === "diktat" ? "D" : "Aa"));
        const main = node("div", "offline-v2-row-main");
        main.append(node("p", "offline-v2-row-title", material.title), node("p", "offline-v2-row-meta", `${material.kind === "diktat" ? copy.diktat : copy.article} · ${saved ? copy.saved : copy.notSaved}`));
        const button = action(saved ? copy.open : copy.save, () => saved ? openReading(saved) : saveMaterial(material));
        button.disabled = !saved && (navigator.onLine === false || syncing);
        row.append(main, button); list.append(row);
      }
      if (!materials.length) content.append(empty(copy.emptyReadings, copy.emptyReadingsBody));
    } else {
      for (const course of snapshot!.courses) {
        const row = node("li", "offline-v2-row"); row.append(node("span", "offline-v2-symbol", course.code?.slice(0,2) ?? "M"));
        const button = action("", () => { selectedCourse = course.id; render(); }, "offline-v2-row-main");
        const count = snapshot!.materials.filter(item => item.courseId === course.id).length;
        button.append(node("p", "offline-v2-row-title", course.title), node("p", "offline-v2-row-meta", `${count} ${copy.items} · ${items.filter(item => item.courseId === course.id).length} ${copy.saved.toLowerCase()}`));
        row.append(button, action(copy.open, () => { selectedCourse = course.id; render(); })); list.append(row);
      }
      if (!snapshot!.courses.length) content.append(empty(copy.noCourses, copy.emptyBody));
    }
    content.append(list);
  } else if (section === "readings") {
    const list = node("ul", "offline-v2-list"); for (const item of items) list.append(readingRow(item)); content.append(items.length ? list : empty(copy.emptyReadings, copy.emptyReadingsBody));
  } else if (section === "videos") {
    const videos = snapshot!.materials.filter(item => item.kind === "video");
    if (videos.length) content.append(node("p", "offline-v2-meta", copy.videoNeedsConnection));
    const list = node("ul", "offline-v2-list");
    for (const video of videos) {
      const row = node("li", "offline-v2-row");
      if (video.thumbnailUrl?.startsWith("data:image/")) { const image = node("img", "offline-v2-thumb"); image.src = video.thumbnailUrl; image.alt = ""; row.append(image); }
      else row.append(node("span", "offline-v2-symbol", "▷"));
      const main = node("div", "offline-v2-row-main"); main.append(node("p", "offline-v2-row-title", video.title), node("p", "offline-v2-row-meta", snapshot!.courses.find(c => c.id === video.courseId)?.title ?? copy.video));
      const button = action(copy.open, () => { try { const url = new URL(video.videoUrl ?? ""); if (url.protocol === "https:") window.open(url.href, "_blank", "noopener,noreferrer"); } catch {} });
      button.disabled = navigator.onLine === false; row.append(main, button); list.append(row);
    }
    content.append(videos.length ? list : empty(copy.noVideos));
  } else if (section === "achievements") {
    const list = node("ul", "offline-v2-list");
    for (const achievement of snapshot!.achievements) { const row = node("li", "offline-v2-row"); row.append(node("span", "offline-v2-symbol", "✓")); const text = node("div", "offline-v2-row-main"); text.append(node("p", "offline-v2-row-title", achievement.title)); if (achievement.description) text.append(node("p", "offline-v2-row-meta", achievement.description)); row.append(text); list.append(row); }
    content.append(snapshot!.achievements.length ? list : empty(copy.noAchievements));
  } else if (section === "storage") {
    const storage = node("div", "offline-v2-storage"); const values = node("div", "offline-v2-storage-meta"); values.append(node("strong", "", formatBytes(bytes)), node("span", "", `${copy.of} ${formatBytes(snapshot?.policy.maxBytes ?? 100 * 1024 * 1024)}`)); storage.append(values);
    const meter = node("meter"); meter.min = 0; meter.max = snapshot?.policy.maxBytes ?? 100 * 1024 * 1024; meter.value = bytes; meter.setAttribute("aria-label", copy.usage); storage.append(meter, node("p", "offline-v2-meta", copy.pinnedHelp));
    if (snapshot?.accessValidUntil) storage.append(node("p", "offline-v2-meta", `${copy.accessUntil} ${date(snapshot.accessValidUntil)}`));
    content.append(storage); const list = node("ul", "offline-v2-list"); for (const item of items) list.append(readingRow(item, true)); content.append(list);
    if (snapshot || items.length) content.append(action(copy.clear, clearDialog)); else content.append(empty(copy.emptyReadings));
  }
  layout.append(content); root.append(layout);
}

async function initialize(): Promise<void> {
  configuredOrigin = trustedOrigin(window.__ZYX_NATIVE_SERVER_ORIGIN__);
  if (invoke) {
    try { configuredOrigin = trustedOrigin(await invoke("get_desktop_server_origin")) ?? configuredOrigin; } catch { /* Keep the bundled channel configuration. */ }
  }
  if (!bridge) return;
  try {
    const initial = await bridge.getLibrary(); snapshot = initial.snapshot ?? null; expired = Boolean(initial.expired);
    const identity = snapshot ?? initial.identity;
    if (identity?.userId && identity.environment && (identity.locale === "id" || identity.locale === "en")) {
      currentScope = createOfflineScope(identity.userId, identity.environment, identity.locale); setOfflineScope(currentScope);
      if (!localeChosenByUser) {
        locale = identity.locale;
        document.getElementById(locale === "id" ? "lang-id" : "lang-en")?.click();
      }
      window.zyxOfflineShell!.hasIdentity = true;
      await refreshNative();
      await hydrateNativeOfflineReadings(currentScope);
      controller = createOfflineSyncController({ scope: currentScope, fetcher: nativeFetcher(currentScope), initialSnapshot: snapshot ?? undefined, onSnapshot: next => { snapshot = next; error = next.syncError ?? null; void refreshNative(); } });
      render();
      if (navigator.onLine !== false) void sync();
    } else { await refreshNative(); }
  } catch { error = "storage"; render(); }
}

let resolveReady!: () => void;
window.zyxOfflineShell = { ready: new Promise(resolve => { resolveReady = resolve; }), hasSnapshot: false, hasIdentity: false, refresh: refreshNative };
// The inline shell installs its locale and reader handlers after this bundle.
// Wait for those handlers, while keeping server work outside the launch gate.
const start = () => {
  if (!localeChosenByUser) locale = document.documentElement.lang === "en" ? "en" : "id";
  void initialize().finally(resolveReady);
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
window.addEventListener(OFFLINE_CACHE_CHANGED_EVENT, () => { void refreshNative(); });
window.addEventListener("zyx:offline-reader-closed", () => { activeKey = null; activeVersion = null; document.getElementById("offline-reader-update")?.setAttribute("hidden", ""); });
window.addEventListener("online", () => { void sync(); });
window.addEventListener("offline", render);
window.matchMedia("(max-width: 640px)").addEventListener("change", render);
document.addEventListener("click", event => {
  const menu = document.querySelector<HTMLDetailsElement>(".offline-v2-more[open]");
  if (menu && !menu.contains(event.target as Node)) menu.open = false;
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { void refreshNative(); if (Date.now() - lastCheck > 15_000) void sync(); } });
for (const lang of ["id", "en"] as const) document.getElementById(`lang-${lang}`)?.addEventListener("click", event => { if (event.isTrusted) localeChosenByUser = true; locale = lang; render(); });
setInterval(() => {
  if (document.visibilityState !== "visible") return;
  if (snapshot && snapshot.accessValidUntil <= Date.now()) { void refreshNative(); }
  if (Date.now() - lastCheck >= (snapshot?.policy.activeCheckIntervalMs ?? 60_000)) void sync();
}, 15_000);
window.addEventListener("pagehide", () => controller?.dispose());
