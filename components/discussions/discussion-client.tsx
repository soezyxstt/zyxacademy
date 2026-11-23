"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "@/lib/i18n/client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { usePullToRefreshHandler } from "@/components/pull-to-refresh";
import { useSession } from "@/lib/auth-client";
import * as actions from "@/lib/discussions/actions";
import type { DiscussionChannelMetadata as Channel, DiscussionMessage as Message, DiscussionReport as Report, DiscussionThread as Thread } from "@/lib/discussions/contracts";
import { DISCUSSION_COUNTS_CHANGED } from "./discussion-count-badge";
import { beginChannelMetadataRequest, beginPageRequest, canSuggestForwardChannel, discussionPrivateQuestionHref, discussionStatusUncovered, discussionUploadError, discussionVisibilityBlocked, discussionWorkspaceReads, initialDiscussionMessageCursors, listDiscussionQuestionPage, loadDiscussionChannelMetadata, mergeById, nextDiscussionMessageCursor, observeDiscussionSnapshot, replyQuote, retryDiscussionRead, searchDiscussionChannels, searchDiscussionForwardTargets, searchDiscussionMentions, toQuestion, toUiChannel, visibleDiscussionReadSnapshot, watchDiscussionVisibility } from "./discussion-adapter";
import { discussionChannelLabel } from "./discussion-message";
import { listDiscussionAiStatuses } from "./discussion-ai-status";
import { getDiscussionReadThrough } from "./discussion-read-state";
import { DiscussionWorkspaceSkeleton } from "./discussion-skeleton";
import { DiscussionWorkspace, type DiscussionDraftState } from "./discussion-workspace";
import { DiscussionSessionGuard } from "./discussion-session-guard";
import type { DiscussionChannel as UiChannel, DiscussionPerson, DiscussionWorkspaceProps } from "./view-model";

type ThreadPage = { items: Thread[]; nextCursor: string | null };
type MessagePage = { cursor?: string; items: Message[]; observationReceipt: string };
type ReadObservation = { id: string; seq: number; revision: number; receipt: string };
const signalCounts = () => window.dispatchEvent(new Event(DISCUSSION_COUNTS_CHANGED));

export function nextDiscussionReadBatch(observed: Map<number, ReadObservation>, acknowledgedThrough: number, snapshotThrough: number, visibleIds?: Set<string>) {
  const entries = [...observed.values()].filter(item => !visibleIds || visibleIds.has(item.id)).sort((a, b) => a.seq - b.seq);
  const next = entries.find(item => item.seq <= acknowledgedThrough) ?? entries.find(item => item.seq === acknowledgedThrough + 1) ?? entries[0];
  if (!next) return null;
  let throughSeq = acknowledgedThrough;
  while (throughSeq < snapshotThrough) {
    const item = observed.get(throughSeq + 1);
    if (item && (item.receipt !== next.receipt || (visibleIds && !visibleIds.has(item.id)))) break;
    throughSeq++;
  }
  return { throughSeq, receipt: next.receipt, items: entries.filter(item => item.receipt === next.receipt) };
}

export function DiscussionClient(props: { viewer: DiscussionPerson; courseId?: string }) {
  const t = useTranslations("discussions");
  const { data: session, isPending } = useSession();
  return <DiscussionSessionGuard viewerId={props.viewer.id} sessionId={session?.user?.id} pending={isPending} loadingFallback={<DiscussionWorkspaceSkeleton label={t("viewerLoading")} />}>
    {draftState => <DiscussionClientReady {...props} draftState={draftState} />}
  </DiscussionSessionGuard>;
}

