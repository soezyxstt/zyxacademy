import { describe, it, expect } from "bun:test";
import { POST as opsAiPost } from "@/app/api/admin/ops-ai/route";
import { POST as executePost } from "@/app/api/admin/ops-ai/execute/route";

describe("Zyx Ops AI API Authorization & Validation", () => {
  it("rejects unauthenticated requests on /api/admin/ops-ai", async () => {
    const req = new Request("http://localhost:3000/api/admin/ops-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Halo" }],
      }),
    });

    const res = await opsAiPost(req);
    expect(res.status).toBe(401);
  });

  it("rejects unauthenticated requests on /api/admin/ops-ai/execute", async () => {
    const req = new Request("http://localhost:3000/api/admin/ops-ai/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposal: { id: "test", type: "create_token", params: {} },
      }),
    });

    const res = await executePost(req);
    expect(res.status).toBe(401);
  });
});

