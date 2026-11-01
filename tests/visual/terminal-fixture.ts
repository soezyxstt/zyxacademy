import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";

export async function mockZyraDrawer(page: Page) {
  await page.route("**/api/zyra/attachments/image-id**", route => route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64") }));
  await page.route("**/api/zyra/allowance**", route => route.fulfill({ json: { summary: null } }));
  await page.route("**/visual-fixtures/coding**", async route => {
    const action = route.request().headers()["next-action"];
    if (!action) return route.fallback();
    const manifest = JSON.parse(readFileSync(".next/dev/server/server-reference-manifest.json", "utf8"));
    const name = manifest.node[action]?.exportedName;
    const response = name === "getTutorCourseContextAction" ? "Berpikir komputasi"
      : name === "loadTutorHistoryAction" ? { sessionId: "zyra-session", messages: [
        { id: "old-user", role: "student", content: "Bagaimana cara menghitung luas?" },
        { id: "old-ai", role: "ai", content: "Kalikan panjang dengan lebar." },
      ] }
      : name === "listTutorSessionsAction" ? [{ id: "zyra-session", title: "Luas persegi panjang", messageCount: 0, lastMessageAt: null }]
      : { success: true, sessionId: "zyra-session" };
    await route.fulfill({ contentType: "text/x-component", body: `0:{"a":"$@1","f":"","b":"development"}\n1:${JSON.stringify(response)}\n` });
  });
}

export async function mockTerminal(page: Page) {
  await page.route("**/api/auth/get-session**", route => route.fulfill({ json: { user: { id: "coding-student", name: "Test", email: "test@example.test" }, session: { id: "session", userId: "coding-student", expiresAt: "2099-01-01T00:00:00.000Z" } } }));
  await page.route("**/api/coding/drafts**", route => route.fulfill({ json: route.request().method() === "GET" ? { draft: null } : { revision: 1 } }));
  await page.route("**/api/coding/terminal", route => route.fulfill({ json: { url: "wss://zyx-py-runtime.onrender.com/v1/terminal", ticket: "body.signature" } }));
  await page.route("**/api/coding/problems/**", route => route.fulfill({ json: { problem: { problemId: "sum-even", version: 1, courseId: "coding-course", language: "python", title: "Jumlah genap", prompt: "Hitung.", learningObjectives: ["Perulangan"], starterCode: "", publicTests: [], limits: { timeoutMs: 1000, maxOutputChars: 8000 } } } }));
  await page.route("**/api/coding/submissions**", route => route.fulfill({ json: { attempts: [] } }));
  await page.routeWebSocket("wss://zyx-py-runtime.onrender.com/v1/terminal", ws => {
    let stage = 0, code = "", first = "";
    const sendOutput = (text: string) => ws.send(JSON.stringify({ type: "output", stream: "stdout", data: Buffer.from(text).toString("base64") }));
    ws.onMessage(message => {
      const event = JSON.parse(String(message));
      if (event.type === "prepare") ws.send(JSON.stringify({ type: "prepared" }));
      else if (event.type === "start") {
        code = event.code; ws.send(JSON.stringify({ type: "running" }));
        if (code.includes("while True")) sendOutput("mulai\n");
        else if (code.includes("raise ValueError")) { sendOutput("ValueError: contoh\n"); ws.send(JSON.stringify({ type: "result", status: "error" })); }
        else if (code.includes("input(")) sendOutput("Nama: ");
        else { sendOutput("selesai\n"); ws.send(JSON.stringify({ type: "result", status: "completed" })); }
      } else if (event.type === "input") {
        if (code.includes("Kota:") && stage === 0) { first = event.data.trim(); stage++; sendOutput("Kota: "); }
        else { sendOutput(code.includes("Kota:") ? `Halo ${first} dari ${event.data.trim()}\n` : `Halo, ${event.data.trim()}\n`); ws.send(JSON.stringify({ type: "result", status: "completed" })); }
      } else if (event.type === "stop") ws.send(JSON.stringify({ type: "result", status: "stopped" }));
    });
    setTimeout(() => ws.send(JSON.stringify({ type: "ready" })), 600);
  });
}
