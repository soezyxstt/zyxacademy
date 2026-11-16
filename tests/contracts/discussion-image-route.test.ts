import { beforeEach, describe, expect, mock, test } from "bun:test";
import { DiscussionImageError } from "@/lib/discussions/image-policy";

let signedIn: boolean;
let readable: boolean;
let uploads: number;
let rateLimited: boolean;
let pixelLimit: boolean;
let uploadFailure: Error | null;
let requestedPreview: boolean | undefined;
const image = { id: "image", name: 'soal".png', mime: "image/png", size: 3, width: 1, height: 1, url: "/api/discussions/attachments/image", downloadUrl: "/api/discussions/attachments/image?download=1" };

mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => signedIn ? { user: { id: "owner" } } : null } } }));
mock.module("@/lib/discussions/images", () => ({
  uploadDiscussionImage: async ({ actorId, channelId }: { actorId: string; channelId: string }) => { uploads++; expect(actorId).toBe("owner"); expect(channelId).toBe("channel"); if (uploadFailure) throw uploadFailure; if (rateLimited) throw new Error("DISCUSSION_IMAGE_RATE_LIMIT"); if (pixelLimit) throw new DiscussionImageError("pixels"); return image; },
  readDiscussionImage: async (_actorId: string, _id: string, preview: boolean) => { requestedPreview = preview; return readable ? { image, bytes: new Uint8Array([1, 2, 3]) } : null; },
}));

const { POST } = await import("@/app/api/discussions/attachments/route");
const { GET } = await import("@/app/api/discussions/attachments/[id]/route");
const context = { params: Promise.resolve({ id: "image" }) };

beforeEach(() => { signedIn = true; readable = true; uploads = 0; rateLimited = false; pixelLimit = false; uploadFailure = null; requestedPreview = undefined; });

describe("discussion attachment routes", () => {
  test("storage outages use retry guidance while denied access stays explicit", async () => {
    const form = new FormData();
    form.set("channelId", "channel");
    form.set("file", new File(["abc"], "a.png", { type: "image/png" }));
    const request = () => new Request("https://example.com/api/discussions/attachments", { method: "POST", headers: { origin: "https://example.com" }, body: form });
    uploadFailure = new Error("private provider diagnostic");
    const outage = await POST(request());
    expect(outage.status).toBe(503);
    expect(await outage.json()).toEqual({ code: "unknown", error: "Gambar belum dapat diunggah. Coba lagi." });
    uploadFailure = new Error("DISCUSSION_UNAVAILABLE");
    const denied = await POST(request());
    expect(denied.status).toBe(403);
    expect((await denied.json()).code).toBe("access");
  });
  test("private reads fail closed and emit safe delivery headers", async () => {
    const request = new Request("https://example.com/api/discussions/attachments/image?download=1");
    signedIn = false;
    expect((await GET(request, context)).status).toBe(404);
    signedIn = true;
    readable = false;
    expect((await GET(request, context)).status).toBe(404);
    readable = true;
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toBe("sandbox");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="gambar"; filename*=UTF-8\'\'soal%22.png');
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.has("location")).toBe(false);
    expect(requestedPreview).toBe(false);
    const preview = await GET(new Request("https://example.com/api/discussions/attachments/image?preview=1"), context);
    expect(requestedPreview).toBe(true);
    expect(preview.headers.get("content-type")).toBe("image/webp");
    expect(preview.headers.get("cache-control")).toBe("private, no-store");
    expect(preview.headers.get("content-disposition")).toStartWith("inline;");
    await GET(new Request("https://example.com/api/discussions/attachments/image?preview=1&download=1"), context);
    expect(requestedPreview).toBe(false);
  });

  test("upload requires an authenticated same-origin request and returns the DTO only", async () => {
    const form = new FormData();
    form.set("channelId", "channel");
    form.set("file", new File(["abc"], "a.png", { type: "image/png" }));
    const request = (origin: string) => new Request("https://example.com/api/discussions/attachments", { method: "POST", headers: { origin }, body: form });
    signedIn = false;
    expect((await POST(request("https://example.com"))).status).toBe(401);
    signedIn = true;
    expect((await POST(request("https://evil.test"))).status).toBe(400);
    expect(uploads).toBe(0);
    const response = await POST(request("https://example.com"));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.json()).toEqual(image);
    expect(uploads).toBe(1);
    rateLimited = true;
    expect((await POST(request("https://example.com"))).status).toBe(429);
    rateLimited = false;
    pixelLimit = true;
    const pixels = await POST(request("https://example.com"));
    expect(pixels.status).toBe(400);
    expect(await pixels.json()).toEqual({ code: "pixels", error: "Dimensi gambar maksimal 4096 piksel per sisi dan 16 juta piksel." });
  });
});
