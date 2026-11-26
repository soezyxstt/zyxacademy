import { expect, test } from "bun:test";
import { fetchOfflineCatalog, OfflineCatalogAccessError } from "../../apps/mobile-native/offline/catalog-client";
import { catalogGrant, type OfflineCatalogTarget } from "../../apps/mobile-native/offline/catalog-model";
import { NATIVE_OFFLINE_HEADERS, type NativeOfflineScope } from "../../apps/mobile-native/offline/sync-contract";
import { createNativeTransport } from "../../apps/mobile-native/network/transport";

const scope: NativeOfflineScope = { locale: "id", origin: "https://fixture.test", accountId: "student", sessionId: "session" };
const videoTarget = { kind: "video_catalog", id: "course", courseId: "course" } as const;
const achievementTarget = { kind: "achievement_catalog", id: "catalog", courseId: null } as const;
const now = 10_000;
const revision = "b".repeat(64);
const leaseExpiresAt = 80_000;
const cursor = "42";
const thumbnail = `/api/offline/asset?${new URLSearchParams({ ...videoTarget, locale: scope.locale, revision, asset: "https://thumbnail.test/cover.png" })}`;
const grant = catalogGrant({ fullContent: true, chapterIds: ["chapter"] });

function headers(overrides: HeadersInit = {}) {
  return new Headers({
    [NATIVE_OFFLINE_HEADERS.locale]: scope.locale,
    [NATIVE_OFFLINE_HEADERS.environment]: scope.origin,
    [NATIVE_OFFLINE_HEADERS.accountId]: scope.accountId,
    [NATIVE_OFFLINE_HEADERS.sessionId]: scope.sessionId,
    "x-offline-cursor": cursor, "x-offline-lease-expires-at": String(leaseExpiresAt),
    "x-offline-revision": revision, "x-offline-validated-at": String(now),
    ...Object.fromEntries(new Headers(overrides)),
  });
}

function envelope(target: OfflineCatalogTarget, overrides: Record<string, unknown> = {}) {
  const data = target.kind === "video_catalog" ? {
    playlists: [{ id: "playlist", title: "Playlist" }],
    videos: [{ id: "video", title: "Name", playlistId: "playlist", durationSeconds: 4, thumbnailUrl: thumbnail, videoUrl: "youtube/abc" }],
  } : { achievements: [{ id: "study", title: "Study", description: "", thresholds: [2, 10] }], owned: ["private"] };
  return {
    protocolVersion: 1, accountId: scope.accountId, sessionId: scope.sessionId, environment: scope.origin, locale: scope.locale,
    cursor, validatedAt: now, leaseExpiresAt, resource: { ...target, key: JSON.stringify([target.kind, target.courseId, target.id]), revision },
    data, assets: target.kind === "video_catalog" ? [{ url: thumbnail, required: false }] : [], ...overrides,
  };
}

function signed(fetcher: Parameters<typeof createNativeTransport>[0]["fetcher"]) {
  return createNativeTransport({ origin: scope.origin, fetcher }).setSession({ ...scope, readCookie: () => "session=fixture" });
}

test("uses authorized local catalog links and only retains bounded thumbnails with matching proof", async () => {
  const calls: string[] = [];
  const session = signed(async url => {
    const parsed = new URL(url);
    calls.push(parsed.pathname + parsed.search);
    if (parsed.pathname === "/api/offline/asset") return new Response(new Uint8Array([137, 80]), { headers: headers({ "Content-Type": "image/png" }) });
    return Response.json(envelope(videoTarget), { headers: headers() });
  });
  const catalog = await fetchOfflineCatalog(session, scope, videoTarget, cursor, new AbortController().signal, grant, () => now);
  expect(calls).toEqual(["/api/offline/resource?kind=video_catalog&id=course&locale=id&courseId=course", thumbnail]);
  expect(catalog).toMatchObject({ courseId: "course", grant, videos: [{ id: "video", title: "Name", playlistTitle: "Playlist", playable: true,
    thumbnail: { uri: "data:image/png;base64,iVA=", leaseExpiresAt } }] });
  expect(JSON.stringify(catalog)).not.toContain("youtube");
});

test("rejects wrong account, locale, course, expired or stale catalog responses", async () => {
  const responses = [
    () => Response.json(envelope(achievementTarget, { accountId: "other" }), { headers: headers() }),
    () => Response.json(envelope(achievementTarget), { headers: headers({ [NATIVE_OFFLINE_HEADERS.locale]: "en" }) }),
    () => Response.json(envelope(videoTarget), { headers: headers() }),
    () => Response.json(envelope(achievementTarget), { headers: headers({ "x-offline-lease-expires-at": String(now - 1) }) }),
  ];
  for (const response of responses) {
    await expect(fetchOfflineCatalog(signed(async () => response()), scope, achievementTarget, cursor, new AbortController().signal, undefined, () => now)).rejects.toThrow();
  }
  const session = signed(async () => Response.json(envelope(achievementTarget), { headers: headers() }));
  await expect(fetchOfflineCatalog(session, scope, achievementTarget, "43", new AbortController().signal, undefined, () => now)).rejects.toThrow();
});

test("projects achievement definitions alone and distinguishes actual account revocation", async () => {
  const session = signed(async () => Response.json(envelope(achievementTarget), { headers: headers() }));
  const value = await fetchOfflineCatalog(session, scope, achievementTarget, cursor, new AbortController().signal, undefined, () => now);
  expect(value).toMatchObject({ achievements: [{ id: "study", thresholds: [2, 10] }] });
  expect(JSON.stringify(value)).not.toContain("private");
  const denied = signed(async () => Response.json({ code: "OFFLINE_ACCESS_REVOKED" }, { status: 403 }));
  await expect(fetchOfflineCatalog(denied, scope, achievementTarget, cursor, new AbortController().signal, undefined, () => now))
    .rejects.toBeInstanceOf(OfflineCatalogAccessError);
});