function DiscussionClientReady({ viewer, courseId, draftState }: { viewer: DiscussionPerson; courseId?: string; draftState: DiscussionDraftState }) {
  const t = useTranslations("discussions");
  const router = useRouter();
  const reads = useMemo(() => discussionWorkspaceReads(viewer.id), [viewer.id]);
  const pathname = usePathname();
  const params = useSearchParams();
  const requestedChannel = params.get("channel");
  const selectedThread = params.get("thread");
  const selectedMessage = params.get("message");
  const activeTab = params.get("discussionTab") === "reports" && viewer.role === "admin" ? "reports" : "questions";
  const currentThread = useRef(selectedThread);
  currentThread.current = selectedThread;
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelMetadata, setChannelMetadata] = useState<{ key: string; items: Channel[]; status: "loading" | "ready" | "error" }>({ key: "", items: [], status: "loading" });
  const [retryChannelMetadata, setRetryChannelMetadata] = useState(0);
  const [pinnedChannel, setPinnedChannel] = useState<UiChannel | null>(null);
  const [channelsReady, setChannelsReady] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const [resolvedOpen, setResolvedOpen] = useState(false);
  const [resolvedPage, setResolvedPage] = useState<ThreadPage>({ items: [], nextCursor: null });
  const [resolvedState, setResolvedState] = useState<"loading" | "ready" | "error">("loading");
  const [resolvedRevision, setResolvedRevision] = useState(0);
  const resolvedRequests = useRef(new Map<string, symbol>());
  const [resolvedPaging, setResolvedPaging] = useState<{ key: string; index: number; cursors: Array<string | undefined> }>({ key: "", index: 0, cursors: [undefined] });
  const [threadPage, setThreadPage] = useState<ThreadPage>({ items: [], nextCursor: null });
  const [threadPageIndex, setThreadPageIndex] = useState(0);
  const threadPageIndexRef = useRef(0);
  const threadPageCursors = useRef<Array<string | undefined>>([undefined]);
  const threadPagingVersion = useRef(0);
  const threadPageBusyRef = useRef(false);
  const [threadPageBusy, setThreadPageBusy] = useState(false);
  const [listRefreshError, setListRefreshError] = useState(false);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [threadState, setThreadState] = useState<"loading" | "ready" | "error">("ready");
  const [thread, setThread] = useState<Thread | null>(null);
  const [sentMessage, setSentMessage] = useState<{ threadId: string; id: string } | null>(null);
  const [messagePages, setMessagePages] = useState<MessagePage[]>([]);
  const messagePagesRef = useRef(messagePages);
  messagePagesRef.current = messagePages;
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [messagePageIndex, setMessagePageIndex] = useState(0);
  const [messagePageBusy, setMessagePageBusy] = useState(false);
  const [messagePageError, setMessagePageError] = useState(false);
  const messagePageBusyRef = useRef(false);
  const messagePageVersion = useRef(0);
  const messagePageCursors = useRef<Array<string | undefined>>([undefined]);
  const [aiStatuses, setAiStatuses] = useState<Record<string, { status: string; reason: string | null }>>({});
  const [aiStatusError, setAiStatusError] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [liveError, setLiveError] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [reportCursor, setReportCursor] = useState<string | null>(null);
  const [reportPageIndex, setReportPageIndex] = useState(0);
  const reportPageIndexRef = useRef(0);
  const reportPageCursors = useRef<Array<string | undefined>>([undefined]);
  const [reportError, setReportError] = useState(false);
  const [reportBusy, setReportBusy] = useState(true);
  const [retryReports, setRetryReports] = useState(0);
  const listRequests = useRef(new Map<string, symbol>());
  const channelsVersion = useRef(0);
  const channelMetadataVersion = useRef(0);
  const threadVersion = useRef(0);
  const pageVersions = useRef(new Map<string, symbol>());
  const reportVersion = useRef(0);
  const observation = useRef({ through: 0, seen: new Set<number>(), versions: new Map<string, number>() });
  const observedMessages = useRef(new Map<number, ReadObservation>());
  const acknowledgedThrough = useRef(0);
  const acknowledgedSnapshot = useRef<string | null>(null);
  const readInFlight = useRef<ReturnType<typeof actions.markRead> | null>(null);
  const [retryLists, setRetryLists] = useState(0);
  const [retryThread, setRetryThread] = useState(0);
  const [readError, setReadError] = useState(false);
  const [retryRead, setRetryRead] = useState(0);
  const selectionVersion = useRef(0);
  const selectionKey = `${viewer.id}:${courseId ?? ""}:${requestedChannel ?? ""}:${selectedThread ?? ""}:${selectedMessage ?? ""}`;
  const previousSelection = useRef(selectionKey);
  const titlePollTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const mounted = useRef(true);
  if (previousSelection.current !== selectionKey) { previousSelection.current = selectionKey; selectionVersion.current++; }
  useEffect(() => {
    mounted.current = true;
    const timers = titlePollTimers.current;
    return () => {
      mounted.current = false;
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      selectionVersion.current++;
      channelsVersion.current++;
      threadPagingVersion.current++;
      threadVersion.current++;
      reportVersion.current++;
      currentThread.current = null;
    };
  }, []);
  const scheduleTitleRefresh = useCallback((threadId: string) => {
    for (const delay of [2000, 4500, 8000]) {
      const timer = setTimeout(() => {
        titlePollTimers.current.delete(timer);
        if (!mounted.current) return;
        void reads.getThread(threadId).then((latest) => {
          if (!mounted.current) return;
          const nextTitle = latest.thread.title;
          setThread((old) => (old?.id === threadId && old.title !== nextTitle ? { ...old, title: nextTitle } : old));
          setThreadPage((old) => ({
            ...old,
            items: old.items.map((item) => (item.id === threadId && item.title !== nextTitle ? { ...item, title: nextTitle } : item)),
          }));
        }).catch(() => {});
      }, delay);
      titlePollTimers.current.add(timer);
    }
  }, [reads]);
  const refreshChannelMetadata = useCallback(() => { channelMetadataVersion.current++; setRetryChannelMetadata((value) => value + 1); }, []);
  useEffect(() => {
    window.addEventListener(DISCUSSION_COUNTS_CHANGED, refreshChannelMetadata);
    return () => window.removeEventListener(DISCUSSION_COUNTS_CHANGED, refreshChannelMetadata);
  }, [refreshChannelMetadata]);

  const courseChannelId = courseId ? channels.find((channel) => channel.kind === "course")?.id : undefined;
  const selectedChannel = courseId ? courseChannelId ?? null : requestedChannel;
  const canLoadQuestions = !courseId || channelsReady;
  const listRetry = courseId ? 0 : retryLists;
  const resolvedKey = JSON.stringify([selectedChannel, debouncedSearch, viewer.id, courseId]);
  const allThreads = threadPage.items;
  const resolvedThreads = useMemo(
    () => (resolvedPaging.key === resolvedKey && resolvedState === "ready" ? resolvedPage.items : []),
    [resolvedPaging.key, resolvedKey, resolvedState, resolvedPage.items],
  );
  const metadataIds = useMemo(() => [...new Set([...allThreads.map((item) => item.channelId), ...resolvedThreads.map((item) => item.channelId), ...(thread?.id === selectedThread ? [thread.channelId] : []), ...(selectedChannel ? [selectedChannel] : [])])].sort(), [allThreads, resolvedThreads, thread, selectedThread, selectedChannel]);
  const metadataKey = JSON.stringify(metadataIds);
  const currentMetadataKey = useRef(metadataKey);
  currentMetadataKey.current = metadataKey;
  const metadataReady = channelMetadata.key === metadataKey && channelMetadata.status === "ready";
  const visibleChannels = useMemo(() => {
    if (!metadataReady) return mergeById(channels, channelMetadata.items);
    const checked = new Set(metadataIds), authorized = new Set(channelMetadata.items.map((item) => item.id));
    return mergeById(channels.filter((item) => !checked.has(item.id) || authorized.has(item.id)), channelMetadata.items);
  }, [channels, metadataReady, metadataIds, channelMetadata.items]);
  const orderedThreads = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    if (!q || debouncedSearch.trim().toLocaleLowerCase() === q) return allThreads;
    return allThreads.filter((item) => item.title.toLocaleLowerCase().includes(q));
  }, [allThreads, search, debouncedSearch]);
  const messages = useMemo(() => messagePages.flatMap((page) => page.items), [messagePages]);
  const messagesById = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);
  const selectedQuestion = thread && thread.id === selectedThread ? toQuestion(thread, visibleChannels) : null;
  const metadataFailed = channelMetadata.key === metadataKey && channelMetadata.status === "error";
  const hasThreadChannel = Boolean(
    thread && (
      channelMetadata.items.some((item) => item.id === thread.channelId)
      || (!metadataReady && !metadataFailed && channels.some((item) => item.id === thread.channelId))
    ),
  );
  const renderedThreadState = thread?.id === selectedThread && !hasThreadChannel
    ? (metadataFailed || metadataReady ? "error" : "loading") : threadState;
  const hasMoreQuestions = !!threadPage.nextCursor;
  const hasNextMessagePage = !!nextDiscussionMessageCursor(messagePageCursors.current, messagePageIndex, messageCursor);

  useEffect(() => {
    if (sentMessage?.threadId === selectedThread && messagesById.has(sentMessage.id)) setSentMessage(null);
  }, [sentMessage, selectedThread, messagesById]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const navigate = useCallback((changes: Record<string, string | null>) => {
    if ((Object.hasOwn(changes, "thread") || Object.hasOwn(changes, "channel")) && !Object.hasOwn(changes, "message")) changes = { ...changes, message: null };
    if (Object.hasOwn(changes, "thread") || Object.hasOwn(changes, "channel")) selectionVersion.current++;
    if (Object.hasOwn(changes, "channel") && changes.channel !== selectedChannel) listRequests.current.clear();
    if (Object.hasOwn(changes, "thread")) currentThread.current = changes.thread;
    const query = new URLSearchParams(window.location.search);
    Object.entries(changes).forEach(([key, value]) => value ? query.set(key, value) : query.delete(key));
    const url = `${pathname}${query.size ? `?${query}` : ""}`;
    if (url !== window.location.pathname + window.location.search) window.history.pushState(null, "", url);
  }, [pathname, selectedChannel]);

  const applyAiStatuses = useCallback((items: Message[], statuses: Array<{ messageId: string; status: string; reason: string | null }>) => {
    setAiStatuses((old) => {
      const next = { ...old };
      items.forEach((item) => { delete next[item.id]; });
      statuses.forEach((item) => { next[item.messageId] = { status: item.status, reason: item.reason }; });
      return next;
    });
    setAiStatusError(false);
  }, []);

  const refreshAiStatuses = useCallback(async (id: string, items: Message[], current: () => boolean) => {
    try {
      const statuses = await listDiscussionAiStatuses(id, items.map((item) => item.id));
      if (!current() || currentThread.current !== id) return;
      applyAiStatuses(items, statuses);
    } catch { if (current() && currentThread.current === id) setAiStatusError(true); }
  }, [applyAiStatuses]);

  const loadCatalog = useCallback(async () => {
    const version = ++channelsVersion.current;
    setChannelsReady(false);
    setCatalogError(false);
    if (courseId) setListState("loading");
    try {
      const result = await reads.listChannelsPage({ courseId, kind: courseId ? "course" : undefined, limit: 20 });
      if (version !== channelsVersion.current) return;
      if (courseId && !result.items.length) throw new Error();
      setChannels(result.items);
      setChannelsReady(true);
    } catch (error) {
      if (version !== channelsVersion.current) return;
      if (courseId) setListState("error");
      else setCatalogError(true);
      throw error;
    }
  }, [courseId, reads]);

  useEffect(() => {
    void loadCatalog().catch(() => {});
    return () => { channelsVersion.current++; };
  }, [loadCatalog, retryLists]);

  useEffect(() => {
    const isCurrent = beginChannelMetadataRequest(channelMetadataVersion, currentMetadataKey);
    let cancelled = false;
    const ids: string[] = JSON.parse(metadataKey);
    if (!ids.length) { setChannelMetadata({ key: metadataKey, items: [], status: "ready" }); return; }
    setChannelMetadata((old) => old.key === metadataKey && old.status === "ready" ? old : { key: metadataKey, items: old.items, status: "loading" });
    void loadDiscussionChannelMetadata(reads, ids).then((items) => {
      if (!cancelled && isCurrent()) setChannelMetadata({ key: metadataKey, items, status: "ready" });
    }).catch(() => { if (!cancelled && isCurrent()) setChannelMetadata({ key: metadataKey, items: [], status: "error" }); });
    return () => { cancelled = true; };
  }, [metadataKey, reads, retryChannelMetadata]);

  const fetchThreadPage = useCallback(async (cursor?: string) => {
    const current = beginPageRequest(listRequests.current);
    let page: ThreadPage;
    try { page = await listDiscussionQuestionPage(reads, { channelId: selectedChannel ?? undefined, search: debouncedSearch, cursor, status: "open" }); }
    catch (error) { if (current()) throw error; return false; }
    if (!current()) return false;
    setThreadPage(page);
    setListRefreshError(false);
    setListState("ready");
    return true;
  }, [selectedChannel, debouncedSearch, reads]);

  const refreshQuestionList = useCallback(async () => {
    try { return await fetchThreadPage(threadPageCursors.current[threadPageIndexRef.current]); }
    catch { setListRefreshError(true); return false; }
  }, [fetchThreadPage]);
  const latestQuestionListRefresh = useRef(refreshQuestionList);
  latestQuestionListRefresh.current = refreshQuestionList;

  useEffect(() => {
    if (!canLoadQuestions) return;
    const requests = listRequests.current;
    let cancelled = false;
    threadPagingVersion.current++;
    threadPageBusyRef.current = false;
    threadPageIndexRef.current = 0;
    threadPageCursors.current = [undefined];
    setThreadPageBusy(false);
    setThreadPageIndex(0);
    setThreadPage({ items: [], nextCursor: null });
    setListState("loading");
    void fetchThreadPage().catch(() => { if (!cancelled) setListState("error"); });
    return () => { cancelled = true; requests.clear(); };
  }, [canLoadQuestions, fetchThreadPage, listRetry]);

  useEffect(() => {
    setResolvedPaging({ key: resolvedKey, index: 0, cursors: [undefined] });
    setResolvedPage({ items: [], nextCursor: null });
    setResolvedState("loading");
  }, [resolvedKey]);

  const fetchResolvedPage = useCallback(async () => {
    const current = beginPageRequest(resolvedRequests.current);
    try {
      const page = await listDiscussionQuestionPage(reads, { channelId: selectedChannel ?? undefined, search: debouncedSearch, cursor: resolvedPaging.cursors[resolvedPaging.index], status: "resolved" });
      if (current()) { setResolvedPage(page); setResolvedState("ready"); }
    } catch (error) {
      if (!current()) return;
      setResolvedState("error");
      throw error;
    }
  }, [selectedChannel, debouncedSearch, resolvedPaging, reads]);

  useEffect(() => {
    if (!resolvedOpen || !canLoadQuestions || resolvedPaging.key !== resolvedKey) return;
    const requests = resolvedRequests.current;
    void fetchResolvedPage().catch(() => {});
    return () => { requests.clear(); };
  }, [resolvedOpen, canLoadQuestions, resolvedKey, resolvedPaging.key, resolvedRevision, fetchResolvedPage]);

  function changeResolvedPage(direction: "previous" | "next") {
    if (resolvedState !== "ready") return;
    const index = resolvedPaging.index + (direction === "next" ? 1 : -1);
    if (index < 0 || (direction === "next" && !resolvedPage.nextCursor)) return;
    setResolvedState("loading");
    setResolvedPaging(old => ({ ...old, index, cursors: direction === "next" ? [...old.cursors.slice(0, index), resolvedPage.nextCursor!] : old.cursors }));
  }

  const refreshThreadPage = useCallback(async (id: string, cursor?: string, options?: { refreshMetadata?: boolean }) => {
    if (options?.refreshMetadata !== false) refreshChannelMetadata();
    const version = threadVersion.current;
    const pageVersion = messagePageVersion.current;
    const current = beginPageRequest(pageVersions.current, cursor);
    const result = await reads.getThread(id, cursor);
    if (version !== threadVersion.current || pageVersion !== messagePageVersion.current || currentThread.current !== id || !current()
      || messagePagesRef.current[0]?.cursor !== cursor) return;
    setLiveError(false);
    setThread(result.thread);
    setThreadPage((old) => ({ ...old, items: old.items.flatMap((item) => item.id === id ? result.thread.status === "open" ? [result.thread] : [] : [item]) }));
    setResolvedPage((old) => ({ ...old, items: old.items.flatMap((item) => item.id === id ? result.thread.status === "resolved" ? [result.thread] : [] : [item]) }));
    setMessagePages([{ cursor, items: result.messages.items, observationReceipt: result.messages.observationReceipt }]);
    setMessageCursor(result.messages.nextCursor);
    setThreadState("ready");
    if (result.aiStatuses) applyAiStatuses(result.messages.items, result.aiStatuses);
    else void refreshAiStatuses(id, result.messages.items, () => version === threadVersion.current && pageVersion === messagePageVersion.current && current());
    return result;
  }, [applyAiStatuses, reads, refreshAiStatuses, refreshChannelMetadata]);

  useEffect(() => {
    let cancelled = false;
    const version = ++threadVersion.current;
    messagePageVersion.current++;
    const pageVersion = messagePageVersion.current;
    messagePageCursors.current = [undefined];
    messagePageBusyRef.current = false;
    setMessagePageIndex(0);
    setMessagePageBusy(false);
    setMessagePageError(false);
    setReadError(false);
    pageVersions.current.clear();
    observation.current = { through: 0, seen: new Set(), versions: new Map() };
    observedMessages.current.clear();
    acknowledgedThrough.current = 0;
    acknowledgedSnapshot.current = null;
    readInFlight.current = null;
    setThread(null);
    setLiveError(false);
    setMessagePages([]);
    setAiStatuses({});
    setAiStatusError(false);
    setMessageCursor(null);
    if (activeTab !== "questions") { setThreadState("ready"); return; }
    if (!selectedThread) { setThreadState("ready"); return; }
    if (!canLoadQuestions) { setThreadState("loading"); return; }
    setThreadState("loading");
    const current = beginPageRequest(pageVersions.current);
    void reads.getThread(selectedThread, undefined, selectedMessage ?? undefined).then(async (result) => {
      const throughSeq = typeof result.readThroughSeq === "number" ? result.readThroughSeq : await getDiscussionReadThrough(selectedThread);
      if (cancelled || version !== threadVersion.current || pageVersion !== messagePageVersion.current || currentThread.current !== selectedThread || !current()) return;
      if (courseId && result.thread.channelId !== courseChannelId) { setThreadState("error"); return; }
      observation.current.through = throughSeq;
      acknowledgedThrough.current = throughSeq;
      setThread(result.thread);
      setThreadPage((old) => ({ ...old, items: old.items.flatMap((item) => item.id === selectedThread ? result.thread.status === "open" ? [result.thread] : [] : [item]) }));
      const history = initialDiscussionMessageCursors(result.messages);
      messagePageCursors.current = history.cursors;
      setMessagePageIndex(history.index);
      setMessagePages([{ cursor: result.messages.startCursor, items: result.messages.items, observationReceipt: result.messages.observationReceipt }]);
      setMessageCursor(result.messages.nextCursor);
      setThreadState("ready");
      if (result.aiStatuses) applyAiStatuses(result.messages.items, result.aiStatuses);
      else void refreshAiStatuses(selectedThread, result.messages.items, () => !cancelled && version === threadVersion.current && pageVersion === messagePageVersion.current && current());
    }).catch(() => { if (!cancelled && version === threadVersion.current && pageVersion === messagePageVersion.current && current()) setThreadState("error"); });
    return () => { cancelled = true; };
  }, [selectedThread, selectedMessage, activeTab, retryThread, courseId, courseChannelId, canLoadQuestions, applyAiStatuses, reads, refreshAiStatuses]);

  usePullToRefreshHandler(activeTab === "questions" ? async () => {
    if (!canLoadQuestions) {
      if (listState === "error") await loadCatalog();
      return;
    }
    const jobs: Promise<unknown>[] = [];
    if (catalogError) jobs.push(loadCatalog());
    const id = currentThread.current;
    if (id && thread?.id === id && !messagePageBusyRef.current) {
      jobs.push(refreshThreadPage(id, messagePagesRef.current[0]?.cursor, { refreshMetadata: false }));
    } else if (id && threadState === "error") {
      setRetryThread(value => value + 1);
    }
    if (!threadPageBusyRef.current) {
      jobs.push(fetchThreadPage(threadPageCursors.current[threadPageIndexRef.current]));
    }
    if (resolvedOpen && resolvedPaging.key === resolvedKey) jobs.push(fetchResolvedPage());
    await Promise.all(jobs);
    signalCounts();
  } : null);

  const hasActiveZyraRequest = useMemo(
    () => Object.values(aiStatuses).some((item) => item.status === "pending" || item.status === "processing"),
    [aiStatuses],
  );

  useEffect(() => {
    if (!selectedThread || activeTab !== "questions" || threadState !== "ready") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const intervalMs = hasActiveZyraRequest ? 4_000 : 60_000;
    const refresh = async () => {
      if (!cancelled && document.visibilityState === "visible" && currentThread.current === selectedThread) {
        try { await refreshThreadPage(selectedThread, messagePagesRef.current.at(-1)?.cursor, { refreshMetadata: false }); }
        catch {
          if (!cancelled) {
            setLiveError(true);
            refreshChannelMetadata();
          }
        }
      }
    };
    const tick = () => {
      timer = setTimeout(async () => {
        await refresh();
        if (!cancelled) tick();
      }, intervalMs);
    };
    const focus = () => { void refresh(); };
    window.addEventListener("focus", focus);
    tick();
    return () => { cancelled = true; clearTimeout(timer); window.removeEventListener("focus", focus); };
  }, [selectedThread, activeTab, threadState, refreshThreadPage, refreshChannelMetadata, hasActiveZyraRequest]);

  useEffect(() => {
    if (!canLoadQuestions || listState !== "ready" || activeTab !== "questions") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      if (document.visibilityState !== "visible" || threadPageBusyRef.current) return;
      if (await refreshQuestionList() && !cancelled) {
        setResolvedRevision(value => value + 1);
        refreshChannelMetadata();
      }
    };
    const tick = () => { timer = setTimeout(() => { void refresh().finally(() => { if (!cancelled) tick(); }); }, 120_000); };
    const focus = () => { void refresh(); };
    window.addEventListener("focus", focus);
    tick();
    return () => { cancelled = true; clearTimeout(timer); window.removeEventListener("focus", focus); };
  }, [activeTab, canLoadQuestions, listState, refreshChannelMetadata, refreshQuestionList]);

  useEffect(() => {
    if (!selectedThread || thread?.id !== selectedThread || activeTab !== "questions" || renderedThreadState !== "ready" || !messagePages[0]) return;
    const root = document.querySelector<HTMLElement>("[data-discussion-workspace]");
    const status = root?.querySelector<HTMLElement>("[data-discussion-status]");
    if (!root || !status) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    let waiting = false;
    let statusVisible = false;
    let visibleIds = new Set<string>();
    let pending: ReturnType<typeof observeDiscussionSnapshot> = null;
    const version = threadVersion.current, selection = selectionVersion.current;
    const current = () => !cancelled && statusVisible && !discussionVisibilityBlocked() && discussionStatusUncovered(status) && version === threadVersion.current && selection === selectionVersion.current && currentThread.current === selectedThread;
    const byId = new Map(messages.map((message) => [message.id, message]));
    const scheduleRead = () => {
      if (timer || waiting || !pending) return;
      timer = setTimeout(async () => {
        timer = undefined;
        if (cancelled || document.visibilityState !== "visible" || !current()) { pending = null; return; }
        if (readInFlight.current) {
          waiting = true;
          try { await readInFlight.current; } catch { /* A later observation can retry. */ }
          waiting = false;
          if (!cancelled) scheduleRead();
          return;
        }
        const snapshot = pending;
        pending = null;
        if (!snapshot || snapshot.key === acknowledgedSnapshot.current) return;
        try {
          let statusAcknowledged = false;
          while (current()) {
            const batch = nextDiscussionReadBatch(observedMessages.current, acknowledgedThrough.current, snapshot.throughSeq, visibleIds);
            if (!batch) break;
            const request = retryDiscussionRead(() => actions.markRead(selectedThread, batch.throughSeq, batch.receipt, batch.items.map(item => item.id)),
              () => current() && batch.items.every(item => visibleIds.has(item.id)));
            readInFlight.current = request;
            try {
              const result = await request;
              if (!current()) return;
              if (batch.receipt === messagePages[0].observationReceipt) statusAcknowledged = true;
              acknowledgedThrough.current = result.throughSeq;
              batch.items.forEach(item => { if (observedMessages.current.get(item.seq) === item) observedMessages.current.delete(item.seq); });
            } finally { if (readInFlight.current === request) readInFlight.current = null; }
          }
          if (!statusAcknowledged && current()) {
            const request = retryDiscussionRead(() => actions.markRead(selectedThread, acknowledgedThrough.current, messagePages[0].observationReceipt, []),
              () => current() && visibleIds.size > 0);
            readInFlight.current = request;
            try { await request; } finally { if (readInFlight.current === request) readInFlight.current = null; }
          }
          if (current()) {
            acknowledgedSnapshot.current = snapshot.key;
            setReadError(false);
            signalCounts();
            void refreshThreadPage(selectedThread, messagePagesRef.current.at(-1)?.cursor, { refreshMetadata: false }).catch(() => {});
          }
        } catch { if (current()) setReadError(true); }
      }, 1500);
    };
    const stopObserving = watchDiscussionVisibility(root, (ids) => {
      statusVisible = ids !== null;
      visibleIds = new Set(ids ?? []);
      if (!current() || !ids) { if (timer) clearTimeout(timer); timer = undefined; pending = null; return; }
      const visibleMessages = ids.flatMap(id => { const message = byId.get(id); return message ? [message] : []; });
      visibleMessages.forEach((message) => observedMessages.current.set(message.seq, {
        id: message.id, seq: message.seq, revision: message.revision, receipt: messagePages[0].observationReceipt,
      }));
      const snapshot = visibleDiscussionReadSnapshot(observation.current, thread.status, visibleMessages, messagePages[0].observationReceipt);
      if (!snapshot) { if (timer) clearTimeout(timer); timer = undefined; pending = null; return; }
      if (snapshot.key === acknowledgedSnapshot.current) return;
      pending = snapshot;
      scheduleRead();
    });
    return () => { cancelled = true; stopObserving(); if (timer) clearTimeout(timer); };
  }, [selectedThread, thread?.id, thread?.status, activeTab, renderedThreadState, messages, messagePages, refreshThreadPage, retryRead]);

  useEffect(() => {
    if (viewer.role !== "admin" || activeTab !== "reports") return;
    let cancelled = false;
    const version = ++reportVersion.current;
    setReportBusy(true); setReportError(false);
    void actions.listReports(reportPageCursors.current[reportPageIndexRef.current]).then((page) => {
      if (cancelled || version !== reportVersion.current) return;
      setReports(page.items); setReportCursor(page.nextCursor);
    }).catch(() => { if (!cancelled && version === reportVersion.current) setReportError(true); })
      .finally(() => { if (!cancelled && version === reportVersion.current) setReportBusy(false); });
    return () => { cancelled = true; };
  }, [activeTab, viewer.role, retryReports]);

  async function changeQuestionPage(direction: "previous" | "next") {
    if (threadPageBusyRef.current) return;
    const index = threadPageIndexRef.current + (direction === "next" ? 1 : -1);
    if (index < 0 || (direction === "next" && !threadPage.nextCursor)) return;
    const cursor = direction === "next" ? threadPage.nextCursor! : threadPageCursors.current[index];
    const version = ++threadPagingVersion.current;
    threadPageBusyRef.current = true;
    setThreadPageBusy(true);
    try {
      if (!await fetchThreadPage(cursor) || version !== threadPagingVersion.current) return;
      if (direction === "next") threadPageCursors.current = [...threadPageCursors.current.slice(0, index), cursor];
      threadPageIndexRef.current = index;
      setThreadPageIndex(index);
    } finally {
      if (version === threadPagingVersion.current) { threadPageBusyRef.current = false; setThreadPageBusy(false); }
    }
  }

  async function moreQuestions() {
    await changeQuestionPage("next");
  }

  async function changeReportPage(direction: "previous" | "next") {
    if (reportBusy) return;
    const index = reportPageIndex + (direction === "next" ? 1 : -1);
    if (index < 0 || (direction === "next" && !reportCursor)) return;
    const cursor = direction === "next" ? reportCursor! : reportPageCursors.current[index];
    const version = ++reportVersion.current;
    setReportBusy(true); setReportError(false);
    try {
      const page = await actions.listReports(cursor);
      if (version !== reportVersion.current) return;
      if (direction === "next") reportPageCursors.current = [...reportPageCursors.current.slice(0, index), cursor];
      reportPageIndexRef.current = index;
      setReports(page.items); setReportCursor(page.nextCursor); setReportPageIndex(index);
    } catch { if (version === reportVersion.current) setReportError(true); }
    finally { if (version === reportVersion.current) setReportBusy(false); }
  }

  async function changeMessagePage(direction: "previous" | "next") {
    if (!selectedThread || messagePageBusyRef.current) return;
    const index = direction === "next" ? messagePageIndex + 1 : messagePageIndex - 1;
    const nextCursor = nextDiscussionMessageCursor(messagePageCursors.current, messagePageIndex, messageCursor);
    if (index < 0 || (direction === "next" && !nextCursor)) return;
    const cursor = direction === "next" ? nextCursor! : messagePageCursors.current[index];
    const version = threadVersion.current;
    const pageVersion = ++messagePageVersion.current;
    pageVersions.current.clear();
    const current = beginPageRequest(pageVersions.current, cursor);
    messagePageBusyRef.current = true;
    setMessagePageBusy(true);
    setMessagePageError(false);
    try {
      const result = await reads.getThread(selectedThread, cursor);
      if (version !== threadVersion.current || pageVersion !== messagePageVersion.current || currentThread.current !== selectedThread || !current()) return;
      if (direction === "next") messagePageCursors.current = [...messagePageCursors.current.slice(0, index), cursor];
      if (index === 0 && result.messages.previousCursor !== undefined) {
        messagePageCursors.current = [result.messages.previousCursor, ...messagePageCursors.current];
        setMessagePageIndex(1);
      } else setMessagePageIndex(index);
      setThread(result.thread);
      setMessagePages([{ cursor, items: result.messages.items, observationReceipt: result.messages.observationReceipt }]);
      setMessageCursor(result.messages.nextCursor);
      if (result.aiStatuses) {
        setAiStatuses(Object.fromEntries(result.aiStatuses.map((item) => [item.messageId, { status: item.status, reason: item.reason }])));
        setAiStatusError(false);
      } else {
        setAiStatuses({});
        void refreshAiStatuses(selectedThread, result.messages.items, () => version === threadVersion.current && pageVersion === messagePageVersion.current && current());
      }
    } catch {
      if (version === threadVersion.current && pageVersion === messagePageVersion.current) setMessagePageError(true);
    } finally {
      if (version === threadVersion.current && pageVersion === messagePageVersion.current) { messagePageBusyRef.current = false; setMessagePageBusy(false); }
    }
  }

  async function refreshMessage(id: string, messageId?: string, retainViewOnError = false) {
    if (currentThread.current !== id) return;
    const page = messageId ? messagePagesRef.current.find((item) => item.items.some((message) => message.id === messageId)) : messagePagesRef.current.at(-1);
    try { return await refreshThreadPage(id, page?.cursor, { refreshMetadata: false }); }
    catch { if (currentThread.current === id && !retainViewOnError) setThreadState("error"); }
    finally { signalCounts(); }
  }
  const toSubmit = (input: Parameters<DiscussionWorkspaceProps["onCreateQuestion"]>[0]) => ({
    body: input.body, attachmentIds: input.attachments.map((item) => item.id), mentionIds: input.mentionIds, mentionHandles: input.mentionHandles,
    askZyra: input.askZyra, skinId: input.skinId, requestId: input.requestId,
  });
  const uiChannels = visibleChannels.map(toUiChannel);
  if (!metadataReady && pinnedChannel && pinnedChannel.id === selectedChannel && !uiChannels.some((item) => item.id === pinnedChannel.id)) uiChannels.push(pinnedChannel);
  const uiMessages = messages.map((message) => {
    const original = message.replyTo ? messagesById.get(message.replyTo.id) : undefined;
    const role = message.author?.role;
    const author: DiscussionPerson = message.kind === "zyra" ? { id: "zyra", name: "Zyra", role: "zyra" }
      : { id: message.author?.id ?? "", name: message.author?.name ?? t("unknownAuthor"), role: (role ?? (message.author?.id === viewer.id ? viewer.role : undefined)) as DiscussionPerson["role"], avatarUrl: message.author?.avatarUrl ?? null };
    return { ...message, author, zyraStatus: aiStatuses[message.id] ?? null, replyTo: message.replyTo ? replyQuote(message.replyTo, original, t("previousMessage")) : null };
  });

  return <div className="space-y-2">
    {(catalogError || metadataFailed) && <div role="alert" className="flex items-center gap-2 text-body-sm">{t("channelMetadataError")}<Button type="button" variant="outline" size="sm" onClick={() => {
      if (catalogError) setRetryLists(value => value + 1);
      if (metadataFailed) refreshChannelMetadata();
    }}>{t("retry")}</Button></div>}
    {listRefreshError && <div role="alert" className="flex items-center gap-2 text-body-sm">{t("listRefreshError")}<Button type="button" variant="outline" size="sm" onClick={() => void fetchThreadPage(threadPageCursors.current[threadPageIndexRef.current]).catch(() => setListRefreshError(true))}>{t("retry")}</Button></div>}
    {thread?.id === selectedThread && liveError && <div role="alert" className="flex items-center gap-2 text-body-sm">{t("threadRefreshError")}<Button type="button" variant="outline" size="sm" onClick={() => { if (selectedThread) void refreshThreadPage(selectedThread, messagePagesRef.current.at(-1)?.cursor).catch(() => setLiveError(true)); }}>{t("retry")}</Button></div>}
    {thread?.id === selectedThread && aiStatusError && <p role="alert" className="text-body-xs text-destructive">{t("ai_statusError")}</p>}
    {sentMessage?.threadId === selectedThread && !messagesById.has(sentMessage.id) && <p role="status" className="text-body-xs text-muted-foreground">{t("sentMessageOtherPage")}</p>}
    {activeTab === "questions" && listState === "ready" && threadPageIndex > 0 && <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={threadPageBusy} onClick={() => void changeQuestionPage("previous").catch(() => setListRefreshError(true))}>{t("previousQuestions")}</Button><span className="text-body-xs text-muted-foreground">{t("page", { page: threadPageIndex + 1 })}</span></div>}
    {thread?.id === selectedThread && (messagePageIndex > 0 || hasNextMessagePage) && <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={messagePageBusy || messagePageIndex === 0} onClick={() => void changeMessagePage("previous")}>{t("previousMessages")}</Button>{!selectedMessage && <span className="text-body-xs text-muted-foreground">{t("page", { page: messagePageIndex + 1 })}</span>}<Button type="button" variant="outline" size="sm" disabled={messagePageBusy || !hasNextMessagePage} onClick={() => void changeMessagePage("next")}>{t("nextMessages")}</Button>{messagePageError && <span role="alert" className="text-body-xs text-destructive">{t("messagePageError")}</span>}</div>}
    <DiscussionWorkspace draftState={draftState} viewer={viewer} channels={uiChannels} questions={orderedThreads.map((item) => toQuestion(item, visibleChannels))}
      resolvedQuestions={(() => {
        const q = search.trim().toLocaleLowerCase();
        const items = !q || debouncedSearch.trim().toLocaleLowerCase() === q
          ? resolvedThreads
          : resolvedThreads.filter((item) => item.title.toLocaleLowerCase().includes(q));
        return items.map((item) => toQuestion(item, visibleChannels));
      })()}
      resolvedOpen={resolvedOpen} resolvedState={resolvedPaging.key === resolvedKey ? resolvedState : "loading"} resolvedPageIndex={resolvedPaging.index} resolvedHasMore={!!resolvedPage.nextCursor} onResolvedOpenChange={setResolvedOpen} onResolvedPage={changeResolvedPage} onRetryResolved={() => setResolvedRevision(value => value + 1)}
      readError={readError} onRetryRead={() => { setReadError(false); setRetryRead(value => value + 1); }}
      selectedQuestion={selectedQuestion} messages={uiMessages} selectedChannelId={selectedChannel} selectedQuestionId={selectedThread} selectedMessageId={selectedMessage}
      search={search} listState={listState} threadState={renderedThreadState}
      reports={viewer.role === "admin" ? reports.map((item) => ({ id: item.id, questionId: item.threadId,
        questionTitle: item.threadTitle, message: item.message,
        messageId: item.messageId, reporterName: item.reporter.name, reason: item.reason, createdAt: item.createdAt, status: item.status })) : undefined}
      reportState={reportBusy ? "loading" : reportError ? "error" : "ready"} onRetryReports={() => setRetryReports((value) => value + 1)}
      activeTab={activeTab}
      hasMoreQuestions={hasMoreQuestions}
      onSelectChannel={(channel) => { setPinnedChannel(channel); navigate({ channel: channel?.id ?? null, thread: null }); }} onSelectQuestion={(id, messageId) => navigate({ thread: id, message: messageId ?? null, discussionTab: null, ...(activeTab === "reports" ? { channel: null } : {}) })}
      onSearchChange={(value) => setSearch(value.slice(0, 160))} onTabChange={(tab) => navigate({ discussionTab: tab === "reports" ? tab : null })}
      onRetryQuestions={() => { setRetryLists((value) => value + 1); refreshChannelMetadata(); }} onRetryMessages={() => { setRetryThread((value) => value + 1); refreshChannelMetadata(); }}
      onLoadMoreQuestions={() => moreQuestions()}
      onSearchChannels={(input) => searchDiscussionChannels(reads, input, courseId)}
      onSearchMentions={(input) => searchDiscussionMentions(actions, input)}
      onSearchForwardTargets={async (input) => {
        const page = await searchDiscussionForwardTargets(reads, input);
        const allowedMap = new Map(visibleChannels.map((item) => [item.id, item]));
        const missingIds = [...new Set(page.items.map((item) => item.channelId).filter((id) => !allowedMap.has(id)))];
        if (missingIds.length) {
          const fetched = await loadDiscussionChannelMetadata(reads, missingIds).catch(() => []);
          for (const item of fetched) allowedMap.set(item.id, item);
        }
        const sourceCh = selectedQuestion ? visibleChannels.find((item) => item.id === selectedQuestion.channelId) : undefined;
        const items = page.items
          .filter((item) => {
            const targetCh = allowedMap.get(item.channelId);
            if (!targetCh) return true;
            if (sourceCh && !canSuggestForwardChannel(toUiChannel(sourceCh), toUiChannel(targetCh))) return false;
            return true;
          })
          .map((item) => {
            const targetCh = allowedMap.get(item.channelId);
            return {
              ...item,
              channelName: targetCh ? discussionChannelLabel(toUiChannel(targetCh), t) : undefined,
            };
          });
        return { ...page, items };
      }}
      onCreateQuestion={async (input) => {
        const version = selectionVersion.current;
        const result = await actions.createThread({ ...toSubmit(input), channelId: input.channelId, ...(input.title ? { title: input.title } : {}) });
        if (!result.ok) return result.error === "replay_unverified" ? { error: result.error, target: result.value } : result.error;
        signalCounts();
        if (version === selectionVersion.current) {
          setRetryLists((value) => value + 1);
          if (courseId && input.channelId !== courseChannelId) {
            selectionVersion.current++;
            currentThread.current = null;
            router.push(discussionPrivateQuestionHref(pathname, input.channelId, result.value.threadId));
          } else {
            navigate({ channel: input.channelId, thread: result.value.threadId });
          }
          if (!input.title?.trim()) scheduleTitleRefresh(result.value.threadId);
        }
      }}
      onSendReply={async (input) => { const submit = { ...toSubmit({ ...input, channelId: thread?.channelId ?? "" }), threadId: input.questionId };
        if (input.messageType === "reply" && !input.replyToMessageId) return "invalid";
        const result = await actions.reply(input.messageType === "reply" ? { ...submit, messageType: "reply", replyTo: input.replyToMessageId! } : { ...submit, messageType: "answer" });
        if (!result.ok) { if (result.error === "resolved") { if (currentThread.current === input.questionId) { setThread(old => old?.id === input.questionId ? { ...old, status: "resolved", canReply: false } : old); setThreadPage(old => ({ ...old, items: old.items.filter(item => item.id !== input.questionId) })); setResolvedRevision(value => value + 1); } await refreshMessage(input.questionId, undefined, true); } return result.error === "replay_unverified" ? { error: result.error, target: result.value } : result.error; }
        const page = await refreshMessage(input.questionId); if (page && currentThread.current === input.questionId) setSentMessage({ threadId: input.questionId, id: result.value.messageId }); }}
      onUploadImage={async ({ channelId, file }) => { const form = new FormData(); form.set("channelId", channelId); form.set("file", file);
        const response = await fetch("/api/discussions/attachments", { method: "POST", body: form });
        if (!response.ok) { const payload = await response.json().catch(() => null); return { ok: false, error: discussionUploadError(payload?.code ?? payload?.error) }; }
        return { ok: true, attachment: await response.json() }; }}
      onEditMessage={async ({ questionId, messageId, body, revision }) => { try { await actions.edit(messageId, body, revision); } catch (error) { await refreshMessage(questionId, messageId, true); throw error; } await refreshMessage(questionId, messageId); }}
      onDeleteMessage={async ({ questionId, messageId }) => { await actions.deleteMessage(messageId); await refreshMessage(questionId, messageId); }}
      onToggleReaction={async ({ questionId, messageId, emoji, selected }) => { await actions.setReaction(messageId, emoji, selected); await refreshMessage(questionId, messageId); }}
      onForwardMessage={async ({ questionId, messageId, targetQuestionId, requestId }) => { try { const result = await actions.forward(messageId, targetQuestionId, requestId); if (!result.ok) return result.error === "replay_unverified" ? { error: result.error, target: result.value } : result.error; await refreshMessage(questionId, messageId); } catch { return "unknown"; } }}
      onReportMessage={async ({ messageId, reason }) => { await actions.report(messageId, reason); }}
      onSetChannelMuted={async ({ channelId, muted }) => { await actions.setMute(channelId, muted); setChannels((old) => old.map((item) => item.id === channelId ? { ...item, muted } : item)); setChannelMetadata((old) => ({ ...old, items: old.items.map((item) => item.id === channelId ? { ...item, muted } : item) })); setPinnedChannel((old) => old?.id === channelId ? { ...old, muted } : old); refreshChannelMetadata(); }}
      onSetQuestionStatus={async ({ questionId, status }) => {
        const result = await actions.setResolved(questionId, status === "resolved");
        if (!mounted.current) return;
        // Reads started before the write may still return the old status.
        listRequests.current.clear();
        resolvedRequests.current.clear();
        if (result.status === "resolved") {
          setThreadPage(old => ({ ...old, items: old.items.filter(item => item.id !== questionId) }));
        } else {
          setResolvedPage(old => ({ ...old, items: old.items.filter(item => item.id !== questionId) }));
        }
        void latestQuestionListRefresh.current();
        setResolvedRevision(value => value + 1);
        if (currentThread.current === questionId) await refreshMessage(questionId);
        else signalCounts();
      }}
      onSetReportStatus={async ({ reportId, status }) => { await actions.resolveReport(reportId, status); setReports((old) => old.filter((item) => item.id !== reportId)); }}
      onLoadAuthorProfile={({ questionId, authorId }) => actions.getAuthorProfile(questionId, authorId)} />
    {activeTab === "reports" && (reportPageIndex > 0 || reportCursor) && <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={reportBusy || reportPageIndex === 0} onClick={() => void changeReportPage("previous")}>{t("previousReports")}</Button><span className="text-body-xs text-muted-foreground">{t("page", { page: reportPageIndex + 1 })}</span><Button type="button" variant="outline" size="sm" disabled={reportBusy || !reportCursor} onClick={() => void changeReportPage("next")}>{t("nextReports")}</Button></div>}
  </div>;
}
