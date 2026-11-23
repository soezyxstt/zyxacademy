import type { DiscussionChannel, DiscussionChannelMetadata, DiscussionPage, DiscussionMessage, DiscussionThread } from "@/lib/discussions/contracts";
import type { DiscussionChannel as UiChannel, DiscussionQuestion, DiscussionUploadError, DiscussionWorkspaceProps } from "./view-model";

type Actions = typeof import("@/lib/discussions/actions");

type ChannelReads = {
  getChannelsByIds: (...args: Parameters<Actions["getChannelsByIds"]>) => Promise<DiscussionChannelMetadata[]>;
  listChannelsPage: (...args: Parameters<Actions["listChannelsPage"]>) => Promise<DiscussionPage<DiscussionChannelMetadata>>;
};

export function discussionWorkspaceReads(viewerId: string): ChannelReads & Pick<Actions, "getThread" | "listThreadsAcrossChannels"> {
  async function read<T>(view: string, input: Record<string, string | string[] | undefined>, method = "GET"): Promise<T> {
    const params = new URLSearchParams({ view });
    for (const [key, value] of Object.entries(input)) {
      if (Array.isArray(value)) value.forEach(item => params.append(key, item));
      else if (value !== undefined) params.set(key, value);
    }
    const response = await fetch(`/api/discussions/workspace?${params}`, {
      method, cache: "no-store", headers: { "x-student-id": viewerId },
    });
    if (!response.ok) throw new Error("Discussion workspace request failed");
    return response.json();
  }
  return {
    getThread: (threadId, cursor, messageId) => read("thread", { threadId, cursor, messageId }, "POST"),
    getChannelsByIds: (channelId) => read("channels", { channelId }),
    listChannelsPage: ({ courseId, cursor, search, kind, kinds } = {}) =>
      read("catalog", { courseId, cursor, search, kind, kindFilter: kinds?.join(",") }, "POST"),
    listThreadsAcrossChannels: (input = {}) => read("threads", typeof input === "string" ? { cursor: input } : input),
  };
}

export function discussionViewerState(viewerId: string, sessionId: string | null | undefined, pending: boolean) {
  if (sessionId === viewerId) return "ready";
  return pending && !sessionId ? "loading" : "changed";
}

export function mergeById<T extends { id: string }>(oldItems: T[], newItems: T[]) {
  const items = new Map(oldItems.map((item) => [item.id, item]));
  newItems.forEach((item) => items.set(item.id, item));
  return [...items.values()];
}

export function channelIdBatches(ids: string[]) {
  const unique = [...new Set(ids)];
  const batches: string[][] = [];
  for (let index = 0; index < unique.length; index += 31) batches.push(unique.slice(index, index + 31));
  return batches;
}

export async function loadDiscussionChannelMetadata<T extends DiscussionChannelMetadata>(actions: { getChannelsByIds: (ids: string[]) => Promise<T[]> }, ids: string[]) {
  return (await Promise.all(channelIdBatches(ids).map((batch) => actions.getChannelsByIds(batch)))).flat();
}

export async function searchDiscussionChannels(actions: Pick<ChannelReads, "listChannelsPage">, input: Parameters<DiscussionWorkspaceProps["onSearchChannels"]>[0], fixedCourseId?: string) {
  const courseId = fixedCourseId ?? input.courseId;
  const kind = courseId ? "course" : input.kind;
  const page = await actions.listChannelsPage({ search: input.search || undefined, cursor: input.cursor, courseId, kind, ...(kind || !input.kinds ? {} : { kinds: input.kinds }), limit: 20 });
  return { ...page, items: page.items.map(toUiChannel) };
}

export function discussionPrivateQuestionHref(pathname: string, channelId: string, threadId: string) {
  const base = pathname.startsWith("/tutor/") ? "/tutor/discussions" : "/dashboard/discussions";
  return `${base}?${new URLSearchParams({ channel: channelId, thread: threadId })}`;
}

export function discussionMessageHref(target: { threadId: string; messageId: string }) {
  return `/discussions?${new URLSearchParams({ thread: target.threadId, message: target.messageId })}`;
}

