# Zyx Academy

**Live:** [zyxacademy.com](https://zyxacademy.com)

An AI-enabled learning platform for structured course content, assessments, spaced-repetition study, analytics, and an AI tutor grounded in course knowledge.

The system combines a student learning app, admin authoring workflows, retrieval-backed AI tutoring, content pipelines, assessment tooling, and free-tier-focused cloud infrastructure.

## Product highlights

- Structured course materials and learning progress
- Assessments, question banks, scoring, and review workflows
- Spaced-repetition flashcards and study tracking
- AI tutor with retrieval and vector search
- Canonical content pipeline for course knowledge
- Admin authoring, validation, staging, and review workflows
- Cloud object storage and vector search
- Production deployment designed around low-cost/free-tier infrastructure

## Stack

- **Next.js 16 + React + TypeScript**
- **Drizzle ORM + Turso / SQLite**
- **Better Auth**
- **Google Gemini**
- **Cloudflare Vectorize + R2**
- **Inngest**

## High-level architecture

```text
Students / Admins
       │
       ▼
   Next.js App
       │
       ├─ Learning & assessment workflows
       ├─ Admin authoring workflows
       ├─ AI tutor / RAG
       └─ API layer
              │
              ├─ Turso / SQLite        structured data
              ├─ Cloudflare R2         files and media
              ├─ Cloudflare Vectorize  retrieval
              ├─ Gemini                AI generation/tutoring
              └─ Inngest               background workflows
```

## Public companion project

The main application source is private. The authoring integration layer is available publicly in [`soezyxstt/zyx-authoring-mcp`](https://github.com/soezyxstt/zyx-authoring-mcp), which exposes the MCP plugin and structured authoring workflow surface used by the platform.

## Documentation

| File | What it covers |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Full system architecture, database domains, AI pipelines, directory map, and data flows |
| [features.md](docs/features.md) | User-facing workflows, roles, pipelines, and quota rules |
| [DB_SCHEMA.md](docs/DB_SCHEMA.md) | Detailed table-by-table schema reference |
| [DATABASE.md](docs/DATABASE.md) | Database setup, migration workflow, and key design decisions |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Development setup, commands, env vars, feature flags, and code conventions |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production architecture, Turso, Cloudflare Workers, and related services |
| [docs/bundle/](docs/bundle/) | Idea Bundle V2, Product Bundle V2, and Authoring Pack ZIP contracts |
| [docs/operations/](docs/operations/) | Production readiness, Zyra runbooks, and manual test plans |
| [docs/audit/](docs/audit/) | Historical use-case audit snapshots |
| [plans/](plans/) | Active plan specs and completed program notes |

## Quick start

```bash
bun install
cp .env.example .env.local
bun run dev
```

## Contribution workflow

Create feature branches from `staging`; do not push feature work directly to `staging` or `main`.

```bash
git fetch origin staging
git switch -c feature/nama-fitur origin/staging
bun install
cp .env.example .env.local
```

Before opening a pull request:

```bash
bun run lint
bun run build
git diff --check
```

Then rebase on the latest staging branch and push the feature branch:

```bash
git fetch origin staging
git pull --rebase origin staging
bun run lint
bun run build
git diff --check
git push -u origin feature/nama-fitur
```

Pull requests should summarize the feature, key code or data changes, validation results, environment-variable changes, migrations, feature flags, and any manual deployment steps.

## References

- **[AGENTS.md](AGENTS.md)** — coding rules and conventions for AI agents
- **[plans/README.md](plans/README.md)** — completed program invariants and the active plan
