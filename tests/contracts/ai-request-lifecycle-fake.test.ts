import { it } from "bun:test";
import { runIsolatedAiTest } from "../discussions/run-isolated-ai-test";

it("isolates the request lifecycle fixtures", () => runIsolatedAiTest(new URL("./ai-request-lifecycle-fake.fixture.ts", import.meta.url)), 60_000);