export async function searchDiscussionMentions(actions: Pick<Actions, "searchMentions" | "searchChannelMentions">, input: Parameters<DiscussionWorkspaceProps["onSearchMentions"]>[0]) {
  const people = await (input.questionId ? actions.searchMentions(input.questionId, input.query) : actions.searchChannelMentions(input.channelId, input.query));
  return people.map((person) => ({ ...person, mention: mentionHandle(person.id, person.name) }));
}

export function listDiscussionQuestionPage(actions: Pick<Actions, "listThreadsAcrossChannels">, input: { channelId?: string; search: string; cursor?: string; status: "open" | "resolved" }) {
  return actions.listThreadsAcrossChannels({ channelId: input.channelId, search: input.search.trim() || undefined, cursor: input.cursor, status: input.status });
}

export async function searchDiscussionForwardTargets(actions: Pick<Actions, "listThreadsAcrossChannels">, input: Parameters<DiscussionWorkspaceProps["onSearchForwardTargets"]>[0]) {
  const page = await actions.listThreadsAcrossChannels({ channelId: input.channelId, search: input.search || undefined, cursor: input.cursor, status: "open" });
  return { ...page, items: page.items.map((item) => ({ questionId: item.id, channelId: item.channelId, title: item.title })) };
}

export function discussionUploadError(message: unknown): DiscussionUploadError {
  switch (message) {
    case "pixels": case "size": case "format": case "rate_limited": case "login": case "access": return message;
    case "Dimensi gambar maksimal 4096 piksel per sisi dan 16 juta piksel.": return "pixels";
    case "Ukuran gambar maksimal 8 MiB.": return "size";
    case "Gunakan gambar JPEG, PNG, atau WebP yang valid dan tidak bergerak.": return "format";
    case "Terlalu banyak gambar. Coba lagi nanti.": return "rate_limited";
    case "Masuk untuk mengunggah gambar.": return "login";
    case "Gambar tidak dapat diunggah. Periksa akses dan coba lagi.": return "access";
    default: return "unknown";
  }
}

export function toUiChannel(channel: DiscussionChannelMetadata & Partial<Pick<DiscussionChannel, "unreadThreads">>): UiChannel {
  const common = { id: channel.id, name: channel.title, courseId: channel.courseId, courseTitle: channel.courseTitle, requesterName: channel.requesterName, isRequester: channel.isRequester, ...(channel.unreadThreads !== undefined ? { unreadCount: channel.unreadThreads } : {}), muted: channel.muted, canCreate: true };
  return channel.kind === "academic" || channel.kind === "technical"
    ? { ...common, kind: "private", privateKind: channel.kind === "academic" ? "academic" : "bug",
      privacyLabel: channel.kind === "academic" ? (channel.courseId ? "Hanya Anda, tutor pengampu, dan admin." : "Hanya Anda, semua tutor, dan admin.") : "Hanya Anda dan admin." }
    : { ...common, kind: channel.kind };
}

export function canSuggestForwardChannel(source: UiChannel, target: UiChannel) {
  if (source.kind === "private" || target.kind === "private") return false;
  if (source.kind === "global") return true;
  return target.kind === "course" && (target.id === source.id || (!!source.courseId && target.courseId === source.courseId));
}

export function channelOptionIndex(key: string, current: number, count: number) {
  if (!count || !["ArrowDown", "ArrowUp", "Home", "End"].includes(key)) return null;
  return key === "Home" ? 0 : key === "End" ? count - 1 : Math.max(0, Math.min(count - 1, current + (key === "ArrowDown" ? 1 : -1)));
}

export function mentionHandle(_id: string, name = "Anggota") {
  const label = name.trim().replace(/\s+/g, "_").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 32) || "Anggota";
  return label.toLowerCase() === "zyra" ? "Anggota_Zyra" : label;
}

export function advanceObserved(seen: Set<number>, through: number) {
  while (seen.delete(through + 1)) through++;
  return through;
}

export function discussionVisibilityBlocked() {
  return document.visibilityState !== "visible" || !!document.querySelector('[data-slot="dialog-overlay"], [role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]');
}

export function discussionStatusUncovered(status: HTMLElement) {
  const box = status.getBoundingClientRect();
  if (!box.width || !box.height || box.left < 0 || box.top < 0 || box.right > window.innerWidth || box.bottom > window.innerHeight) return false;
  return [[0.5, 0.25], [0.5, 0.5], [0.5, 0.75], [0.25, 0.5], [0.75, 0.5]].every(([x, y]) => {
    const top = document.elementFromPoint(box.left + box.width * x, box.top + box.height * y);
    return !!top && (top === status || status.contains(top));
  });
}

