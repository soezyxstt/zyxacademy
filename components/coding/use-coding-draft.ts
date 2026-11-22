"use client";
import { reconcileCodingDraft, type CodingDraftSnapshot } from "@/lib/coding/draft-reconciliation";
import { createCodingDraftRequestScope } from "@/lib/coding/draft-request-scope";
import { getQueryClient, isQueryAccountCurrent } from "@/lib/query/client";
import { useEffect, useRef, useState } from "react";

export function useCodingDraft({ courseId, draftKey, learnerId, initialCode, initialStdin = "", localOnly = false }: { courseId: string; draftKey: string; learnerId?: string; initialCode: string; initialStdin?: string; localOnly?: boolean }) {
  const [code, setCode] = useState(initialCode), [stdin, setStdin] = useState(initialStdin);
  const [saved, setSaved] = useState(""), [ready, setReady] = useState(false);
  const latest = useRef({ code, stdin });
  const [conflicted, setConflicted] = useState(false), [syncTick, setSyncTick] = useState(0);
  const revision = useRef(0), changed = useRef(false), active = useRef(true), conflict = useRef(false);
  const queue = useRef(Promise.resolve());
  const requests = useRef<ReturnType<typeof createCodingDraftRequestScope> | null>(null);
  const identity = useRef<string | null>(null);
  const initial = useRef({ code: initialCode, stdin: initialStdin });
  const localKey = learnerId ? `zyx-python:${learnerId}:${courseId}:${draftKey}` : null;
  useEffect(() => {
    active.current = true;
    if (identity.current !== localKey) {
      const previousOwner = identity.current;
      identity.current = localKey;
      revision.current = 0; conflict.current = false; setConflicted(false); setReady(false);
      if (previousOwner !== null || !changed.current) { changed.current = false; setCode(initial.current.code); setStdin(initial.current.stdin); }
      setSaved("");
    }
    let cancelled = false;
    let restored = false;
    const scope = createCodingDraftRequestScope(
      () => !cancelled && active.current && identity.current === localKey && !!learnerId
        && isQueryAccountCurrent(getQueryClient(), learnerId),
      () => {
        if (!restored) void restore();
        else setSyncTick((tick) => tick + 1);
      },
    );
    requests.current = scope;
    async function restore() {
      let local: CodingDraftSnapshot | null = null;
      try { if (localKey) local = JSON.parse(localStorage.getItem(localKey) ?? "null"); } catch { /* Storage can be disabled. */ }
      if (local && (typeof local.code !== "string" || local.code.length > 64000 || typeof local.stdin !== "string" || local.stdin.length > 8000)) local = null;
      if (local && typeof local.code === "string" && local.code.length <= 64_000 && typeof local.stdin === "string" && !changed.current) { setCode(local.code); setStdin(local.stdin); }
      if (learnerId && !localOnly) {
        const request = scope.begin();
        if (!request) return;
        try {
          const response = await fetch(`/api/coding/drafts?${new URLSearchParams({ courseId, draftKey })}`, { signal: request.signal, headers: { "x-student-id": learnerId } });
          if (!request.isCurrent()) return;
          if (response.status === 409) { scope.dispose(); return; }
          if (response.ok) {
            const { draft } = await response.json();
            if (request.isCurrent()) {
              const candidate = changed.current ? { ...latest.current, revision: local?.revision ?? 0 } : local;
              const decision = reconcileCodingDraft(candidate, draft);
              revision.current = decision.revision;
              if (decision.conflict) { conflict.current = true; setConflicted(true); setSaved("Kode di browser berbeda dari kode tersimpan."); }
              if (decision.source === "remote" && !changed.current) { setCode(draft.code); setStdin(draft.stdin); }
              if (local && !decision.conflict && (local.code !== draft?.code || local.stdin !== draft?.stdin)) changed.current = true;
            }
          }
        } catch { /* The local draft is still usable. */ }
        finally { request.finish(); }
        if (!request.isCurrent()) return;
      }
      if (!cancelled) { restored = true; setReady(true); }
    }
    void restore();
    return () => {
      cancelled = true; active.current = false; scope.dispose();
      if (requests.current === scope) requests.current = null;
    };
  }, [courseId, draftKey, learnerId, localKey, localOnly]);
  useEffect(() => {
    if (!ready || !changed.current) return;
    try { if (localKey) { localStorage.setItem(localKey, JSON.stringify({ code, stdin, revision: revision.current })); if (!conflict.current) setSaved("Tersimpan di perangkat"); } } catch { setSaved("Penyimpanan perangkat tidak tersedia"); }
    if (localOnly || !learnerId || conflict.current) return;
    const scope = requests.current;
    const timer = setTimeout(() => {
      queue.current = queue.current.then(async () => {
        if (conflict.current || identity.current !== localKey || !active.current) return;
        const request = scope?.begin();
        if (!request) return;
        try {
          const response = await fetch("/api/coding/drafts", { method: "PUT", signal: request.signal, headers: { "Content-Type": "application/json", "x-student-id": learnerId }, body: JSON.stringify({ courseId, draftKey, code, stdin, revision: revision.current }) });
          if (!request.isCurrent()) return;
          if (response.status === 409) {
            const failure = await response.json().catch(() => null);
            if (!request.isCurrent()) return;
            if (failure?.code === "ACCOUNT_CHANGED") { scope?.dispose(); return; }
            conflict.current = true; setConflicted(true); setSaved("Kode di browser berbeda dari kode tersimpan."); return;
          }
          if (!response.ok) return;
          const body = await response.json();
          if (!request.isCurrent()) return;
          revision.current = body.revision;
          try {
            if (localKey) {
              const current = JSON.parse(localStorage.getItem(localKey) ?? "null");
              if (current) localStorage.setItem(localKey, JSON.stringify({ ...current, revision: revision.current }));
            }
          } catch { /* The remote revision is still authoritative. */ }
          if (active.current) setSaved("Tersimpan");
        } catch { /* Retain local draft while offline. */ }
        finally { request.finish(); }
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [code, stdin, ready, learnerId, courseId, draftKey, localKey, syncTick, localOnly]);
  async function keepLocal() {
    if (localOnly || !learnerId || !localKey) return;
    const request = requests.current?.begin();
    if (!request) return;
    try {
      const response = await fetch(`/api/coding/drafts?${new URLSearchParams({ courseId, draftKey })}`, { signal: request.signal, headers: { "x-student-id": learnerId } });
      if (response.status === 409 && request.isCurrent()) { requests.current?.dispose(); return; }
      if (!response.ok || !request.isCurrent()) return;
      const body = await response.json();
      if (!request.isCurrent()) return;
      revision.current = body.draft?.revision ?? 0;
      conflict.current = false; setConflicted(false); changed.current = true; setSyncTick((tick) => tick + 1);
    } catch { if (request.isCurrent()) setSaved("Draft belum dapat disinkronkan. Kode lokal tetap tersimpan."); }
    finally { request.finish(); }
  }
  return { code, stdin, saved, conflicted, keepLocal, setCode: (value: string) => { changed.current = true; latest.current.code = value; setCode(value); }, setStdin: (value: string) => { changed.current = true; latest.current.stdin = value; setStdin(value); } };
}
