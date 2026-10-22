import { expect, test } from "bun:test";
import { Inngest } from "inngest";
import { serve } from "inngest/edge";

test("Deno Web API adapter accepts forced streaming and serves SDK discovery", async () => {
  const handler = serve({ client: new Inngest({ id: "verification-transport-test", isDev: true }), functions: [], streaming: true });
  const response = await handler(new Request("http://127.0.0.1/api/inngest"));
  expect(response.status).toBe(200);
  expect((await response.json()).function_count).toBe(0);
});