export function discussionContentUncovered(content: HTMLElement) {
  const box = content.getBoundingClientRect();
  let left = Math.max(0, box.left), top = Math.max(0, box.top);
  let right = Math.min(window.innerWidth, box.right), bottom = Math.min(window.innerHeight, box.bottom);
  const requiredWidth = Math.min(80, box.width / 2), requiredHeight = Math.min(64, box.height / 2);
  if (!box.width || !box.height || right - left < requiredWidth || bottom - top < requiredHeight) return false;
  for (let parent = content.parentElement; parent; parent = parent.parentElement) {
    const style = window.getComputedStyle(parent), clip = parent.getBoundingClientRect();
    if (/^(auto|scroll|hidden|clip)$/.test(style.overflowX)) { left = Math.max(left, clip.left); right = Math.min(right, clip.right); }
    if (/^(auto|scroll|hidden|clip)$/.test(style.overflowY)) { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom); }
    if (right - left < requiredWidth || bottom - top < requiredHeight) return false;
  }
  const width = right - left, height = bottom - top;
  return [[0.5, 0.25], [0.5, 0.5], [0.5, 0.75], [0.25, 0.5], [0.75, 0.5]].every(([x, y]) => {
    const hit = document.elementFromPoint(left + width * x, top + height * y);
    return !!hit && (hit === content || content.contains(hit));
  });
}

export function watchDiscussionVisibility(root: ParentNode, notify: (ids: string[] | null) => void) {
  const status = root.querySelector<HTMLElement>("[data-discussion-status]");
  if (!status || typeof IntersectionObserver === "undefined") { notify(null); return () => {}; }
  const contents = Array.from(root.querySelectorAll<HTMLElement>("[data-discussion-content]"));
  const seen = new Set<HTMLElement>();
  const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  let last = "";
  let stopped = false;
  const ready = () => !discussionVisibilityBlocked() && discussionStatusUncovered(status);
  const refresh = () => {
    if (stopped) return;
    const available = ready();
    for (const content of contents) {
      if (!available || !discussionContentUncovered(content)) {
        const timer = timers.get(content);
        if (timer) clearTimeout(timer);
        timers.delete(content);
        seen.delete(content);
      } else if (!seen.has(content) && !timers.has(content)) {
        timers.set(content, setTimeout(() => {
          timers.delete(content);
          if (!stopped && ready() && discussionContentUncovered(content)) seen.add(content);
          refresh();
        }, 600));
      }
    }
    const ids = available ? [...seen].flatMap(content => {
      const id = content.closest<HTMLElement>("[data-message-id]")?.dataset.messageId;
      return id ? [id] : [];
    }) : null;
    const next = JSON.stringify(ids);
    if (next !== last) { last = next; notify(ids); }
  };
  const observer = new IntersectionObserver(refresh, { threshold: [0, 0.25, 0.5, 1] });
  observer.observe(status);
  contents.forEach(content => observer.observe(content));
  const mutations = new MutationObserver(refresh);
  mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state", "aria-modal"] });
  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("scroll", refresh, true);
  window.addEventListener("resize", refresh);
  refresh();
  return () => { stopped = true; timers.forEach(clearTimeout); observer.disconnect(); mutations.disconnect(); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("scroll", refresh, true); window.removeEventListener("resize", refresh); };
}

export function observeDiscussionSnapshot(state: { seen: Set<number>; through: number; versions: Map<string, number> }, visible: boolean, status: DiscussionThread["status"], messages: Pick<DiscussionMessage, "id" | "seq" | "revision">[]) {
  if (!visible || !messages.length) return null;
  for (const message of messages) {
    if (message.seq > state.through) state.seen.add(message.seq);
    state.versions.set(message.id, message.revision);
  }
  state.through = advanceObserved(state.seen, state.through);
  if (!messages.some((message) => message.seq <= state.through)) return null;
  return { throughSeq: state.through, key: JSON.stringify([state.through, status, [...state.versions].sort(([a], [b]) => a.localeCompare(b))]) };
}

