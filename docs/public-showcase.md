# Zyx Academy: Engineering Case Study

> Public-facing case study for Zyx Academy. It intentionally excludes private course content, credentials, internal admin data, proprietary prompts, and sensitive operational details.

**Live:** https://zyxacademy.com

## Overview

Zyx Academy is a full-stack, multi-platform learning management system for university students. It combines structured scientific learning content, spaced-repetition flashcards, adaptive assessments, interactive Python coding, scoped Q&A discussions, gamified progress, and an AI tutor called Zyra.

The core engineering challenge is not just generating educational content with AI. It is building a verifiable, source-backed content pipeline so articles, printable diktats, questions, flashcards, vector retrieval, and AI tutor responses remain traceable to reviewed academic sources.

## What I Built

- **Multi-platform delivery**: Next.js 16.3 web app with separated mobile and desktop LMS shells, Capacitor 7 mobile wrapper (Android/iOS), and Tauri v2 desktop wrapper (Windows/macOS/Linux) with offline reading and delta updates.
- **Canonical authoring pipeline**: Source Pack ingestion, atomic Idea Bundle V3 extraction, structured Product Bundle V4 (interactive scientific articles, printable diktats, flashcards), standalone solution collections (V5), and flexible stable-ID revisions.
- **MCP-first authoring and operations**: Streamable HTTP MCP server with OAuth PKCE consent, scoped playbooks, and packaged skills (`soezyxstt/zyx-authoring-mcp`).
- **Assessment and coding platform**: Timed and untimed quizzes, tryouts, live real-time classroom quizzes, and an interactive Python playground with browser/WASI execution and Zyra coding coaching.
- **Grounded AI tutor (Zyra)**: Retrieval-augmented tutoring over 768-dimensional Cloudflare Vectorize namespaces, dynamic multi-provider model routing via Cloudflare AI Gateway, distributed quota leasing, and structured pedagogical responses with KaTeX math and interactive visuals.
- **Student engagement and collaboration**: Bilingual (`id`/`en`) scoped discussions with `@Zyra` mentions, SM-2 spaced-repetition flashcards, mastery analytics, Google Calendar schedule sync, and student gamification with a 3D Pet Studio.

## High-Level Architecture

```text
Clients (Web Browser / Capacitor Mobile / Tauri Desktop)
          |
          v
  Next.js 16.3 App Router (Vercel / Cloud Run + Edge Worker)
          |
   +------+---------------+
   v      v               v
Better   App & Domain   MCP Authoring &
Auth     Services       Admin Operations
   |      |               |
   +------+---------------+
          v
   Drizzle ORM Data Layer
          |
          +-- Neon PostgreSQL          structured domain, auth, and outbox data
          +-- Neon Object Storage      private S3-compatible academic and user assets
          +-- Neon Functions           background compute via Inngest / Cloud Tasks
          +-- Cloudflare AI Gateway    multi-provider LLM routing, BYOK, and cooldowns
          +-- Cloudflare Vectorize     768d semantic retrieval (canonical & ops knowledge)
          +-- Cloudflare Workers       vector API, Zyra control plane, realtime, PDF renderer
```

## Key Engineering Decisions

### 1. Treat AI Output as a Versioned Pipeline Artifact
Generated content never goes straight from an LLM response to students. Source Packs, Idea Bundles (V3), and Product Bundles (V4/V5) pass deterministic schema validation, coverage checks, browser/PDF verification, and explicit review gates before atomic publication.

### 2. Preserve Source Provenance End-to-End
Every Idea, Article block, flashcard, question, and vector chunk retains provenance links back to source document pages and checksums. Assessment answer keys are strictly excluded from shared caches and student tutoring retrieval.

### 3. Separate Authoring from Publication
External AI agents can validate, inspect, and stage revisions over MCP, while publication requires explicit scoped consent and verified revision receipts.

### 4. Multi-Provider AI Resilience and Quota Isolation
All AI traffic routes through Cloudflare AI Gateway with dynamic catalog discovery, 3-sample median latency probes, automatic alias cooldown on consecutive failures, and a distributed Cloudflare Worker control plane for quota leases.

## Stack

- **Web**: Next.js 16.3, React 19, TypeScript, Tailwind CSS v4, TanStack Query 5, `next-intl`
- **Native**: Capacitor 7 (Android/iOS), Tauri v2 (Windows/macOS/Linux)
- **Data & Storage**: Drizzle ORM, Neon PostgreSQL, Neon Object Storage, Better Auth
- **Background & Edge**: Neon Functions, Inngest, Google Cloud Tasks, Cloudflare Workers, AI Gateway, Vectorize, Workers KV
- **AI & Scientific**: Gemini & multi-provider BYOK via AI Gateway, KaTeX, JSXGraph, Pyodide, Three.js / React Three Fiber
- **Authoring**: Model Context Protocol (MCP) SDK, Playwright Chromium verification

## Public Links

- Live platform: https://zyxacademy.com
- Public MCP authoring skills: https://github.com/soezyxstt/zyx-authoring-mcp
- Portfolio: https://adihnursyam.com

## Author

Adi Haditya Nursyam
Portfolio: https://adihnursyam.com
