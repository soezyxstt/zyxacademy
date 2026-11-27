import type { TutorDiscussionDetail, TutorDiscussionList, TutorDiscussThread } from "../../../../../packages/academic/tutor-support";
import type { ReadPage } from "../../discussions/read-batches";

export const tutorDiscussionWindowPages = 4;
export type TutorListWindow = { start?: string; pages: TutorDiscussionList[] };
type ThreadLocator = { cursor?: string; target?: string };
type ThreadPage = { locator: ThreadLocator; result: TutorDiscussionDetail };
export type TutorThreadWindow = { thread: TutorDiscussThread; pages: ThreadPage[]; patches: TutorDiscussionDetail[] };
type FetchList = (cursor: string | undefined, signal: AbortSignal) => Promise<TutorDiscussionList>;
type FetchThread = (locator: ThreadLocator, signal: AbortSignal) => Promise<TutorDiscussionDetail>;

export function tutorListView(window: TutorListWindow) {
  const items = new Map<string, TutorDiscussThread>();
  for (const page of window.pages) for (const thread of page.items) if (!items.has(thread.id)) items.set(thread.id, thread);
  return { items: [...items.values()], nextCursor: window.pages.at(-1)?.nextCursor ?? null };
}

export function appendTutorList(window: TutorListWindow, cursor: string, next: TutorDiscussionList): TutorListWindow {
  return window.pages.length >= tutorDiscussionWindowPages ? { start: cursor, pages: [next] }
    : { ...window, pages: [...window.pages, next] };
}

export async function refreshTutorList(window: TutorListWindow, read: FetchList, signal: AbortSignal): Promise<TutorListWindow> {
  const pages: TutorDiscussionList[] = [];
  const seen = new Set<string | undefined>();
  let cursor = window.start;
  for (let index = 0; index < Math.min(window.pages.length, tutorDiscussionWindowPages); index++) {
    if (signal.aborted) throw new Error("Discussion refresh cancelled.");
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const result = await read(cursor, signal);
    if (signal.aborted) throw new Error("Discussion refresh cancelled.");
    pages.push(result);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return { start: window.start, pages };
}

export function initialTutorThread(result: TutorDiscussionDetail, locator: ThreadLocator): TutorThreadWindow {
  return { thread: result.thread, pages: [segment(result, locator)], patches: [] };
}

function segment(result: TutorDiscussionDetail, locator: ThreadLocator): ThreadPage {
  const start = result.messages.startCursor;
  return { locator: start ? { cursor: start } : locator, result };
}

export function extendTutorThread(window: TutorThreadWindow, cursor: string, next: TutorDiscussionDetail, earlier: boolean): TutorThreadWindow {
  const page = segment(next, { cursor });
  const pages = earlier ? [page, ...window.pages].slice(0, tutorDiscussionWindowPages)
    : [...window.pages, page].slice(-tutorDiscussionWindowPages);
  const refreshed = new Set(next.messages.items.map(message => message.id));
  const patches = window.patches.map(patch => ({ ...patch, messages: {
    ...patch.messages, items: patch.messages.items.filter(message => !refreshed.has(message.id)),
  } })).filter(patch => patch.messages.items.length > 0);
  return { thread: next.thread, pages, patches };
}

export function readbackTutorThread(window: TutorThreadWindow | undefined, result: TutorDiscussionDetail, target?: string): TutorThreadWindow {
  if (!window || (target && !window.pages.some(({ result }) => result.messages.items.some(message => message.id === target)))) {
    return initialTutorThread(result, { target });
  }
  // Keep a fresh signed receipt for the rows actually included in this readback.
  return { ...window, thread: result.thread, patches: [...window.patches, result].slice(-tutorDiscussionWindowPages) };
}

export async function refreshTutorThread(window: TutorThreadWindow, read: FetchThread, signal: AbortSignal): Promise<TutorThreadWindow> {
  const first = window.pages[0];
  const last = window.pages.at(-1);
  const size = Math.min(window.pages.length + (last?.result.messages.nextCursor === null ? 1 : 0), tutorDiscussionWindowPages);
  const pages: ThreadPage[] = [];
  const seen = new Set<string | undefined>();
  let locator = first.locator;
  for (let index = 0; index < size; index++) {
    if (signal.aborted) throw new Error("Discussion refresh cancelled.");
    if (seen.has(locator.cursor)) break;
    seen.add(locator.cursor);
    const result = await read(locator, signal);
    if (signal.aborted) throw new Error("Discussion refresh cancelled.");
    pages.push(segment(result, locator));
    if (!result.messages.nextCursor) break;
    locator = { cursor: result.messages.nextCursor };
  }
  return { thread: pages.at(-1)?.result.thread ?? window.thread, pages, patches: [] };
}

export function tutorThreadView(window: TutorThreadWindow): TutorDiscussionDetail & { readPages: ReadPage[] } {
  const head = window.pages[0].result;
  const tail = window.pages.at(-1)!.result;
  const { thread } = window;
  type Message = TutorDiscussionDetail["messages"]["items"][number];
  const messages = new Map<string, Message>();
  const statuses = new Map<string, NonNullable<TutorDiscussionDetail["aiStatuses"]>[number]>();
  const receiptPages = new Map<string, ReadPage>();
  const owningReceipt = new Map<string, string>();
  for (const [index, result] of [...window.pages.map(page => page.result), ...window.patches].entries()) {
    const isPatch = index >= window.pages.length;
    const verified = new Map(result.observed?.items.map(item => [item.id, item.seq]));
    if (result.observed) receiptPages.set(result.observed.receipt, { ...result.observed, status: result.thread.status, items: [] });
    const applied = new Set<string>();
    for (const message of result.messages.items) {
      if (isPatch && !messages.has(message.id)) continue;
      messages.set(message.id, message);
      applied.add(message.id);
      statuses.delete(message.id);
      if (result.observed && verified.get(message.id) === message.seq) owningReceipt.set(message.id, result.observed.receipt);
      else owningReceipt.delete(message.id);
    }
    for (const status of result.aiStatuses ?? []) if (applied.has(status.messageId)) statuses.set(status.messageId, status);
  }
  for (const message of messages.values()) {
    const receipt = owningReceipt.get(message.id);
    if (receipt) receiptPages.get(receipt)?.items.push({ id: message.id, seq: message.seq, revision: message.revision });
  }
  return {
    thread, aiStatuses: [...statuses.values()], readPages: [...receiptPages.values()].filter(page => page.status === thread.status && page.items.length > 0),
    messages: { items: [...messages.values()].sort((a, b) => a.seq - b.seq), nextCursor: tail.messages.nextCursor, previousCursor: head.messages.previousCursor },
  };
}
