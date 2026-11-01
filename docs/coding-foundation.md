# Python learning

Status: `ACTIVE`, local implementation contract. Updated: 2026-10-29.

## Student surfaces

Python is always available without a new feature flag. Existing Live Quiz still
uses its established FEATURE_LIVE gate. Each course has `/courses/[id]/playground`
with CodeMirror 6 autocomplete, interactive stdin, Run/Stop, stdout, Python errors and Zyra.
Runnable Article examples use the same terminal. On staging, the application issues a short-lived course-authorized WebSocket ticket for the isolated WASI Python worker; its compute fuel limit does not count time waiting for input. Interactive editors can prepare one shared idle terminal per page before Run. The worker limits idle warm sessions, expires them after 60 seconds, and falls back to a fresh session when preparation is unavailable. Source code is sent only when Run is pressed. Other environments retain the pinned, self-hosted Pyodide 314.0.7 runtime and its existing hard deadline.
The initial implementation supports standard-library Python programs and
stdin/stdout tests, not notebooks, external packages or graphical output.

V4 Article parts additionally support:

```json
{"id":"example-1","kind":"code_example","language":"python","code":"print(1)","runnable":true}
```

```json
{"id":"exercise-1","kind":"coding_exercise","problem":{"problemId":"problem-id","version":1}}
```

A non-runnable example is display-only. Runnable examples preserve edits and open
in Playground with code, stdin and an article return link. Exercises load only a
published public problem snapshot, permit repeated Submit, retain attempt history,
and mark results or feedback as stale when code changes. Publishing an Article
rejects unavailable, wrong-course or unpublished coding problem references.
V3 Markdown and existing V4 part kinds retain their behavior. Authoring contract
schema delivery derives the new kinds from the same V4 Zod contract.

Course access remains enforced. The Playground follows the existing course gate;
server-synced drafts, published problems and graded exercises require enrolled or
staff access. Drafts are user/course scoped, save locally, sync with optimistic
revisions and preserve local changes if another device wins a write. A stored
local draft is compared with its original server revision; replacing a newer
remote draft requires the explicit Ganti draft tersimpan action. A session
switch resets the draft owner. Browser storage may be disabled; execution still
works. No course content is seeded by this implementation.

## Execution and grading

Browser Run creates an iframe with `sandbox="allow-scripts"`, no same-origin
permission, a dedicated CSP and a disposable module Worker. The frame preloads
only fixed public Python runtime assets without credentials, then transfers their
bytes to the Worker. Loader modules use data URLs under the existing CSP. It
cannot read application cookies or storage. The parent terminates the Worker on timeout or Stop. The
opaque-origin Worker uses a data URL because Chromium rejects module Workers
created from blob URLs in this sandbox. Source is fetched from a fixed public
application asset; learner code is passed as data after runtime initialization. Where Document Isolation Policy is supported, interactive stdin uses shared memory and a private control channel, and child Worker constructors are disabled before learner code runs. Other browsers retain the existing JavaScript Promise Integration path and the same hard deadline.

Submit executes the canonical public and private tests on the server using
Playwright and a new browser context plus disposable Worker per case. No Python
executes inside Node. The page preloads fixed local Pyodide assets through request
interception, then transfers their bytes and blob module URLs into the Worker.
Both Run and Submit resolve runtime fetches from these pinned bytes and reject
other origins, filenames and methods. External requests and WebSockets remain
denied by the existing CSP and interception policy. This avoids relying on
remote CDP to intercept Worker imports. WASM and stdlib remain real Pyodide assets.
Contexts have no app sessions, browser permissions, downloads or service workers. Output is bounded;
learner Python errors show user-code frames rather than interpreter internals.
An outage or cancellation is ungradable, not an incorrect answer.

