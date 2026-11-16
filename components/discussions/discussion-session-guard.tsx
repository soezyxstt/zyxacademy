"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { discussionViewerState } from "./discussion-adapter";
import type { ComposerDraft } from "./composer";
import type { DiscussionDraftState } from "./discussion-workspace";
import type { DiscussionChannel as UiChannel, DiscussionForwardDraft, DiscussionPrivateKind } from "./view-model";

export function useRetainedDiscussionDrafts(invalidated: { current: boolean }) {
  const [drafts, setDraftsRaw] = useState<Record<string, ComposerDraft>>({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const disposed = useRef(false);
  const purged = useRef(false);
  const [forwardDrafts, setForwardDraftsRaw] = useState<Record<string, DiscussionForwardDraft>>({});
  const setForwardDrafts = useCallback<Dispatch<SetStateAction<Record<string, DiscussionForwardDraft>>>>((change) => {
    if (disposed.current || invalidated.current) return;
    setForwardDraftsRaw((current) => {
      if (disposed.current || invalidated.current) return current;
      return typeof change === "function" ? change(current) : change;
    });
  }, [invalidated]);
  const setDrafts = useCallback<Dispatch<SetStateAction<Record<string, ComposerDraft>>>>((change) => {
    if (disposed.current || invalidated.current) return;
    setDraftsRaw((current) => {
      if (disposed.current || invalidated.current) return current;
      const next = typeof change === "function" ? change(current) : change;
      draftsRef.current = next;
      return next;
    });
  }, [invalidated]);
  const newOpen = useState(false);
  const newTitle = useState("");
  const newChannel = useState<UiChannel | null>(null);
  const newHelpKind = useState<Exclude<DiscussionPrivateKind, "academic">>("operations");
  const newAudience = useState<"together" | "academic" | "technical">("together");
  const discard = useCallback(() => {
    if (purged.current) return;
    purged.current = true;
    Object.values(draftsRef.current).forEach(draft => draft.images.forEach(image => URL.revokeObjectURL(image.previewUrl)));
    draftsRef.current = {};
    setDraftsRaw({});
    setForwardDraftsRaw({});
    newOpen[1](false); newTitle[1](""); newChannel[1](null); newHelpKind[1]("operations"); newAudience[1]("together");
  }, []);
  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      Object.values(draftsRef.current).forEach(draft => draft.images.forEach(image => URL.revokeObjectURL(image.previewUrl)));
      draftsRef.current = {};
    };
  }, []);
  const state: DiscussionDraftState = { drafts: [drafts, setDrafts], forwardDrafts: [forwardDrafts, setForwardDrafts], newOpen, newTitle, newChannel, newHelpKind, newAudience };
  return { state, discard };
}

export function DiscussionSessionGuard(props: { viewerId: string; sessionId?: string; pending: boolean; children: (state: DiscussionDraftState) => ReactNode }) {
  const t = useTranslations("discussions");
  const { sessionId, pending: isPending } = props;
  const router = useRouter();
  const invalidated = useRef(false);
  if (!isPending && sessionId && sessionId !== props.viewerId) invalidated.current = true;
  const retained = useRetainedDiscussionDrafts(invalidated);
  const changedAccount = invalidated.current;
  useEffect(() => { if (changedAccount) retained.discard(); }, [changedAccount, retained.discard]);
  const state = changedAccount ? "changed" : isPending ? "loading" : discussionViewerState(props.viewerId, sessionId, false);
  if (state === "loading") return <p role="status">{t("viewerLoading")}</p>;
  if (!changedAccount && !sessionId) return <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-4 text-body-sm"><span>{t("viewerExpired")}</span><Button asChild variant="outline" size="sm"><a href="/sign-in" target="_blank" rel="noopener noreferrer">{t("signInAgain")}</a></Button></div>;
  if (state === "changed") return <div role="alert" className="flex flex-wrap items-center gap-2 text-body-sm">{t("viewerChanged")}<Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>{t("reload")}</Button></div>;
  return props.children(retained.state);
}
