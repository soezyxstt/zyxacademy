import { describe, expect, mock, test } from "bun:test";
import { handleNativeBroadcast } from "@/lib/native/academic/administration/broadcast-handler";

const origin = "https://native.test";
const id = "5fb11703-5496-421a-8938-fc10ec522020";
const viewer = { user: { id: "admin" }, session: { id: "native-session" } };
const draft = { title: " New schedule ", body: " Check your inbox ", link: "", target: "all" as const, targetId: "" };
const receipt = { id, draft, audience: "Semua pengguna", recipientCount: 3, status: "prepared" as const };
function post(body: unknown, site = origin, requestId = id) {
  return new Request(`${origin}/api/native/academic-administration/notifications/broadcast`, {
    method: "POST", body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", Origin: site, "Idempotency-Key": requestId },
  });
}
function services() {
  return {
    session: mock(async () => viewer),
    read: mock(async () => ({ courses: [], receipt })),
    prepare: mock(async (..._args: Parameters<Parameters<typeof handleNativeBroadcast>[2]["prepare"]>) => receipt),
    transition: mock(async (..._args: Parameters<Parameters<typeof handleNativeBroadcast>[2]["transition"]>) => ({ ...receipt, status: "queued" as const })),
  };
}

describe("native Admin notification route", () => {
  test("prepare returns a private receipt and never confirms the effect", async () => {
    const deps = services();
    const response = await handleNativeBroadcast(post({ action: "prepare", draft }), origin, deps);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(deps.prepare).toHaveBeenCalledWith(viewer, id, { ...draft, title: "New schedule", body: "Check your inbox", link: "/dashboard" });
    expect(deps.transition).not.toHaveBeenCalled();
  });
  test("rejects foreign origins, unsafe links, target widening, and modified confirm requests", async () => {
    const deps = services();
    const route = (request: Request) => handleNativeBroadcast(request, origin, deps);
    expect((await route(post({ action: "prepare", draft }, "https://foreign.test"))).status).toBe(403);
    expect((await route(post({ action: "prepare", draft: { ...draft, link: "//foreign.test" } }))).status).toBe(422);
    expect((await route(post({ action: "prepare", draft: { ...draft, target: "user" } }))).status).toBe(422);
    expect((await route(post({ action: "confirm", id, draft }))).status).toBe(422);
    expect((await route(post({ action: "confirm", id }, origin, crypto.randomUUID()))).status).toBe(400);
    expect(deps.prepare).not.toHaveBeenCalled();
    expect(deps.transition).not.toHaveBeenCalled();
  });
  test("passes confirm to the active session and requires a signed-in viewer", async () => {
    const deps = services();
    const request = new Request(`${origin}/api/native/academic-administration/notifications/broadcast`);
    expect((await handleNativeBroadcast(request, origin, { ...deps, session: async () => null })).status).toBe(401);
    expect(deps.read).not.toHaveBeenCalled();
    const response = await handleNativeBroadcast(post({ action: "confirm", id }), origin, deps);
    expect((await response.json()).receipt.status).toBe("queued");
    expect(deps.transition).toHaveBeenCalledWith(viewer, id, "confirm");
  });
});
