"use client";
import { reconcileCodingDraft, type CodingDraftSnapshot } from "@/lib/coding/draft-reconciliation";
import { useEffect, useRef, useState } from "react";

export function useCodingDraft({ courseId, draftKey, learnerId, initialCode, initialStdin = "", localOnly = false }: { courseId: string; draftKey: string; learnerId?: string; initialCode: string; initialStdin?: string; localOnly?: boolean }) {
  const [code, setCode] = useState(initialCode), [stdin, setStdin] = useState(initialStdin);
  const [saved, setSaved] = useState(""), [ready, setReady] = useState(false);
  const latest = useRef({ code, stdin });
  const [conflicted, setConflicted] = useState(false), [syncTick, setSyncTick] = useState(0);
  const revision = useRef(0), changed = useRef(false), active = useRef(true), conflict = useRef(false);
  const queue = useRef(Promise.resolve());
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
    async function restore() {
      let local: CodingDraftSnapshot | null = null;
      try { if (localKey) local = JSON.parse(localStorage.getItem(localKey) ?? "null"); } catch { /* Storage can be disabled. */ }
      if (local && (typeof local.code !== "string" || local.code.length > 64000 || typeof local.stdin !== "string" || local.stdin.length > 8000)) local = null;
      if (local && typeof local.code === "string" && local.code.length <= 64_000 && typeof local.stdin === "string" && !changed.current) { setCode(local.code); setStdin(local.stdin); }
      if (learnerId && !localOnly) {
        try {
          const response = await fetch(`/api/coding/drafts?${new URLSearchParams({ courseId, draftKey })}`);
          if (response.ok) {
            const { draft } = await response.json();
            if (!cancelled) {
              const candidate = changed.current ? { ...latest.current, revision: local?.revision ?? 0 } : local;
              const decision = reconcileCodingDraft(candidate, draft);
              revision.current = decision.revision;
              if (decision.conflict) { conflict.current = true; setConflicted(true); setSaved("Kode di browser berbeda dari kode tersimpan."); }
              if (decision.source === "remote" && !changed.current) { setCode(draft.code); setStdin(draft.stdin); }
              if (local && !decision.conflict && (local.code !== draft?.code || local.stdin !== draft?.stdin)) changed.current = true;
            }
          }
        } catch { /* The local draft is still usable. */ }
      }
      if (!cancelled) setReady(true);
    }
    void restore();
    return () => { cancelled = true; active.current = false; };
  }, [courseId, draftKey, learnerId, localKey, localOnly]);
  useEffect(() => {
    if (!ready || !changed.current) return;
    try { if (localKey) { localStorage.setItem(localKey, JSON.stringify({ code, stdin, revision: revision.current })); if (!conflict.current) setSaved("Tersimpan di perangkat"); } } catch { setSaved("Penyimpanan perangkat tidak tersedia"); }
    if (localOnly || !learnerId || conflict.current) return;
    const timer = setTimeout(() => {
      queue.current = queue.current.then(async () => {
        if (conflict.current || identity.current !== localKey || !active.current) return;
        try {
          const response = await fetch("/api/coding/drafts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, draftKey, code, stdin, revision: revision.current }) });
          if (response.status === 409) { conflict.current = true; if (active.current) { setConflicted(true); setSaved("Kode di browser berbeda dari kode tersimpan."); } return; }
          if (!response.ok) return;
          revision.current = (await response.json()).revision;
          try {
            if (localKey) {
              const current = JSON.parse(localStorage.getItem(localKey) ?? "null");
              if (current) localStorage.setItem(localKey, JSON.stringify({ ...current, revision: revision.current }));
            }
          } catch { /* The remote revision is still authoritative. */ }
          if (active.current) setSaved("Tersimpan");
        } catch { /* Retain local draft while offline. */ }
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [code, stdin, ready, learnerId, courseId, draftKey, localKey, syncTick, localOnly]);
  async function keepLocal() {
    if (localOnly || !learnerId || !localKey) return;
    try {
      const response = await fetch(`/api/coding/drafts?${new URLSearchParams({ courseId, draftKey })}`);
      if (!response.ok || identity.current !== localKey || !active.current) return;
      const body = await response.json();
      revision.current = body.draft?.revision ?? 0;
      conflict.current = false; setConflicted(false); changed.current = true; setSyncTick((tick) => tick + 1);
    } catch { setSaved("Draft belum dapat disinkronkan. Kode lokal tetap tersimpan."); }
  }
  return { code, stdin, saved, conflicted, keepLocal, setCode: (value: string) => { changed.current = true; latest.current.code = value; setCode(value); }, setStdin: (value: string) => { changed.current = true; latest.current.stdin = value; setStdin(value); } };
}
