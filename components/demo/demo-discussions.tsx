"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApplicationPage } from "@/components/application-page";
import { DiscussionWorkspace } from "@/components/discussions/discussion-workspace";
import { DiscussionWorkspaceSkeleton } from "@/components/discussions/discussion-skeleton";
import { mentionHandle } from "@/components/discussions/discussion-adapter";
import type { DiscussionChannel, DiscussionDraftInput, DiscussionMessage, DiscussionPerson, DiscussionQuestion, DiscussionWorkspaceProps } from "@/components/discussions/view-model";
import { useStudentSocial } from "@/components/gamification/social-provider";
import { PageHeader } from "@/components/page-header";
import { useStudentExperience } from "@/components/student-experience-provider";
import { demoCourseChannel, demoDiscussionSeed, demoDiscussionViewerId, demoGeneralChannel } from "@/lib/demo/discussion-seed";
import { demoDiscussionKey, emptyDemoDiscussion, maxDemoPosts, readDemoDiscussion, type DemoDiscussionState } from "@/lib/demo/discussion-state";
import { demoPeople } from "@/lib/demo/gamification";
import type { DiscussionSendFailure } from "@/lib/discussions/contracts";
import { deriveInitialDiscussionTitle, DISCUSSION_REACTIONS, validDiscussionText } from "@/lib/discussions/policy";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { useDemoGamification } from "./demo-gamification-provider";

const noRetry = () => {};
const unavailable = async () => { throw new Error("Unavailable"); };
const noForwardTargets = async () => ({ items: [], nextCursor: null });
type Thread = ReturnType<typeof demoDiscussionSeed>[number];
const peerPeople: DiscussionPerson[] = demoPeople.map(person => ({
  id: person.publicId, name: person.displayName, role: "student", mention: mentionHandle(person.publicId, person.displayName),
}));

function readState() {
  return readDemoDiscussion(localStorage.getItem(demoDiscussionKey));
}

function setSelection(channelId: string | null, threadId: string | null, messageId?: string | null) {
  const url = new URL(window.location.href);
  for (const [key, value] of [["channel", channelId], ["thread", threadId], ["message", messageId]] as const) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  window.history.replaceState(null, "", url);
}

