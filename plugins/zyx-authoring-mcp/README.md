# Zyx Authoring MCP plugin

This package connects an MCP host to one explicitly named Zyx environment. Focused skills route academic authoring, content revisions, blogs, forms, media and recovery to the server's current capabilities.

Release 0.5.0 adds five focused skills and V3+ content revision guidance. V4 remains the default for new Article/Diktat authoring; existing V3 revisions and V5 Pembahasan use their applicable review gates. The supported Idea and learning Product lifecycle, blog workflow and other advertised admin operations can run through MCP without opening the Admin website. Authentication, grants, sensitive-action confirmation and trusted verification still apply. Bundles below V3 are outside this release's acceptance scope.

This directory is the repository publishing source. Editing or pushing it does not itself update installed host packages or the external commits pinned by `authoring-skills.lock.json`.

For a local MCP snapshot, render an environment package with `scripts/configure_environment.py build`, then run `bun scripts/build-authoring-skills.ts --local-candidate --environment staging --source <rendered-package> --output <separate-artifact>`. Candidate manifests record the workspace base commit and exact source digest. They cannot replace `dist/skills`, run in CI/deployment, or be served by a deployed environment. Normal builds still require the clean external locked source. Promote through the owning repository's review/release process and update its pin only after the actual upstream commit exists.

<!-- BEGIN:environment-config -->
## Active environment

- Environment: `staging`
- Plugin ID: `zyx-authoring-mcp-staging`
- Release version: `0.5.0`
- Bootstrap protocol: `1`
- MCP server ID: `zyx-authoring-staging`
- Endpoint: `https://staging.zyxacademy.com/api/mcp/authoring`
<!-- END:environment-config -->

Production and staging can be installed together because both the plugin ID and MCP server ID differ:

| Environment | Plugin ID | MCP server ID | Expected Codex tool prefix |
| --- | --- | --- | --- |
| Production | `zyx-authoring-mcp` | `zyx-authoring-production` | `mcp__zyx_authoring_production__` |
| Staging | `zyx-authoring-mcp-staging` | `zyx-authoring-staging` | `mcp__zyx_authoring_staging__` |

Do not publish either variant with the legacy MCP server ID `zyx-authoring` or `zyx-mcp`. A host can collapse two connections with a shared ID into one ambiguous callable namespace.

## Thin skills and server-delivered playbooks

This package exports 12 skills:

- `zyx-authoring-pipeline`
- `zyx-source-pack-mcp`
- `zyx-idea-bundle-mcp`
- `zyx-product-bundle-mcp`
- `zyx-question-authoring-mcp`
- `reference-question-ingest`
- `zyx-admin-operations`
- `zyx-blog-mcp`
- `zyx-content-revisions`
- `zyx-forms-mcp`
- `zyx-media-mcp`
- `zyx-operation-recovery`

For admin workflows, call `admin.environment` on the intended connection, compare its environment and origin, then call `admin.capabilities` for the relevant domain. Use only advertised operations and granted scopes. Discovery metadata does not grant permission. Blog, forms, media and operation recovery do not require an academic Source Pack or an authoring run.

Initial academic authoring uses thin stage entrypoints. Detailed editorial rubrics, schema contracts, reconciliation checklists and stage workflows come from `workflow.get_playbook` and `workflow.get_contract`. Before authoring a stage or resuming its checkpoint, request a fresh playbook using the stage's literal skill ID, `bootstrapProtocol: 1`, `pluginVersion: "0.5.0"`, and accurate `clientCapabilities`. Pass the returned bootstrap token to the applicable workflow and stage tools. If bootstrap fails or is incompatible, stop instead of using cached instructions.

For existing Idea or learning Product content, use `zyx-content-revisions`: read edit context, create a revision, patch stable IDs, plan its release, review the exact revision and explicitly publish when authorized. The revision skill bootstraps with `zyx-idea-bundle-mcp` or `zyx-product-bundle-mcp`, never its own name. Existing-content revisions do not require a new Source Pack or an old authoring run. Restore creates a new draft rather than changing immutable history.

Blog creation always starts as a draft. Search and edit context provide revisions, validation derives a normalized draft and reading time, and explicit publication is separate. Media lookup returns the public serving path or URL for `thumbnailUrl`; raw storage keys are not thumbnail URLs. Scheduling is not implemented. Forms preview and simulation do not persist responses.

Admin writes use the exact payload, `requestKey`, `dryRun` plan and confirmation token. Existing authorization for ordinary draft work remains valid across those steps. A lost response uses `admin.operation_receipt`: `committed` attests only the database transaction, while `not_recorded` is inconclusive. Reuse the same key and payload, obtaining a fresh plan if necessary. Queued provider work is separate; inspect its job and never automatically replay an `unknown` provider outcome.

