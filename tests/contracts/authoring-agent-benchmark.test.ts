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
    expect(value.verification.current.pdfCalls).toBe(0);
    expect(value.verification.current.browserCalls).toBe(0);
    expect(value.verification.finalPdf.pdfCalls).toBe(1);
    expect(value.verification.finalPdf.screenshotCalls).toBe(0);
    expect(value.verification.baseline.pdfCalls).toBe(1);
    expect(value.verification.requiredChecks).toBeLessThan(value.verification.baseline.requiredChecks);
    expect(value.verification.requiredChecks).toBe(value.verification.recordedChecks);
    expect(value.verification.invalidStructure.currentBrowserCalls).toBe(0);
    expect(value.retry.withCheckpoint.retry.browserCalls).toBe(0);
    expect(value.retry.withoutCheckpoint.retry.browserCalls).toBe(0);
    expect(value.retry.withCheckpoint.retry.executeCalls).toBeLessThan(value.retry.withoutCheckpoint.retry.executeCalls);
    expect(value.retry.withCheckpoint.requiredChecks).toBe(value.retry.withCheckpoint.recordedChecks);
  }
});
