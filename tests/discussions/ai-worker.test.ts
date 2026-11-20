import { it } from "bun:test";
import { runIsolatedAiTest } from "./run-isolated-ai-test";

it("isolates the discussion AI worker fixtures", () => runIsolatedAiTest(new URL("./ai-worker.fixture.ts", import.meta.url)), 60_000);
