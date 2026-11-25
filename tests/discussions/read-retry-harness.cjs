const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

// Execute the production effect and retry prop with controlled DOM and clock boundaries.
function createReadHarness(page, markRead) {
 const clientSource = fs.readFileSync("components/discussions/discussion-client.tsx", "utf8");
 const adapterSource = fs.readFileSync("components/discussions/discussion-adapter.ts", "utf8");
 function find(source, name, predicate) {
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function visit(node) { if (!found && predicate(node)) found = node; ts.forEachChild(node, visit); }
  visit(file);
  if (!found) throw new Error(`Production read code missing: ${name}`);
  return found.getText(file);
 }
 const named = (name) => node => ts.isFunctionDeclaration(node) && node.name?.text === name;
 const functions = ["advanceObserved", "discussionVisibilityBlocked", "discussionStatusUncovered", "discussionContentUncovered", "watchDiscussionVisibility", "observeDiscussionSnapshot", "visibleDiscussionReadSnapshot", "retryDiscussionRead"]
  .map(name => find(adapterSource, name, named(name)));
 functions.push(find(clientSource, "nextDiscussionReadBatch", named("nextDiscussionReadBatch")));
 const effect = find(clientSource, "read effect", node => ts.isArrowFunction(node) && node.getText().includes("const stopObserving = watchDiscussionVisibility"));
 const retry = find(clientSource, "read retry", node => ts.isJsxAttribute(node) && node.name.getText() === "onRetryRead");
 const retryExpression = retry.slice(retry.indexOf("{") + 1, -1);
 let now = 0, nextTimer = 0, visible = page.messages.items[0].id, blocked = false, refresh = () => {}, error = false, stop = () => {};
 const timers = new Map();
 const setTimer = (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, at: now + delay }); return id; };
 const clearTimer = id => timers.delete(id);
 const rect = top => ({ left: 10, top, right: 90, bottom: top + 40, width: 80, height: 40 });
 const status = { getBoundingClientRect: () => rect(0), contains: () => false };
 const contents = page.messages.items.map(message => ({
  parentElement: null, getBoundingClientRect: () => rect(visible === message.id ? 50 : 150), contains: () => false,
  closest: () => ({ dataset: { messageId: message.id } }),
 }));
 const root = { querySelector: () => status, querySelectorAll: () => contents };
 const document = { visibilityState: "visible", body: {}, querySelector: selector => selector === "[data-discussion-workspace]" ? root : blocked ? {} : null,
  elementFromPoint: (_x, y) => y < 40 ? status : contents.find(content => content.getBoundingClientRect().top === 50), addEventListener() {}, removeEventListener() {} };
 const window = { innerWidth: 100, innerHeight: 100, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
 class IntersectionObserver { constructor(callback) { refresh = callback; } observe() {} disconnect() {} }
 class MutationObserver { observe() {} disconnect() {} }
 const observedMessages = { current: new Map() }, observation = { current: { through: 0, seen: new Set(), versions: new Map() } };
 const calls = [];
 let latestRequest;
 const context = { exports: {}, document, window, IntersectionObserver, MutationObserver, Event: class {}, setTimeout: setTimer, clearTimeout: clearTimer,
  viewer: { id: "viewer" },
  selectedThread: page.thread.id, thread: page.thread, activeTab: "questions", renderedThreadState: "ready", messagePages: [page.messages],
  messages: page.messages.items, messagePagesRef: { current: [page.messages] }, threadVersion: { current: 1 }, selectionVersion: { current: 1 }, currentThread: { current: page.thread.id },
  observation, observedMessages, acknowledgedThrough: { current: 0 }, acknowledgedSnapshot: { current: null }, readInFlight: { current: null },
  actions: { markRead: (...args) => { calls.push(args); latestRequest = markRead(...args); return latestRequest; } },
  setReadError: value => { error = value; }, setRetryRead: () => { stop(); stop = context.runEffect(); },
  signalCounts() {}, refreshThreadPage: async () => {}, useEffect: fn => fn(), console,
 };
 const js = ts.transpileModule(`${functions.join("\n")}\nconst runEffect = ${effect};\nconst retry = ${retryExpression};`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
 vm.runInNewContext(`${js}\nglobalThis.runEffect = runEffect; globalThis.retry = retry;`, context);
 stop = context.runEffect();
 async function tick(ms) {
  const target = now + ms;
  while (true) {
   const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
   if (!next || next[1].at > target) break;
   now = next[1].at; timers.delete(next[0]); next[1].fn();
   for (let i = 0; i < 8; i++) await Promise.resolve();
  }
  now = target;
  for (let i = 0; i < 8; i++) await Promise.resolve();
 }
 return { tick, async settle() { await latestRequest.catch(() => {}); await new Promise(resolve => setImmediate(resolve)); }, calls, observation, observedMessages, acknowledgedThrough: context.acknowledgedThrough, get error() { return error; },
  show(id) { visible = id; refresh(); }, block(value) { blocked = value; refresh(); }, retry() { context.retry(); }, stop() { stop(); } };
}
module.exports = { createReadHarness };
