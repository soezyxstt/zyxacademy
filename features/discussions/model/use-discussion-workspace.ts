"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useUrlTab } from "@/hooks/use-url-tab";
import {
  peekRestoredCameraPayload,
  ZYX_CAMERA_RESTORED_EVENT,
} from "@/lib/native/camera-recovery";
import {
  emptyComposerDraft,
  setComposerReplyTarget,
  type ComposerDraft,
} from "@/components/discussions/composer";
import {
  loadPersistedDiscussionDrafts,
  mergePersistedDiscussionDrafts,
  savePersistedDiscussionDrafts,
} from "@/lib/discussions/draft-persistence";
import type {
  DiscussionChannel,
  DiscussionForwardDraft,
  DiscussionMessage as Message,
  DiscussionPerson,
  DiscussionQuestion,
  DiscussionWorkspaceProps,
} from "@/components/discussions/view-model";

type State<T> = [T, Dispatch<SetStateAction<T>>];

export type DiscussionDraftState = {
  drafts: State<Record<string, ComposerDraft>>;
  forwardDrafts: State<Record<string, DiscussionForwardDraft>>;
  newOpen: State<boolean>;
  newChannel: State<DiscussionChannel | null>;
};

export function discussionPrivacyKey(
  channel: DiscussionChannel & { kind: "private" },
  role: DiscussionWorkspaceProps["viewer"]["role"]
) {
  const requester = channel.isRequester ?? role === "student";
  return channel.privateKind === "academic"
    ? channel.courseId
      ? requester
        ? "privacyAcademicCourse"
        : "privacyAcademicCourseStaff"
      : requester
        ? "privacyAcademicAll"
        : "privacyAcademicAllStaff"
    : requester
      ? "privacyAdmin"
      : "privacyAdminStaff";
}

export function discussionAudienceKey(
  channel: DiscussionChannel,
  role: DiscussionWorkspaceProps["viewer"]["role"]
) {
  return channel.kind === "private"
    ? discussionPrivacyKey(channel, role)
    : channel.kind === "global"
      ? "privacyGlobal"
      : "privacyCourse";
}

export type DiscussionWorkspaceController = ReturnType<typeof useDiscussionWorkspace>;

/**
 * Shared state and draft controller lifted above ViewportSwitch so
 * switching between mobile and desktop never loses reply, new-question,
 * or forward drafts and preserves camera recovery state.
 */
