import { expect, test } from "bun:test";
import { benchmarkAgentWorkflow } from "../../scripts/authoring/benchmark-agent-workflow";

test("benchmark reports scoped byte and execution savings without removing requirements", async () => {
  const report = await benchmarkAgentWorkflow();
  expect(report.synthetic).toBe(true);
  const [short, long] = report.cases;
  expect(long.content.authoredJsonBytes).toBeGreaterThan(short.content.authoredJsonBytes * 2);
  expect(long.editResponse.compactBytes).toBe(short.editResponse.compactBytes);
  for (const value of report.cases) {
    expect(value.editResponse.targetedBytes).toBeLessThan(value.editResponse.fullBytes);
    expect(value.verification.current.pdfCalls).toBe(1);
    expect(value.verification.baseline.pdfCalls).toBe(2);
    expect(value.verification.requiredChecks).toBe(value.verification.recordedChecks);
    expect(value.verification.invalidStructure.currentBrowserCalls).toBe(0);
    expect(value.retry.withCheckpoint.retry.browserCalls).toBeLessThan(value.retry.withoutCheckpoint.retry.browserCalls);
    expect(value.retry.withCheckpoint.retry.executeCalls).toBeLessThan(value.retry.withoutCheckpoint.retry.executeCalls);
    expect(value.retry.withCheckpoint.requiredChecks).toBe(value.retry.withCheckpoint.recordedChecks);
  }
});
