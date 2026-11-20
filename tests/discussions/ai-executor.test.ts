import { it } from "bun:test";
import { runIsolatedAiTest } from "./run-isolated-ai-test";

it("isolates the discussion AI executor fixtures", () => runIsolatedAiTest(new URL("./ai-executor.fixture.ts", import.meta.url)), 60_000);