`CODING_BROWSER_PROVIDER` selects the Submit provider independently of V4 authoring
verification. Production defaults to Cloudflare Browser Run using existing
`CF_ACCOUNT_ID` and `CF_API_TOKEN`; development defaults to Chromium with its
kernel sandbox enabled. Explicit `steel` reuses the V4 session adapter and
server-only `STEEL_API_KEY`. `local` is rejected in production. There is no
credential-based fallback or new feature flag. Both remote providers acquire a
session through REST and explicitly release it before accepting a grade.
A release failure makes the submission ungradable. Real Steel Python grading has
passed against the local application with synthetic SQLite accounts. Browser Run
also passes through the actual authenticated local Playground in Steel, plus a
public opaque-iframe runtime harness. This does not attest a deployed provider
connection or production data. The service fails closed if its environment is
unavailable. Synthetic runtime
tests can inject a local Playwright browser without changing the service launch
policy. Browser platform memory/process limits remain external; this code does
not claim a per-program hard memory quota.

Problems are limited to 20 test cases and 25 seconds of configured execution
budget. Requests have a 45-second grading deadline. Heavy package workflows are
outside this implementation. AI and browser-supplied results never determine
scores. Public feedback excludes private inputs, expected outputs and executions.

## Problems, drafts and submissions

Staff authoring API: POST `/api/coding/problems` with `{problem, status}`. The
problem uses `codingProblemPrivateSchema`: stable problem ID/version/course ID,
language, title, prompt, objectives, starter code, public tests, runtime limits,
reference solution/explanation, private tests and optional misconception entries.
All currently defined fields are required; arrays can be empty where permitted.
Publishing runs the reference solution through all tests first. Snapshots are
immutable; corrections use a new version. Roles and tutor course assignments are
checked, and creation is audited. No student-facing response contains the private
snapshot. The authoring UI can use this API when course content is supplied.

- GET `/api/coding/problems?courseId=...`: published public snapshots.
- GET `/api/coding/problems/[id]?courseId=...&version=...`: exact public snapshot.
- GET/PUT `/api/coding/drafts`: owner-scoped draft with optimistic revision.
- GET `/api/coding/submissions`: owner-only history for a problem/version.
- POST `/api/coding/submissions`: course ID, surface locator and submission DTO.

Article surface locators contain article ID/version and part ID. The server
resolves the published Article block, checks the exact problem reference and
course, then reserves an attempt. Live locators contain session ID/question
index; a signed service request checks room membership and current question.
Identity, ordinal, policies, deadline and evaluation authority never come from
the learner DTO.

`coding_problems`, `coding_drafts` and `coding_attempts` use the existing Drizzle
and Turso/SQLite stack. Atomic reservation enforces unique request identity,
payload equality on replay, server deadlines, attempt limits and one in-flight
job per surface. Leases recover abandoned work. Completion compares the lease,
problem/version and status; an expired worker cannot overwrite recovered work.
Infrastructure failures can be retried without spending an attempt limit.
Cancellation races in-flight CDP setup explicitly; a context close alone may leave
a remote setup command pending. Each context is closed once and provider release
still precedes grade acceptance.

## Zyra coaching

The existing `/api/zyra/chat` accepts a validated coding context descriptor.
`askTutorRagAction` resolves private canonical context and learner-owned history
server-side, then uses the existing provider, allowance, pedagogy, sanitization
and assessment policy pipeline. Source context bypasses shared caches. Reference
answers do not enter the learner's question text or public source DTOs.

Playground context contains code, supplied stdin and a browser-reported execution,
explicitly unverified. Before Run, execution is null. Exercise consultation also
receives a current Run result before Submit, labelled as browser practice. Changing
code or stdin marks that result stale and excludes it from the current AI context. Exercise context contains the problem, objectives, current code,
matching server evaluation and up to three previous attempts from that surface.
Full assistance includes the reference solution/explanation; hints mode withholds
them and invokes the existing active-assessment Socratic policy and protected
answer redaction. Disabled assistance is rejected server-side. Private test
execution data is excluded in every mode.

Owner-scoped recent conversation is included in coding turns. Hints withhold
prior AI answers as well as the canonical solution. Short helper requests retain
the current server-resolved coding evidence rather than falling back to general
course retrieval. The coding response format is supplied through the existing
provider schema contract; full application validation still checks the output.
Ordinary coding explanations use text; explicit flowchart requests enable the
structured diagram. Syntax and indentation inside code blocks survive answer
cleanup. Current questions and code take priority over older conversation topics.