## Host manifests and CLI helpers

- `release.json` is the canonical source for `version` (`0.5.0`), `bootstrapProtocol` (`1`), minimum compatible version (`0.2.0`) and the exact skill inventory.
- `.codex-plugin/plugin.json` is the Codex Desktop plugin manifest.
- `.claude-plugin/plugin.json` is the Claude Code plugin manifest.
- `.mcp.json` is shared by Codex and Claude Code plugin manifests and contains the environment-specific server ID (`type: "http"`).
- `mcp_config.json` is the Antigravity IDE MCP configuration (`serverUrl`).
- `claude-desktop-config.example.json` is a standalone MCP configuration template for the Claude chat tab (`type: "streamable-http"`).
- `scripts/configure_environment.py` builds deterministic environment packages into a separate output directory (`--output-dir`), provides read-only secret-redacted host diagnostics (`doctor`), and builds safe local distribution artifacts (`sync`).

## Authentication and scopes

The server does not use a static token in this package. It requires an active Zyx admin session. Hosts with MCP OAuth support should open the sign-in flow for the active endpoint automatically.

- **Default OAuth scopes**: `authoring:read`, `authoring:stage`, `authoring:review`, and `authoring:withdraw` (subject to consent selection).
- **Additional scopes**: Publication and domain-specific admin operations require their corresponding explicit grants. Use capability discovery and OAuth reauthorization when a grant is missing; do not assume these are part of the authoring defaults.
- **Session connections**: An authenticated admin session connection receives all supported scopes.

A host without interactive OAuth can use a bearer token created by an authenticated admin at `/api/mcp/authoring/connection`. The token has a 30-day hard lifetime and remains bound to the originating live Better Auth session and active-admin role, invalidating earlier if the session ends or permissions change. Never commit a connection token or put it in `.mcp.json` or `mcp_config.json`.

## Implemented tool surface

Bootstrap binds the authenticated session and environment audience. On revision drift, fetch a fresh stage playbook and pass its `bootstrapToken` with the existing bound run to `workflow.get_contract`; use the returned replacement `runToken` and revalidate. Run ID, scope, source, and expiry are preserved. Runs without the required session binding must follow the server's bootstrap recovery. Required host capabilities must be explicitly true. Existing-content revisions use fresh stage bootstrap and their stored scope rather than requiring an expired authoring run.

Package builds only replace files in an owned output directory. A non-empty unmanaged output or an output containing unknown files is rejected; use a new output path rather than deleting user files.

- **Bootstrap, workflow, and catalog**: `workflow.get_playbook`, `workflow.list`, `catalog.list_courses`, `catalog.list_chapters`, `source.list_files`, `source.list_reference_files`, `source.read_file`, `source.ingest`, `source.list_packs`, `source.get_pack`, `workflow.start`, `workflow.get_run`, `workflow.get_contract` (`authoring:read`). Stored course PDFs can be inspected and ingested without a local attachment; local originals remain supported. Ingested Source Packs use the configured private storage adapter and `impor_bundle` (`status: validated`).
- **Validation and submission**: `authoring.validate_idea_bundle`, `authoring.submit_idea_bundle`, `authoring.validate_product_bundle`, `authoring.submit_product_bundle`, `assessment.validate_quiz_draft`, `assessment.submit_quiz_draft`, `assessment.validate_reference_draft`, `assessment.submit_reference_draft` (`authoring:read` for validation, `authoring:stage` for submission).
- **Knowledge and analysis**: `assessment.list_ideas`, `assessment.get_idea`, `knowledge.search_ideas`, `knowledge.search_course_ideas`, `knowledge.get_idea`, `knowledge.list_products`, `knowledge.get_product`, `knowledge.list_sources`, `knowledge.get_source`, `knowledge.search_source_chunks`, `analysis.get_coverage`, `assessment.list_questions`, `assessment.get_question`, `assessment.list_reference_questions`, `assessment.get_reference_question`, `assessment.analyze_bank`, `assessment.find_similar` (`authoring:read`).
- **Lifecycle management**:
  - `authoring.get_edit_context`, `authoring.create_revision`, `authoring.patch_revision`, `authoring.prepare_revision_verification`, `authoring.plan_release`, `authoring.review_revision`, `authoring.publish_release`, `authoring.list_revisions` and `authoring.restore_revision`: V3+ revisions and atomic same-course release with stable patch targets, scoped review reuse and exact plan identity.
  - `authoring.list_imports` and `authoring.get_import`: Inspect staged Source, Idea, and Product imports and review logs without exposing storage keys or reviewer IDs (`authoring:read`).
  - `authoring.restage_idea_bundle` and `authoring.restage_product_bundle`: Replace staged bundles and reset prior review state (`authoring:stage`).
  - `authoring.discard_product_draft`: Remove draft Product Bundle inventory; retain shared content-addressed objects for safe cleanup (`authoring:withdraw`).
  - `authoring.get_idea_review_context`, `authoring.review_idea_revision`, `authoring.get_product_review_context`, and `authoring.review_product_bundle`: Read exact-revision review context and record explicit decisions (`authoring:read` / `authoring:review`).
  - `authoring.adopt_product_draft_run`: Explicitly bind an unchanged scoped draft to the current run, auditing and invalidating prior evidence and bundle review (`authoring:stage`).
  - `authoring.publish_idea_bundle`, `authoring.publish_product_bundle`, and `authoring.publish_solution_collection`: Explicit admin publication after the applicable exact-revision gates (`authoring:publish`).
  - `authoring.withdraw_product_bundle` and `authoring.withdraw_idea_bundle`: Audited, idempotent withdrawal (`authoring:withdraw`). Idea withdrawal binds the bootstrap and exact checksum, with a scoped run or explicit exact-import recovery without a Source Pack and preserves entities owned by another published import.
  - `assessment.update_question`: Edit draft Zyx-original questions in scope and return them to `reviewStatus=generated` for admin review (`authoring:stage`). ITB example and historical reference questions are immutable; published or retired questions cannot be edited.