export function useDiscussionWorkspace(
  props: DiscussionWorkspaceProps & { draftState?: DiscussionDraftState }
) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchVisible = searchExpanded || !!props.search;
  const [urlTab, setUrlTab] = useUrlTab("discussionTab", "questions");

  const localDrafts = useState<Record<string, ComposerDraft>>({});
  const [drafts, setDrafts] = props.draftState?.drafts ?? localDrafts;
  const localForwardDrafts = useState<Record<string, DiscussionForwardDraft>>({});
  const [forwardDrafts, setForwardDrafts] =
    props.draftState?.forwardDrafts ?? localForwardDrafts;

  const draftsRef = useRef(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const draftsHydratedForRef = useRef<string | null>(null);
  const viewerId = props.viewer.id;

  useEffect(() => {
    if (!viewerId) return;
    if (draftsHydratedForRef.current === viewerId) return;
    draftsHydratedForRef.current = viewerId;
    const saved = loadPersistedDiscussionDrafts(viewerId);
    if (!saved) return;
    setDrafts((current) =>
      mergePersistedDiscussionDrafts(current, saved, emptyComposerDraft),
    );
  }, [viewerId, setDrafts]);

  useEffect(() => {
    if (!viewerId || draftsHydratedForRef.current !== viewerId) return;
    const timer = window.setTimeout(() => {
      savePersistedDiscussionDrafts(viewerId, draftsRef.current);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [viewerId, drafts]);

  useEffect(() => {
    if (!viewerId) return;
    const flush = () => {
      if (draftsHydratedForRef.current === viewerId) {
        savePersistedDiscussionDrafts(viewerId, draftsRef.current);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      flush();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [viewerId]);

  const localNewOpen = useState(false);
  const localNewChannel = useState<DiscussionChannel | null>(null);
  const [newOpen, setNewOpen] = props.draftState?.newOpen ?? localNewOpen;
  const [newChannel, setNewChannel] = props.draftState?.newChannel ?? localNewChannel;

  const [mutePending, setMutePending] = useState(false);
  const [muteError, setMuteError] = useState(false);
  const statusWrites = useRef(new Set<string>());
  const [pendingStatusIds, setPendingStatusIds] = useState<ReadonlySet<string>>(() => new Set());
  const [statusError, setStatusError] = useState(false);
  const [profileTarget, setProfileTarget] = useState<{
    author: DiscussionPerson;
    questionId: string;
  } | null>(null);

  const prevQuestionId = useRef(props.selectedQuestionId);
  const controlledDrafts = Boolean(props.draftState);

  useEffect(
    () => () => {
      if (!controlledDrafts) {
        Object.values(draftsRef.current).forEach((draft) =>
          draft.images.forEach((image) => URL.revokeObjectURL(image.previewUrl))
        );
      }
    },
    [controlledDrafts]
  );

  useEffect(() => {
    if (props.selectedQuestionId && props.selectedQuestionId !== prevQuestionId.current) {
      setNewOpen(false);
    }
    prevQuestionId.current = props.selectedQuestionId;
  }, [props.selectedQuestionId, setNewOpen]);

  const { viewer, channels, selectedQuestionId, onSelectQuestion } = props;

  useEffect(() => {
    const restoreComposerIfNeeded = () => {
      const pending = peekRestoredCameraPayload(
        (target) => target.surface === "discussion" && target.viewerId === viewer.id
      );
      if (!pending || pending.target.surface !== "discussion") return;
      const target = pending.target;
      if (target.mode === "new") {
        const targetChannelId = target.channelId;
        const matched = channels.find(
          (item) => item.id === targetChannelId && item.canCreate
        );
        if (matched) {
          setNewChannel(matched);
          setNewOpen(true);
        }
      } else if (target.mode === "reply" && selectedQuestionId !== target.questionId) {
        setNewOpen(false);
        onSelectQuestion(target.questionId);
      }
    };

    restoreComposerIfNeeded();
    window.addEventListener(ZYX_CAMERA_RESTORED_EVENT, restoreComposerIfNeeded);
    return () =>
      window.removeEventListener(ZYX_CAMERA_RESTORED_EVENT, restoreComposerIfNeeded);
  }, [channels, onSelectQuestion, selectedQuestionId, viewer.id, setNewChannel, setNewOpen]);

  const updateDraft = useCallback(
    (key: string, change: (draft: ComposerDraft) => ComposerDraft) => {
      setDrafts((current) => ({
        ...current,
        [key]: change(current[key] ?? emptyComposerDraft()),
      }));
    },
    [setDrafts]
  );

  const updateForwardDraft = useCallback(
    (
      key: string,
      change: (draft: DiscussionForwardDraft | undefined) => DiscussionForwardDraft | undefined
    ) => {
      setForwardDrafts((current) => {
        const next = change(current[key]);
        if (next) return { ...current, [key]: next };
        const { [key]: _, ...rest } = current;
        return rest;
      });
    },
    [setForwardDrafts]
  );

  const newDraft = drafts.new ?? emptyComposerDraft();
  const newLocked =
    newDraft.error === "unknown" || newDraft.error === "replay_unverified";
  const question =
    props.selectedQuestion?.id === props.selectedQuestionId ? props.selectedQuestion : null;
  const statusPending = question !== null && pendingStatusIds.has(question.id);
  const channel = props.channels.find((item) => item.id === question?.channelId);
  const selectedChannel =
    props.channels.find((item) => item.id === props.selectedChannelId) ?? channel;
  const draftKey = question ? `question:${question.id}` : "none";
  const threadDraft = drafts[draftKey] ?? emptyComposerDraft();
  const threadLocked =
    threadDraft.error === "unknown" || threadDraft.error === "replay_unverified";
  const canReport = props.viewer.role === "admin" && props.reports !== undefined;
  const activeTab: "questions" | "reports" =
    canReport && (props.activeTab ?? urlTab) === "reports" ? "reports" : "questions";
  const creatableChannels = props.channels.filter((item) => item.canCreate);
  const newChannelId = newChannel?.id ?? "";
  const composeActive = newOpen;

  const loadAuthorProfile = props.onLoadAuthorProfile;
  const profileQuestionId = profileTarget?.questionId;
  const loadProfile = useCallback(
    (authorId: string) =>
      loadAuthorProfile!({ questionId: profileQuestionId!, authorId }),
    [loadAuthorProfile, profileQuestionId]
  );

  const changeTab = useCallback(
    (tab: "questions" | "reports") => {
      if (props.onTabChange) props.onTabChange(tab);
      else setUrlTab(tab);
    },
    [props, setUrlTab]
  );

  const openNew = useCallback(() => {
    if (!newChannel) {
      const initial =
        creatableChannels.find((item) => item.id === props.selectedChannelId) ??
        creatableChannels[0] ??
        null;
      if (initial) setNewChannel(initial);
    }
    if (props.selectedQuestionId) props.onSelectQuestion(null);
    setNewOpen(true);
  }, [creatableChannels, newChannel, props, setNewChannel, setNewOpen]);

  const selectQuestion = useCallback(
    (id: string | null, messageId?: string | null) => {
      setNewOpen(false);
      props.onSelectQuestion(id, messageId);
    },
    [props, setNewOpen]
  );

  const toggleMute = useCallback(async () => {
    if (!selectedChannel || mutePending) return;
    setMutePending(true);
    setMuteError(false);
    try {
      await props.onSetChannelMuted({
        channelId: selectedChannel.id,
        muted: !selectedChannel.muted,
      });
    } catch {
      setMuteError(true);
    } finally {
      setMutePending(false);
    }
  }, [mutePending, props, selectedChannel]);

  const onSetQuestionStatus = props.onSetQuestionStatus;
  const changeQuestionStatus = useCallback(async (item: DiscussionQuestion) => {
    if (!item.canResolve || !onSetQuestionStatus || statusWrites.current.has(item.id)) return;
    statusWrites.current.add(item.id);
    setPendingStatusIds(new Set(statusWrites.current));
    try {
      await onSetQuestionStatus({
        questionId: item.id,
        status: item.status === "resolved" ? "open" : "resolved",
      });
    } finally {
      statusWrites.current.delete(item.id);
      setPendingStatusIds(new Set(statusWrites.current));
    }
  }, [onSetQuestionStatus]);

  const toggleStatus = useCallback(async () => {
    if (!question) return;
    setStatusError(false);
    try {
      await changeQuestionStatus(question);
    } catch {
      setStatusError(true);
    }
  }, [changeQuestionStatus, question]);

  const replyTo = useCallback(
    (message: Message) => {
      updateDraft(draftKey, (draft) =>
        setComposerReplyTarget(draft, {
          id: message.id,
          authorName: message.author.name,
          excerpt: message.body,
          imageOnly: !message.body,
        })
      );
    },
    [draftKey, updateDraft]
  );

  return {
    mounted,
    searchExpanded,
    setSearchExpanded,
    searchVisible,
    urlTab,
    setUrlTab,
    drafts,
    forwardDrafts,
    newOpen,
    setNewOpen,
    newChannel,
    setNewChannel,
    mutePending,
    muteError,
    statusPending,
    pendingStatusIds,
    statusError,
    profileTarget,
    setProfileTarget,
    updateDraft,
    updateForwardDraft,
    newDraft,
    newLocked,
    question,
    channel,
    selectedChannel,
    draftKey,
    threadDraft,
    threadLocked,
    canReport,
    activeTab,
    creatableChannels,
    newChannelId,
    composeActive,
    loadAuthorProfile,
    profileQuestionId,
    loadProfile,
    changeTab,
    openNew,
    selectQuestion,
    toggleMute,
    toggleStatus,
    changeQuestionStatus,
    replyTo,
  };
}
