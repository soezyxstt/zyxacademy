import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { verifyBuild } from "./build-provenance";
import { spawnOwnedLocalProductionServer, stopOwnedServer } from "./navigation-baseline-harness";
import { fetchFreshSignedSessionCookie, loadVerifiedStagingEnvironment, probeReadOnlySessionAndFixtures, probeSessionCookieName, validateLoopbackBaseUrl } from "./staging-env-loader";

// Local guardrails are proposed safety limits, not Cloud Run capacity thresholds.
export function validateLimits(requests: number, timeoutMs: number, durationMs: number, rssBytes: number) {
  if (![requests, timeoutMs, durationMs, rssBytes].every(Number.isSafeInteger) || requests < 1 || requests > 8 || timeoutMs < 100 || timeoutMs > 10000 || durationMs < timeoutMs || durationMs > 120000 || rssBytes < 1 || rssBytes > 2 * 1024 ** 3) throw new Error("INVALID_CAPACITY_LIMITS");
}

// Sum the owned process tree; unavailable accounting stops the run rather than reporting zero.
export function ownedRss(pid: number): number | null {
  try {
    const children = readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8").trim();
    const status = readFileSync(`/proc/${pid}/status`, "utf8");
    const match = /^VmRSS:\s+(\d+)\s+kB/m.exec(status);
    if (!match) return null;
    let total = Number(match[1]) * 1024;
    for (const child of children ? children.split(/\s+/).map(Number) : []) {
      const rss = ownedRss(child);
      if (rss === null) return null;
      total += rss;
    }
    return total;
  } catch { return null; }
}

async function main() {
  const base = process.argv[2] ?? "http://localhost:3100";
  const url = validateLoopbackBaseUrl(base);
  const port = Number(url.port || 3100);
  const requests = 8, timeoutMs = 10000, durationMs = 120000, rssLimit = 1024 ** 3;
  validateLimits(requests, timeoutMs, durationMs, rssLimit);
  // The 120 s lifecycle budget reserves the last 5 s for process cleanup.
  const operationMs = durationMs - 5000;
  let child: Awaited<ReturnType<typeof spawnOwnedLocalProductionServer>>["child"] | null = null;
  const abort = new AbortController();
  const deadline = setTimeout(() => { failure ??= "DURATION_LIMIT"; abort.abort(); }, operationMs);
  let peakRss: number | null = null;
  let failure: string | null = null;
  const results: { concurrency: number; latencyMs: number[]; completed: number }[] = [];
  let monitor: ReturnType<typeof setInterval> | undefined;
  try {
    const verification = loadVerifiedStagingEnvironment({ port });
    const provenance = verifyBuild("candidate", verification);
    abort.signal.throwIfAborted();
    const fixtures = await probeReadOnlySessionAndFixtures({ signal: abort.signal });
    const identity = fixtures.sessionUserSummary.userIdHash;
    if (!identity) throw new Error("NO_ACTIVE_ADMIN_FIXTURE_USER");
    const initial = await fetchFreshSignedSessionCookie({ expectedUserIdHash: identity, signal: abort.signal });
    child = (await spawnOwnedLocalProductionServer(base, "candidate", verification, provenance, abort.signal)).child;
    const probe = await probeSessionCookieName(base, initial.signedCookieValue, identity, abort.signal);
    if (!probe.verified || !probe.cookieName) throw new Error("AUTH_PROBE_FAILED");
    const cookieName = probe.cookieName;
    monitor = setInterval(() => {
      const rss = child?.pid ? ownedRss(child.pid) : null;
      if (rss === null) failure ??= "RSS_UNAVAILABLE";
      else { peakRss = Math.max(peakRss ?? 0, rss); if (rss > rssLimit) failure ??= "RSS_LIMIT"; }
      if (failure) abort.abort();
    }, 100);
    for (const concurrency of [1, 4, 8]) {
      if (failure) break;
      const row = { concurrency, latencyMs: [] as number[], completed: 0 };
      results.push(row);
      let next = 0;
      await Promise.all(Array.from({ length: concurrency }, async () => {
        while (!failure && next++ < requests) {
          try {
            const auth = await fetchFreshSignedSessionCookie({ expectedUserIdHash: identity, signal: abort.signal });
            if (failure) break;
            const begin = performance.now();
            const response = await fetch(new URL("/admin/courses", base), { headers: { cookie: `${cookieName}=${auth.signedCookieValue}` }, redirect: "manual", signal: AbortSignal.any([abort.signal, AbortSignal.timeout(timeoutMs)]) });
            if (!response.ok || response.redirected) throw new Error("HTTP_FAILURE");
            await response.arrayBuffer();
            row.latencyMs.push(Math.round((performance.now() - begin) * 100) / 100);
            row.completed++;
          } catch { failure ??= "REQUEST_OR_AUTH_FAILURE"; abort.abort(); }
        }
      }));
    }
  } catch {
    failure ??= "SETUP_OR_RUNTIME_FAILURE";
    throw new Error(failure);
  } finally {
    clearTimeout(deadline);
    if (monitor) clearInterval(monitor);
    abort.abort();
    await stopOwnedServer(child);
    mkdirSync("artifacts/performance/capacity", { recursive: true });
    writeFileSync("artifacts/performance/capacity/local.json", JSON.stringify({ environment: "local owned candidate server, staging read-only database", cloudRunVerified: false, limits: { requestsPerLevel: requests, timeoutMs, durationMs, operationMs, cleanupGraceMs: 5000, rssBytes: rssLimit, status: "proposed local safety limits" }, peakOwnedRssBytes: peakRss, failure, results }, null, 2));
  }
  if (failure) throw new Error(failure);
}
if (import.meta.main) main().catch(() => { console.error("Local capacity run failed; inspect sanitized capacity report if available."); process.exitCode = 1; });
