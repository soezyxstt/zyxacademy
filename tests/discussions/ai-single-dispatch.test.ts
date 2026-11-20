import { it } from "bun:test";
import { runIsolatedAiTest } from "./run-isolated-ai-test";

it("isolates the single-dispatch integration fixtures", () => runIsolatedAiTest(new URL("./ai-single-dispatch.fixture.ts", import.meta.url)), 60_000);