## Publication matrix and safety boundaries

| Workflow / Stage | Submission tool | Persistence state | Publication boundary |
| --- | --- | --- | --- |
| Source Pack | `source.ingest` | `impor_bundle` (`status="validated"`) | Validated source archive; not learner-visible. |
| Idea Bundle V3 | `authoring.submit_idea_bundle` / `authoring.restage_idea_bundle` | `impor_bundle` (reviewable import) | An authorized admin may explicitly publish through scoped MCP after exact-revision item review or use Admin UI. Published Ideas are required for Product authoring. |
| Learning Product Bundle V3 to V5 | `authoring.submit_product_bundle` / `authoring.restage_product_bundle` | `impor_bundle` (draft) | An authorized admin may explicitly publish through scoped MCP or Admin UI after the applicable review, dependency, PDF and verification gates. V5 uses its separate item review. |
| Original Quiz Bank (`quiz_bank`) | `assessment.submit_quiz_draft` / `assessment.update_question` | `question_bank` (`status="draft"`, `reviewStatus="generated"`) | Never publishes learner quiz questions via MCP. |
| Historical Reference (`reference_question_ingest`) | `assessment.submit_reference_draft` | `reference_question_bank` (`status="published"`, `reviewStatus="published"`) | Directly persists immutable published historical reference records (`historical_reference`). |

- **Lifecycle authorization**: Withdrawal, draft discard, replacement, immutable review and publication must match the user's authorized task. Preparing or saving a draft does not authorize publication, external messages, deletion or access changes. Reuse existing task authorization for its ordinary steps; preserve stronger confirmation for sensitive or destructive effects and manual export conflicts.

## Repository release and mirror boundary

The exact inventory in `release.json`, the generator's `EXPECTED_SKILLS` and the allowlist must move together. Every skill exports its `SKILL.md` and matching `agents/openai.yaml`. Extra files, reference directories, secrets and archives remain rejected. The generator produces separate staging and production packages and retains each environment's existing plugin ID, MCP ID and transport formats.

The repository's `sync-plugin.yml` validates packages in its existing CI path. Updating the external plugin repository is a separate, explicit `workflow_dispatch` action; production mirroring remains restricted to `main`. Pushing application changes alone does not dispatch that mirror. Changed package contents need a higher release version. After the external release commit exists, update the server's separately pinned source through its normal review process. A local candidate build does not change that pin or prove marketplace distribution, deployment or installed-host refresh.

## Host installation and update guidance

- **Codex Desktop**: Add the rendered environment package as a local Codex plugin source or sync from the mirrored repository branch (`staging` or `main`), then reload plugins or start a new session.
- **Claude Code Desktop**: Load the `.claude-plugin` manifest, `skills/`, and `.mcp.json` from the environment package, and reload plugins when the package version changes.
- **Antigravity IDE**: Use the rendered `mcp_config.json` entry and the environment plugin directory (`~/.gemini/config/plugins/<plugin-id>`).
- **Claude chat tab and ChatGPT Developer Mode**: Connect to the active endpoint URL above. Initial academic authoring starts with `workflow.get_playbook` and the applicable workflow bootstrap. Existing revisions follow `zyx-content-revisions`; admin workflows start with `admin.environment` and capability discovery.