export function DemoDiscussions({ courseId }: { courseId?: string }) {
  const t = useTranslations("discussions");
  const { locale } = useAppLocale();
  const experience = useStudentExperience();
  const social = useStudentSocial();
  const { state: rewards } = useDemoGamification();
  const query = useSearchParams();
  const [state, setState] = useState(emptyDemoDiscussion);
  const [ready, setReady] = useState(false);
  const [search, setSearch] = useState("");
  const [resolvedOpen, setResolvedOpen] = useState(false);
  const name = experience.account?.name ?? "Pelajar Demo";
  const skinId = rewards.equipped.zyra_skin;
  const viewer = useMemo<DiscussionPerson>(() => ({ id: demoDiscussionViewerId, name, role: "student", skinId }), [name, skinId]);

  useEffect(() => {
    function sync() {
      try { setState(readState()); } catch { /* Keep the seed visible when storage is unavailable. */ }
      setReady(true);
    }
    function onStorage(event: StorageEvent) {
      if (event.key === demoDiscussionKey || event.key === null) sync();
    }
    sync();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  async function update(change: (current: DemoDiscussionState) => DemoDiscussionState) {
    const save = () => {
      const current = readState();
      const next = change(current);
      if (next !== current) localStorage.setItem(demoDiscussionKey, JSON.stringify(next));
      setState(next);
    };
    if (navigator.locks) await navigator.locks.request(demoDiscussionKey, save);
    else save();
  }

  const courses = experience.courses;
  const asOf = experience.baseline.reduce((latest, row) => row.asOf > latest ? row.asOf : latest, "");
  const seed = useMemo(() => demoDiscussionSeed(courses ?? [], asOf, viewer), [courses, asOf, viewer]);
  const channelMeta: DiscussionChannel[] = [
    ...(courseId ? [] : [{ id: demoGeneralChannel, name: locale === "en" ? "General" : "Umum", kind: "global" as const }]),
    ...(courses ?? []).filter(course => !courseId || course.id === courseId).map(course => ({
      id: demoCourseChannel(course.id), name: course.title, courseTitle: course.title, courseId: course.id, kind: "course" as const,
    })),
  ].map(channel => ({ ...channel, unreadCount: 0, canCreate: true, muted: state.muted.includes(channel.id) }));
  const channelIds = new Set(channelMeta.map(channel => channel.id));
  const threads = useMemo<Thread[]>(() => [
    ...seed,
    ...state.questions.map(item => ({ ...item, resolved: false, unread: 0, messages: [] })),
  ].map(thread => ({
    ...thread,
    resolved: Object.hasOwn(state.status, thread.id) ? state.status[thread.id] : thread.resolved,
    messages: [...thread.messages, ...state.posts.filter(post => post.threadId === thread.id).map(post => ({ ...post, replyTo: post.replyTo, author: viewer, likes: 0 }))],
  })).filter(thread => thread.messages.length > 0), [seed, state, viewer]);

  const questions: DiscussionQuestion[] = threads.filter(thread => channelIds.has(thread.channelId)).map(thread => {
    const answerCount = thread.messages.filter(message => message.messageType === "answer").length;
    return {
      id: thread.id, channelId: thread.channelId, title: thread.title, lastActivityAt: thread.messages.at(-1)!.createdAt,
      status: thread.resolved ? "resolved" : answerCount > 0 ? "answered" : "open", answerCount,
      unreadCount: state.read.includes(thread.id) ? 0 : thread.unread, allowedForwardChannelIds: [],
      canReply: !thread.resolved, canResolve: thread.messages[0].author.id === viewer.id,
    };
  }).sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  const channels = channelMeta.map(channel => ({
    ...channel, unreadCount: questions.filter(item => item.channelId === channel.id && item.unreadCount > 0).length,
  }));
  const requestedChannel = query.get("channel");
  const selectedChannelId = courseId ? demoCourseChannel(courseId) : requestedChannel && channelIds.has(requestedChannel) ? requestedChannel : null;
  const selectedQuestion = questions.find(item => item.id === query.get("thread") && (!selectedChannelId || item.channelId === selectedChannelId)) ?? null;
  const selectedThread = threads.find(thread => thread.id === selectedQuestion?.id);
  const matches = (value: string, term: string) => value.toLocaleLowerCase(locale).includes(term.trim().toLocaleLowerCase(locale));
  const filtered = questions.filter(item => (!selectedChannelId || item.channelId === selectedChannelId) && matches(item.title, search));

  function selectQuestion(id: string | null, messageId?: string | null) {
    setSelection(selectedChannelId, id, messageId);
    if (id && questions.some(item => item.id === id && item.unreadCount > 0)) {
      void update(current => current.read.includes(id) ? current : { ...current, read: [...current.read, id] }).catch(() => {});
    }
  }

  function makePost(input: DiscussionDraftInput) {
    return {
      id: input.requestId, body: input.body.trim(), createdAt: new Date().toISOString(),
      mentions: peerPeople.flatMap(person => {
        const index = input.mentionIds.indexOf(person.id);
        return index < 0 ? [] : [{ id: person.id, mention: input.mentionHandles?.[index] ?? person.mention! }];
      }),
    };
  }

  async function submit(input: DiscussionDraftInput, target: { channelId: string; title?: string } | { questionId: string; messageType: "answer" | "reply"; replyToMessageId?: string }): Promise<DiscussionSendFailure | void> {
    if (!validDiscussionText(input.body, 12_000) || input.attachments.length) return "invalid";
    const creating = "channelId" in target;
    const id = creating ? input.requestId : target.questionId;
    const thread = threads.find(item => item.id === id);
    if (creating ? !channelIds.has(target.channelId) : !thread || !channelIds.has(thread.channelId)) return "unavailable";
    if (!creating && target.messageType === "reply" && !thread?.messages.some(message => message.id === target.replyToMessageId)) return "invalid";
    let failure: DiscussionSendFailure | undefined;
    try {
      await update(current => {
        if (current.posts.some(post => post.id === input.requestId)) return current;
        if (current.posts.length >= maxDemoPosts) { failure = "unavailable"; return current; }
        if (!creating && !seed.some(item => item.id === id) && !current.questions.some(item => item.id === id)) { failure = "unavailable"; return current; }
        if (!creating && (current.status[id] ?? thread?.resolved)) { failure = "resolved"; return current; }
        const post = { ...makePost(input), threadId: id, messageType: creating ? "question" as const : target.messageType, replyTo: creating ? undefined : target.replyToMessageId };
        const questions = creating ? [...current.questions, { id, channelId: target.channelId, title: deriveInitialDiscussionTitle(input.body) }] : current.questions;
        return { ...current, questions, posts: [...current.posts, post] };
      });
    } catch { return "unavailable"; }
    if (failure) return failure;
    if (creating) setSelection(courseId || selectedChannelId ? target.channelId : null, id);
  }

  const loadProfile = useCallback<NonNullable<DiscussionWorkspaceProps["onLoadAuthorProfile"]>>(async ({ questionId, authorId }) => {
    const thread = threads.find(item => item.id === questionId);
    const mentioned = state.posts.some(post => post.threadId === questionId && post.mentions.some(item => item.id === authorId));
    const author = thread?.messages.find(message => message.author.id === authorId)?.author
      ?? (mentioned ? peerPeople.find(person => person.id === authorId) : undefined);
    if (!author) throw new Error("Unavailable");
    const profile = author.role === "student" ? await social.profile(authorId) : null;
    if (profile) return { kind: "student", name: author.name, role: "student", profile };
    return { kind: "limited", id: authorId, name: author.name, role: author.role === "zyra" ? null : author.role,
      avatarUrl: author.avatarUrl ?? null, visibilityReason: author.role === "student" ? "private" : "staff" };
  }, [threads, state.posts, social]);

  const messages: DiscussionMessage[] = selectedThread?.messages.map((post, index, posts) => {
    const reply = post.replyTo ? posts.find(item => item.id === post.replyTo) : undefined;
    const mentions = state.posts.find(item => item.id === post.id)?.mentions ?? [];
    return {
      id: post.id, author: post.author, body: post.body, createdAt: post.createdAt, messageType: post.messageType,
      seq: index + 1, revision: 1, attachments: [],
      replyTo: reply && { id: reply.id, authorName: reply.author.name, excerpt: reply.body },
      reactions: DISCUSSION_REACTIONS.flatMap(emoji => {
        const selected = state.reactions.some(item => item.messageId === post.id && item.emoji === emoji);
        const count = Number(selected) + (emoji === "👍" ? post.likes : 0);
        return count ? [{ emoji, count, selected }] : [];
      }),
      mentionedPeople: mentions.flatMap(mention => peerPeople.filter(person => person.id === mention.id).map(person => ({ ...person, ...mention }))),
      canEdit: false, canDelete: false, canReport: false, canForward: false, canReply: !selectedThread.resolved,
    };
  }) ?? [];

  return <ApplicationPage data-discussion-page spacing="space-y-2" className="pb-2 pt-2 sm:pb-3 sm:pt-3">
    <PageHeader title={t("title")} backHref={courseId ? experience.href?.(`/courses/${encodeURIComponent(courseId)}`) : undefined} className="mb-2" />
    {!ready ? <DiscussionWorkspaceSkeleton label={t("loadingThread")} /> : <DiscussionWorkspace
      viewer={viewer} channels={channels} questions={filtered.filter(item => item.status !== "resolved")}
      resolvedQuestions={resolvedOpen ? filtered.filter(item => item.status === "resolved") : []} resolvedOpen={resolvedOpen} onResolvedOpenChange={setResolvedOpen}
      selectedQuestion={selectedQuestion} selectedChannelId={selectedChannelId} selectedQuestionId={selectedQuestion?.id ?? null}
      selectedMessageId={query.get("message")} messages={messages} search={search} onSearchChange={setSearch}
      listState="ready" threadState="ready" onRetryQuestions={noRetry} onRetryMessages={noRetry}
      onSelectChannel={channel => setSelection(channel?.id ?? null, null)} onSelectQuestion={selectQuestion}
      composerAudience={locale === "en" ? "Text posts stay in this browser." : "Kiriman teks tersimpan di browser ini."} canAskZyra={false}
      onSearchChannels={async ({ search: term, kind, kinds, courseId: filterCourse }) => ({
        items: channels.filter(channel => channel.kind !== "private" && (!kind || kind === channel.kind) && (!kinds || kinds.includes(channel.kind)) && (!filterCourse || channel.courseId === filterCourse) && matches(channel.name, term)),
        nextCursor: null,
      })}
      onSearchMentions={async ({ query: term }) => peerPeople.filter(person => matches(person.name, term)).map(person => ({ id: person.id, name: person.name, role: "student", mention: person.mention! }))}
      onCreateQuestion={input => submit(input, input)} onSendReply={input => submit(input, input)}
      onSetChannelMuted={({ channelId, muted }) => update(current => ({
        ...current, muted: muted ? [...new Set([...current.muted, channelId])] : current.muted.filter(id => id !== channelId),
      }))}
      onSetQuestionStatus={({ questionId, status }) => update(current => ({ ...current, status: { ...current.status, [questionId]: status === "resolved" } }))}
      onToggleReaction={({ messageId, selected, emoji }) => update(current => {
        const supported = DISCUSSION_REACTIONS.find(value => value === emoji);
        if (!supported) return current;
        const reactions = current.reactions.filter(item => item.messageId !== messageId || item.emoji !== supported);
        return { ...current, reactions: selected ? [...reactions, { messageId, emoji: supported }] : reactions };
      })}
      onSearchForwardTargets={noForwardTargets} onEditMessage={unavailable} onDeleteMessage={unavailable}
      onForwardMessage={unavailable} onReportMessage={unavailable} onLoadAuthorProfile={loadProfile}
    />}
  </ApplicationPage>;
}
