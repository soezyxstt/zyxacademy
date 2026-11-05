# Production Playground CSS investigation

Status: `OPEN / IN PROGRESS`. Inspected 2026-11-02.

Production deployment `dpl_6NdyHdMq8UovScsrBuMTdTehwVSn` serves `main` commit
`c192218f8fe8611c2cefba30808754675be071dc`. Its build log confirms a restored
cache from deployment `AyN9Z4jqg3uk6rgNULxtApz2hfvy` and Next.js 16.3.0.

The production CSS fetched through `/sign-in` used
`/_next/static/immutable/chunks/36liicg7leyau.css` and
`/_next/static/immutable/chunks/05-2g-py6d8u3.css`. Neither contained
`--code-keyword` or `--code-string`. Staging CSS
`/_next/static/chunks/2p2ovxo3o4p7d.css` contained both. Missing variables explain
the editor syntax-color fallback; this does not establish the cause of every
layout difference in the supplied screenshots.

The stylesheet in `main` and `staging` is identical. An optimized Tailwind
compilation and a clean, minimal Next.js 16.3.0 production build using this
stylesheet both retained the editor tokens. The minimal build is a CSS-pipeline
probe, not a successful full application build. The full local application
build was interrupted during compilation and is not release evidence.

Cache reuse is a hypothesis, not a confirmed root cause. Release the reviewed
application revision with a fresh Vercel build without the previous build cache,
then inspect the newly served CSS and authenticated Playground in light and dark
themes. Check the served deployment ID and commit before comparing screenshots.
Do not treat environment-variable changes or the Render worker update as a CSS
fix. No production web redeployment was performed during this investigation.