export function visibleDiscussionReadSnapshot(state: { seen: Set<number>; through: number; versions: Map<string, number> }, status: DiscussionThread["status"], messages: Pick<DiscussionMessage, "id" | "seq" | "revision">[], receipt: string) {
  if (!messages.length) return null;
  const snapshot = observeDiscussionSnapshot(state, true, status, messages) ?? { throughSeq: state.through, key: `status:${status}` };
  return { ...snapshot, key: `${snapshot.key}:${receipt}:${JSON.stringify(messages.map(message => [message.id, message.revision]))}` };
}

export function initialDiscussionMessageCursors(page: { startCursor?: string; previousCursor?: string }) {
  if (!page.startCursor) return { cursors: [undefined], index: 0 };
  return page.previousCursor === undefined
    ? { cursors: [page.startCursor], index: 0 }
    : { cursors: [page.previousCursor, page.startCursor], index: 1 };
}

export function nextDiscussionMessageCursor(cursors: Array<string | undefined>, index: number, nextCursor: string | null) {
  return cursors[index + 1] ?? nextCursor;
}

export function beginPageRequest(versions: Map<string, symbol>, cursor?: string) {
  const key = cursor ?? "";
  const version = Symbol();
  versions.set(key, version);
  return () => versions.get(key) === version;
}

export function beginChannelMetadataRequest(version: { current: number }, key: { current: string }) {
  const requestVersion = ++version.current, requestKey = key.current;
  return () => requestVersion === version.current && requestKey === key.current;
}

export function aiStatusKey(status: string, reason?: string | null) {
  if (status === "pending") return "ai_pending";
  if (status === "processing") return "ai_processing";
  if (status === "completed") return "ai_completed";
  if (status !== "failed" && status !== "uncertain") return null;
  switch (reason) {
    case "ai_freeTextOnly": case "ai_imageLimit": case "ai_imageDisabled": case "ai_imageUnavailable":
    case "ai_requestTooLarge": case "ai_assessmentActive": case "ai_quota": case "ai_sourceChanged": case "ai_uncertain": return reason;
    default: return status === "uncertain" ? "ai_uncertain" : "ai_failed";
  }
}

export function zyraStatusReaction(status: string, reason?: string | null): {
  emoji: "👀" | "👍" | null;
  key: NonNullable<ReturnType<typeof aiStatusKey>>;
  tone: "active" | "completed" | "error";
} | null {
  const key = aiStatusKey(status, reason);
  if (!key) return null;
  if (status === "pending" || status === "processing") {
    return { emoji: "👀", key, tone: "active" };
  }
  if (status === "completed") {
    return { emoji: "👍", key, tone: "completed" };
  }
  return { emoji: null, key, tone: "error" };
}

export function replyQuote(reply: NonNullable<DiscussionMessage["replyTo"]>, original?: DiscussionMessage, fallback = "Pesan sebelumnya") {
  return { id: reply.id,
    authorName: reply.authorName ?? (original?.kind === "zyra" ? "Zyra" : original?.author?.name ?? fallback),
    excerpt: reply.excerpt ?? (original?.body?.slice(0, 180) || fallback),
    ...(reply.authorKind ? { authorKind: reply.authorKind } : {}),
    ...(reply.excerptKind ? { excerptKind: reply.excerptKind } : {}) };
}

export function toQuestion(item: DiscussionThread, channels: DiscussionChannelMetadata[]): DiscussionQuestion {
  const source = channels.find((channel) => channel.id === item.channelId);
  const allowed = source?.kind === "global" ? channels.filter((channel) => channel.kind === "global" || channel.kind === "course")
    : source?.kind === "course" ? channels.filter((channel) => channel.kind === "course" && (channel.id === source.id || (source.courseId !== null && channel.courseId === source.courseId)))
    : [];
  return { id: item.id, channelId: item.channelId, title: item.title,
    status: item.status === "resolved" ? "resolved" : item.answerCount ? "answered" : "open",
    helpKind: item.helpKind,
    lastActivityAt: item.lastActivityAt, unreadCount: item.unreadCount, answerCount: item.answerCount,
    allowedForwardChannelIds: allowed.map((channel) => channel.id), canReply: item.canReply, canResolve: item.canResolve };
}

export async function retryDiscussionRead<T>(send: () => Promise<T>, remainsVisible: () => boolean): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await send(); }
    catch (error) {
      if (attempt >= 2 || !remainsVisible()) throw error;
      await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
      if (!remainsVisible()) throw error;
    }
  }
}
