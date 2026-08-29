# Zyx Academy

**Live:** [zyxacademy.com](https://zyxacademy.com)

AI learning platform for structured course content, assessments, spaced-repetition study, analytics, and a retrieval-backed tutor.

## Features

- Structured course materials and progress tracking
- Assessments, question banks, scoring, and review flows
- Spaced-repetition flashcards
- AI tutor with retrieval and vector search
- Canonical content pipeline
- Admin authoring, validation, staging, and review
- Low-cost serverless deployment

## Stack

`Next.js 16` `React` `TypeScript` `Drizzle ORM` `Turso / SQLite` `Better Auth` `Gemini` `Cloudflare R2` `Vectorize` `Inngest`

## Architecture

```text
Students / Admins
       │
       ▼
   Next.js App
       │
       ├─ Learning and assessments
       ├─ Admin authoring
       ├─ AI tutor / RAG
       └─ API layer
              │
              ├─ Turso / SQLite
              ├─ Cloudflare R2
              ├─ Cloudflare Vectorize
              ├─ Gemini
              └─ Inngest
```

The main source is private. Public authoring tooling is available in [`soezyxstt/zyx-authoring-mcp`](https://github.com/soezyxstt/zyx-authoring-mcp).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Features](docs/features.md)
- [Database schema](docs/DB_SCHEMA.md)
- [Development](docs/DEVELOPMENT.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Operations](docs/operations/)

## Development

```bash
bun install
cp .env.example .env.local
bun run dev
```

Create feature branches from `staging`. Before opening a pull request, run:

```bash
bun run lint
bun run build
git diff --check
```

See [AGENTS.md](AGENTS.md) for repository conventions.