Playground uses the existing Zyra drawer and one compact composer with Python
and Tutor modes. Python captures the current editor and revision before sending.
One complete final Python block applies directly only while that editor remains
active and unchanged. Concurrent edits require an explicit apply action. Final
code is omitted from chat; Tutor explanations and snippets stay in the chat and
do not alter the editor. Coding turns are saved once by the chat API, including
image linkage. Python history retains explanation and regeneration guidance,
without claiming that a pending result was applied. Article and exercise helpers
retain their existing flows.
The composer renders explicitly delimited math inline, exposing the source on
selection. Ordinary prose, currency, code spans and incomplete formulas remain
text. Enter sends, Shift+Enter inserts a line, and composition does not send.
Session counts use persisted tutor messages scoped to the same user and course,
with empty sessions retained and a refresh after successful saves.

Helper actions cover hints, decomposition, error explanation, review and
flowcharts. Zyra is instructed to separate observations from hypotheses, support
suspected misconceptions with evidence, ask diagnostic questions and propose
small next steps. Error coaching asks the learner to predict a result, make one
small change and try Run again, with brief encouragement tied to that attempt.
Learner explanations should refine the diagnosis; a suspected misconception is
not a claim about the learner's ability or motivation. Current code and execution
take precedence over older conversation, including an earlier successful Run.
The coaching instructions are shared by the structured pedagogy path and coding
legacy fallback. It must identify a flowchart as a solution plan or student-code
logic. Existing typed visual generation and flowchart rendering are reused.
Flowchart nodes carry an optional `kind`: `start`, `end`, `input`, `output`,
`process`, or `decision`. Zyra must provide it for new diagrams. The renderer
uses ellipses for start/end, parallelograms for input/output, rectangles for
processes, and diamonds for decisions. Labeled branches and loop-back paths
attach to the symbol boundaries using the existing ELK layout engine. Older
saved diagrams without kinds use conservative label inference, then process as
the fallback. The concept-map renderer retains its existing boxes. Legacy
Markdown serialization preserves explicit kinds and branch labels.
Vertical default layout, fit/zoom controls and removal of layout diagnostics make
those diagrams readable inside narrow Article surfaces. AI failure does not
block Python execution or deterministic grading. Model compliance is not a
substitute for access checks or deterministic evaluation.

## Live Quiz

Choice questions can display fenced code through the shared Markdown renderer.
Tutor setup can select a published Python problem in place of template questions;
the UI default is five minutes, unlimited retries, hints-only Zyra and best score.
The create API also accepts explicit per-question duration, attempt, assistance
and best/latest score policies through `codingQuestions`.

The existing room protocol carries optional public `coding` metadata. The Worker
adds authenticated coding-state, coding-reserve and coding-result operations.
Clients cannot submit leaderboard scores or answer a Python question through the
choice-message path. Accepted grading reservations prevent early reveal/end;
completion/replay updates one learner result. Reveal awards 1000 times the passed
case fraction, without a speed bonus. Callbacks retain numeric coding correctness
in learning events and coding score in the saved result snapshot. Legacy choice
sessions retain their scoring and callbacks.

Deploy the Next app and realtime Worker together after applying the local-tested
migration to the explicitly selected environment. A preexisting deployed Worker
will reject the new service operations until updated. No deployment or remote
migration was performed as part of local implementation.

## Verification boundaries

Local checks include contract tests, durable SQLite attempts, real Python runtime
fixtures, room state transitions and Article/Diktat schema regressions. Playwright
fixtures exercise actual browser Python at 380x844 and 1536x864. Article submission,
draft/auth responses and AI streams in visual tests use deterministic synthetic
responses; they are not proof of live AI, production grading or remote database
success. Exact command outcomes and inspected screenshots are recorded in
[coding verification](coding-verification.md).

Playground editors measure their available viewport height, allowing long code to grow beyond 400 px while reserving 64 px for the quick actions and bottom spacing. Embedded Article editors retain their existing cap. Python help keeps contextual quick actions next to the editor and inside the existing Zyra drawer in Python mode. Presets send their specific coding intent without generating or applying replacement code. Code explanation and flowchart require code; error explanation requires a current failed execution. General Tutor follow-up presets appear only in Tutor mode. Image paste is consumed once in the composer capture handler before CodeMirror handles it. Terminal input uses a native caret without a focus ring.
