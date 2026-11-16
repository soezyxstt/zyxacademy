const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createReadHarness } = require("./read-retry-harness.cjs");

test("production read effect and retry handler retain a hidden failure", async () => {
 const page = { thread: { id: "thread", status: "open" }, messages: { observationReceipt: "receipt", items: [
  { id: "m1", seq: 1, revision: 1 }, { id: "m2", seq: 2, revision: 1 },
 ] } };
 let attempts = 0;
 const harness = createReadHarness(page, async (_thread, throughSeq) => {
  if (++attempts <= 3) throw new Error("offline");
  return { throughSeq };
 });
 try {
  await harness.tick(599);
  assert.equal(harness.observedMessages.current.size, 0);
  await harness.tick(1);
  await harness.tick(1500);
  await harness.tick(1500);
  await harness.tick(3000);
  assert.equal(attempts, 3);
  assert.equal(harness.error, true);
  harness.show("m2");
  harness.retry();
  assert.equal(harness.observedMessages.current.has(1), true);
  harness.block(true);
  await harness.tick(600);
  assert.equal(attempts, 3);
  harness.block(false);
  await harness.tick(599);
  assert.equal(attempts, 3);
  await harness.tick(1);
  await harness.tick(1500);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.calls[3].slice(1))), [0, "receipt", ["m2"]]);
  harness.show("m1");
  await harness.tick(600);
  await harness.tick(1500);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.calls[4].slice(1))), [2, "receipt", ["m1"]]);
  assert.equal(attempts, 5);
  assert.equal(harness.error, false);
 } finally { harness.stop(); }
});
