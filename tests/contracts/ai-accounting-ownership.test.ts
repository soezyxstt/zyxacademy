import { it } from "bun:test";
import { runIsolatedAiTest } from "../discussions/run-isolated-ai-test";

it("isolates the AI accounting fixtures", () => runIsolatedAiTest(new URL("./ai-accounting-ownership.fixture.ts", import.meta.url)), 60_000);
