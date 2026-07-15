# Plan 010: Sanitize link/image hrefs in the markdown renderer

> **Executor instructions**: Follow step by step. Run every verification command. If a "STOP condition" occurs, stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9c99ef5..HEAD -- components/course/markdown-renderer.tsx`
> If it changed, compare "Current state" to live code; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `9c99ef5`, 2026-07-15

## Why this matters

`markdown-renderer.tsx` builds `<a href={href}>` and `<img src={src}>` directly from the markdown capture with no scheme validation. This renderer displays AI-generated tutor content and tutor-authored material to students. A crafted `[click](javascript:...)` renders as a clickable link; React 19 does not block `javascript:` hrefs (only warns in dev), so clicking runs script in the student's session — a stored-XSS-style vector through content that is not fully trusted (LLM output / tutor input).

## Current state

`components/course/markdown-renderer.tsx:162-202` — image and link inline parsing:
```tsx
// 3. Image
const imgMatch = remaining.match(/^!\[(.*?)\]\((.*?)\)/);
if (imgMatch) {
  const alt = imgMatch[1]; const src = imgMatch[2];
  result.push(<span ...><img src={src} alt={alt} className="photo-inline ..." /> ...</span>);
  ...
}
// 4. Link
const linkMatch = remaining.match(/^\[(.*?)\]\((.*?)\)/);
if (linkMatch) {
  const linkText = linkMatch[1]; const href = linkMatch[2];
  result.push(<a href={href} target="_blank" rel="noopener noreferrer" className="...">{parseInline(linkText)}</a>);
  ...
}
```
KaTeX on the same file already sets `katexOptions.trust = false` (per audit, ~line 54), so the math sink is lower risk.

## Commands you will need

| Purpose   | Command             | Expected  |
|-----------|---------------------|-----------|
| Typecheck | `bun run typecheck` | exit 0    |
| Test      | `bun test`          | all pass  |
| Lint      | `bun run lint`      | exit 0    |

## Scope

**In scope**:
- `components/course/markdown-renderer.tsx` (link + image href handling)
- `lib/safe-url.ts` (create — a small pure helper so it is testable)
- `lib/safe-url.test.ts` (create)

**Out of scope**:
- KaTeX config (already `trust: false`).
- Other markdown block types (bold, code, etc.) — no URL sinks there.

## Git workflow

- Branch: `advisor/010-markdown-href-sanitization`
- Commit: `fix(security): allowlist url schemes in markdown link and image rendering`
- No push/PR unless instructed.

## Steps

### Step 1: Add a pure scheme allowlist helper

Create `lib/safe-url.ts`:
```ts
const ALLOWED = ["http:", "https:", "mailto:"];
/** Returns the href if its scheme is safe (or it is a relative/anchor url), else null. */
export function safeHref(raw: string): string | null {
  const s = raw.trim();
  if (s === "") return null;
  // relative, root-relative, anchor, or protocol-relative-to-https are fine
  if (s.startsWith("/") || s.startsWith("#") || s.startsWith("./") || s.startsWith("../")) return s;
  try {
    const u = new URL(s, "https://placeholder.local");
    // If parsing against a base changed nothing suspicious, check the scheme when absolute.
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) {
      return ALLOWED.includes(u.protocol) ? s : null;
    }
    return s; // no explicit scheme -> treated relative, safe
  } catch {
    return null;
  }
}
/** For images, allow http(s) and data:image/ only. */
export function safeImageSrc(raw: string): string | null {
  const s = raw.trim();
  if (s.startsWith("/") || s.startsWith("./") || s.startsWith("../")) return s;
  if (/^data:image\//i.test(s)) return s;
  try {
    const u = new URL(s, "https://placeholder.local");
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) return ["http:", "https:"].includes(u.protocol) ? s : null;
    return s;
  } catch { return null; }
}
```

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Apply the helper in the renderer

Import `safeHref`, `safeImageSrc`. In the link branch, compute `const href = safeHref(linkMatch[2]);` and if `null`, render the link text as plain text (drop the anchor). In the image branch, compute `const src = safeImageSrc(imgMatch[2]);` and if `null`, render the `alt` text (or nothing) instead of the `<img>`.

**Verify**: `bun run typecheck` → exit 0; `bun run lint` → exit 0.

### Step 3: Test the helper

Create `lib/safe-url.test.ts` (Bun): `javascript:alert(1)` → null; `JavaScript:...` (case) → null; `data:text/html,...` → null for href; `https://x.com` → passthrough; `mailto:a@b.com` → passthrough; `/course/1` relative → passthrough; `data:image/png;base64,...` → passthrough for `safeImageSrc` but null for `safeHref`.

**Verify**: `bun test` → all pass.

## Test plan

- Covered by `lib/safe-url.test.ts`. Model after plan-001 test files.
- Manual: render tutor content containing a `javascript:` link and confirm it is not clickable (renders as text).

## Done criteria

ALL must hold:
- [ ] `safeHref`/`safeImageSrc` exist, are pure, and are unit-tested (js/data schemes rejected)
- [ ] The renderer routes every link href and image src through them
- [ ] `bun test` / `bun run typecheck` / `bun run lint` exit 0
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

- The renderer is used to display fully-trusted static content only and never AI/tutor input (contradicting the audit) — verify the data sources before deciding the risk is moot; if truly all-trusted, still apply (defense in depth) but note it.
- Legitimate content relies on a non-allowlisted scheme (e.g. `tel:`) — add it to the allowlist explicitly and note in PR.

## Maintenance notes

- Reviewer: confirm no other component renders markdown links from untrusted content without this helper (grep for `href={` in components/course).
- If a richer markdown pipeline replaces this hand-rolled parser later, keep scheme allowlisting in the replacement.
