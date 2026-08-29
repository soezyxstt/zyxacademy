# Zyx Academy — Engineering Case Study

> Public-facing case study draft for Zyx Academy. This document is intended to be copied into a separate public showcase repository. It intentionally excludes private course content, credentials, internal admin data, proprietary prompts, and sensitive operational details.

**Live:** https://zyxacademy.com

## Overview

Zyx Academy is a full-stack learning platform for university students, with a focus on structured learning content, assessments, spaced-repetition practice, progress tracking, and an AI tutor called Zyra.

The main engineering challenge is not only generating educational content with AI. The system needs a reliable content pipeline so generated materials, questions, flashcards, retrieval data, and tutor responses stay tied to reviewed source material.

## What I built

- Course and chapter-based learning experience
- Structured learning materials generated from source documents
- Assessment and question-bank workflows
- Spaced-repetition flashcards and review history
- Student progress tracking and study analytics
- AI tutor backed by retrieval and vector search
- Admin authoring and review workflows
- Structured content pipelines for source ingestion, validation, staging, and publication
- Production storage and deployment on low-cost / free-tier infrastructure
- Separate MCP authoring surface for AI-assisted content operations

## Product flow

```text
Source documents
      │
      ▼
Canonical content pipeline
      │
      ├─► Knowledge objects
      ├─► Knowledge graph
      ├─► Flashcards
      ├─► Assessments
      ├─► Learning material
      └─► Retrieval index
                 │
                 ▼
              Zyra tutor
                 │
                 ▼
        Grounded student answers
```

## High-level architecture

```text
Students / Tutors / Admins
          │
          ▼
     Next.js application
          │
   ┌──────┼───────────────┐
   ▼      ▼               ▼
Auth   App services   Authoring workflows
   │      │               │
   └──────┼───────────────┘
          ▼
   Drizzle data layer
          │
          ├─ Turso / SQLite      structured application data
          ├─ Cloudflare R2       source and generated files
          ├─ Vectorize           semantic retrieval
          ├─ Inngest             background workflows
          └─ Gemini              generation and tutor intelligence
```

## Key engineering decisions

### 1. Treat AI output as a pipeline artifact

Generated content does not go straight from a model response to the student UI. The system uses structured intermediate artifacts that can be validated, reviewed, staged, and regenerated.

This reduces hidden coupling between prompts and production data and makes content generation easier to audit.

### 2. Keep source provenance

Learning materials, questions, and tutor retrieval are designed around source-backed content. The pipeline keeps relationships between source files, structured knowledge, generated products, and later retrieval steps.

This is important for an educational product where plausible but unsupported answers are not enough.

### 3. Separate authoring from publication

Authoring tools can generate, validate, inspect, and stage content, but final publication remains a distinct action in the admin application.

The same boundary is reflected in the public Zyx Authoring MCP project: AI tools can help produce and review artifacts without silently publishing them.

### 4. Design around constrained infrastructure

The production system uses lightweight managed services and Cloudflare components instead of assuming a large always-on backend.

This shaped choices around Turso / SQLite, object storage, vector search, background jobs, and serverless deployment.

## Zyra retrieval flow

```text
Student question
      │
      ▼
Query rewrite / retrieval intent
      │
      ▼
Relevant course knowledge + assessment context
      │
      ▼
Grounded response generation
      │
      ├─ answer
      ├─ explanation
      └─ source-aware context
```

## Authoring workflow

```text
Source pack
    │
    ▼
Idea / knowledge extraction
    │
    ▼
Structured product generation
    │
    ▼
Validation + coverage checks
    │
    ▼
Staging + review
    │
    ▼
Admin publication
```

A public implementation of the authoring client surface is available in `soezyxstt/zyx-authoring-mcp`.

## Stack

- Next.js 16
- React + TypeScript
- Drizzle ORM
- Turso / SQLite
- Better Auth
- Cloudflare Workers
- Cloudflare R2
- Cloudflare Vectorize
- Inngest
- Gemini
- MCP-based authoring workflows

## Engineering themes demonstrated

- Large full-stack product design
- AI content pipelines
- Retrieval-augmented tutoring
- Structured generation and validation
- Data provenance
- Assessment systems
- Background workflows
- Serverless / edge deployment
- Database and object-storage design
- Product architecture under low-cost infrastructure constraints

## What is intentionally not public

The main production repository remains private because it contains product-specific implementation details and operational material.

The public showcase should not contain:

- private course source material
- copyrighted source PDFs not licensed for redistribution
- student or tutor data
- database dumps
- API keys, OAuth secrets, or environment files
- unpublished assessment content
- internal admin credentials
- proprietary prompts where disclosure would weaken production controls

## Suggested screenshots

Add sanitized screenshots for:

1. Student course dashboard
2. Learning material page
3. Flashcard review flow
4. Assessment / question practice
5. Zyra tutor conversation
6. Admin content pipeline or authoring screen
7. Analytics or progress view

Use demo or non-sensitive course data. Avoid student names, account data, tokens, private source documents, and unpublished questions.

## Suggested public evidence

The showcase repository should link to:

- Live product: https://zyxacademy.com
- Public authoring project: https://github.com/soezyxstt/zyx-authoring-mcp
- Portfolio: https://adihnursyam.com

Optional additions:

- one architecture diagram exported as PNG or SVG
- a short screen recording of the student flow
- a short screen recording of Zyra answering a grounded question
- a sanitized example showing source → structured content → assessment / flashcard output

## Recruiter walkthrough

A reviewer should be able to understand the project in this order:

1. Open the live platform.
2. Review the learning and practice experience.
3. Read the architecture and content-pipeline sections.
4. Inspect how Zyra retrieval is grounded.
5. Open the public MCP repository for concrete implementation evidence.
6. Review sanitized screenshots and diagrams.
7. Use the private source during a technical interview if needed.

## Author

Adi Haditya Nursyam  
Portfolio: https://adihnursyam.com
