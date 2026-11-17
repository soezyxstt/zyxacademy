"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "@/lib/i18n/client";
import Image from "next/image";
import { Download, ImageOff, MessageSquareText } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deriveInitialDiscussionTitle } from "@/lib/discussions/policy";
import { DiscussionWorkspace, type DiscussionDraftState } from "./discussion-workspace";
import { DiscussionSessionGuard } from "./discussion-session-guard";
import { discussionStatusUncovered, discussionVisibilityBlocked, initialDiscussionMessageCursors, mentionHandle, nextDiscussionMessageCursor, retryDiscussionRead, visibleDiscussionReadSnapshot, watchDiscussionVisibility } from "./discussion-adapter";
import { DiscussionAttachment as PrivateAttachment } from "./discussion-attachment";
import { discussionChannelLabel } from "./discussion-message";
import type { DiscussionAttachment, DiscussionChannel, DiscussionMessage, DiscussionPerson, DiscussionQuestion, DiscussionReport } from "./view-model";

const FIXTURE_IMAGE = "/visual-fixtures/discussion-problem.png";

function FixtureAttachment({ attachment, fail = false, privateRoute = false, onOpen }: { attachment: DiscussionAttachment; fail?: boolean; privateRoute?: boolean; onOpen?: () => void }) {
  const t = useTranslations("discussions");
  const [failed, setFailed] = useState(fail);
  const alt = attachment.alt || attachment.name;
  if (privateRoute) return <PrivateAttachment attachment={{ ...attachment, name: `${"pembahasan-limit-fungsi-".repeat(5)}.png`, previewAvailable: attachment.previewAvailable, url: `/api/discussions/attachments/${attachment.id}` }} />;
  if ((attachment.url !== FIXTURE_IMAGE && !attachment.url.startsWith("blob:")) || failed) return <div role="status" className="flex min-h-24 items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-body-xs text-muted-foreground"><ImageOff className="size-4 shrink-0" aria-hidden="true" />{t("imageUnavailable")}</div>;
  return <Dialog onOpenChange={(open) => { if (open) onOpen?.(); }}>
    <DialogTrigger asChild><button type="button" aria-label={t("enlargeImage", { name: alt })} className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Image src={attachment.url} alt={alt} fill sizes="(max-width: 640px) 45vw, 240px" unoptimized className="object-cover" onError={() => setFailed(true)} /></button></DialogTrigger>
    <DialogContent aria-describedby={undefined} className="flex max-h-[calc(100dvh-2rem)] max-w-4xl flex-col gap-3 overflow-hidden p-4 sm:p-5">
      <DialogHeader className="max-h-24 shrink-0 overflow-y-auto"><DialogTitle className="break-all">{attachment.name}</DialogTitle></DialogHeader>
      <div className="flex min-h-0 items-center justify-center overflow-auto rounded-lg bg-muted/40"><Image src={attachment.url} alt={alt} width={attachment.width || 1200} height={attachment.height || 800} sizes="90vw" unoptimized className="max-h-[70dvh] w-auto max-w-full object-contain" onError={() => setFailed(true)} /></div>
      <div className="shrink-0"><Button asChild variant="outline" size="sm"><a href={attachment.url} download={attachment.name}><Download aria-hidden="true" />{t("download")}</a></Button></div>
    </DialogContent>
  </Dialog>;
}

const PEOPLE: Record<"student" | "tutor" | "admin" | "zyra", DiscussionPerson> = {
  student: { id: "nadia", name: "Nadia Putri", role: "student", mention: "nadia", skinId: "zyra-skin-samudra" },
  tutor: { id: "raka", name: "Raka Pratama", role: "tutor", mention: "raka", skinId: "zyra-skin-lontar" },
  admin: { id: "dina", name: "Dina Sari", role: "admin", mention: "dina" },
  zyra: { id: "zyra", name: "Zyra", role: "zyra" },
};

const INITIAL_CHANNELS: DiscussionChannel[] = [
  { id: "global", name: "Umum", kind: "global", unreadCount: 1, muted: false, canCreate: true },
  { id: "math", name: "Matematika I", kind: "course", courseId: "math", unreadCount: 2, muted: false, canCreate: true },
  { id: "physics", name: "Fisika I", kind: "course", courseId: "physics", unreadCount: 0, muted: true, canCreate: true },
];

const INITIAL_QUESTIONS: DiscussionQuestion[] = [
  { id: "limit", channelId: "math", title: "Mengapa limit ini perlu difaktorkan?", status: "answered", lastActivityAt: "2026-11-15T09:20:00Z", unreadCount: 2, answerCount: 1, allowedForwardChannelIds: ["math"], canReply: true, canResolve: true },
  { id: "function", channelId: "math", title: "Cara membaca domain dari grafik fungsi", status: "open", lastActivityAt: "2026-11-15T07:00:00Z", unreadCount: 1, answerCount: 0, allowedForwardChannelIds: ["math"], canReply: true, canResolve: true },
  { id: "study", channelId: "global", title: "Bagaimana membagi waktu latihan menjelang ujian?", status: "open", lastActivityAt: "2026-11-14T10:10:00Z", unreadCount: 1, answerCount: 0, allowedForwardChannelIds: ["global", "math", "physics"], canReply: true, canResolve: true },
  { id: "motion", channelId: "physics", title: "Menentukan arah percepatan pada bidang miring", status: "resolved", lastActivityAt: "2026-11-13T08:30:00Z", unreadCount: 0, answerCount: 0, allowedForwardChannelIds: ["physics"], canReply: false, canResolve: true },
];

type FixtureMessage = Omit<DiscussionMessage, "canEdit" | "canDelete" | "canReport" | "revision"> & { revision?: number };

const INITIAL_MESSAGES: Record<string, FixtureMessage[]> = {
  limit: [
    { id: "m1", author: PEOPLE.student, body: "Saat $x$ mendekati 2, mengapa kita tidak langsung memasukkan nilainya ke pecahan ini?\n\n$$\\frac{x^2-4}{x-2}$$", createdAt: "2026-11-15T08:40:00Z", messageType: "question", attachments: [{ id: "image-1", name: "soal-limit.png", url: FIXTURE_IMAGE, alt: "Soal limit fungsi saat x mendekati 2", width: 840, height: 470 }], reactions: [{ emoji: "👍", count: 2, selected: false }] },
    { id: "m2", author: PEOPLE.tutor, body: "Substitusi langsung memberi bentuk $0/0$. Faktorkan pembilang menjadi **$(x-2)(x+2)$**, lalu sederhanakan untuk $x \\ne 2$.\n\nApa nilai $x+2$ ketika $x$ mendekati 2?", createdAt: "2026-11-15T09:00:00Z", messageType: "answer", attachments: [], reactions: [{ emoji: "🙏", count: 1, selected: true }] },
    { id: "m3", author: PEOPLE.student, body: "Jadi hasilnya 4, karena yang dicari nilai yang didekati, ya?", createdAt: "2026-11-15T09:20:00Z", messageType: "reply", replyTo: { id: "m2", authorName: PEOPLE.tutor.name, excerpt: "Substitusi langsung memberi bentuk 0/0." }, attachments: [], reactions: [] },
  ],
  function: [{ id: "m4", author: PEOPLE.student, body: "Bagian mana dari grafik yang menunjukkan domain?", createdAt: "2026-11-15T07:00:00Z", messageType: "question", attachments: [], reactions: [] }],
  study: [{ id: "m5", author: PEOPLE.tutor, body: "Apa strategi yang membantu kalian membagi waktu latihan?", createdAt: "2026-11-14T10:10:00Z", messageType: "question", attachments: [], reactions: [] }],
  motion: [{ id: "m8", author: PEOPLE.student, body: "Bagaimana menentukan sumbu yang memudahkan perhitungan?", createdAt: "2026-11-13T08:30:00Z", messageType: "question", attachments: [], reactions: [] }],
};

const INITIAL_REPORTS: DiscussionReport[] = [{ id: "r1", questionId: "study", questionTitle: "Bagaimana membagi waktu latihan menjelang ujian?", messageId: "m5", message: { body: "Apa strategi yang membantu kalian membagi waktu latihan?", seq: 45, deleted: false, authorName: "Raka Pratama" }, reporterName: "Nadia Putri", reason: "Perlu ditinjau oleh tim.", createdAt: "2026-11-15T10:00:00Z", status: "pending" }];

function setQuery(key: string, value: string | null) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
  window.history.replaceState(null, "", url.toString());
}

export function DiscussionFixture({ query }: { query: { role?: string; question?: string; channel?: string; message?: string; discussionTab?: string; state?: string; fail?: string } }) {
  const t = useTranslations("discussions");
  const [sessionMode, setSessionMode] = useState<"same" | "expired" | "other">("same");
  const initialRole = query.role === "tutor" || query.role === "admin" ? query.role : "student";
  const [role, setRole] = useState<"student" | "tutor" | "admin">(initialRole);
  const [channels, setChannels] = useState(() => query.state === "long-channel" ? INITIAL_CHANNELS.map(channel => channel.id === "math" ? { ...channel, name: "Matematika".repeat(16) } : channel) : query.state === "course" ? [INITIAL_CHANNELS[1]] : query.state === "pagination" ? [...INITIAL_CHANNELS, ...Array.from({ length: 25 }, (_, index): DiscussionChannel => ({ id: `extra-${index}`, name: `Kelas tambahan ${index + 1}`, kind: "course", courseId: `extra-${index}`, unreadCount: 0, muted: false, canCreate: true }))] : INITIAL_CHANNELS);
  const [questions, setQuestions] = useState(() => query.state === "empty" ? [] : query.state === "pagination" ? [...INITIAL_QUESTIONS, ...Array.from({ length: 35 }, (_, index): DiscussionQuestion => ({ id: `closed-${index}`, channelId: "math", title: `Pertanyaan selesai ${index + 1}`, status: "resolved", lastActivityAt: "2026-11-15T08:00:00Z", unreadCount: 0, answerCount: 0, allowedForwardChannelIds: ["math"], canReply: false, canResolve: true })), ...Array.from({ length: 25 }, (_, index): DiscussionQuestion => ({ id: `target-${index}`, channelId: "math", title: `Pertanyaan tambahan ${index + 1}`, status: "open", lastActivityAt: "2026-11-15T07:00:00Z", unreadCount: 0, answerCount: 0, allowedForwardChannelIds: ["math"], canReply: true, canResolve: true }))] : INITIAL_QUESTIONS);
  const [messages, setMessages] = useState(() => query.state === "report-target" || query.state === "report-target-deep" ? { ...INITIAL_MESSAGES, study: Array.from({ length: query.state === "report-target" ? 55 : 475 }, (_, index): FixtureMessage => ({ id: `reported-${index + 1}`, author: PEOPLE.tutor, body: `Pesan laporan ${index + 1}`, createdAt: "2026-11-14T10:10:00Z", messageType: index ? "reply" : "question", attachments: [], reactions: [] })) } : INITIAL_MESSAGES);
  const [reports, setReports] = useState(query.state === "long-text" ? INITIAL_REPORTS.map(report => ({ ...report, questionTitle: "Question".repeat(20), reporterName: "Reporter".repeat(20), reason: "Reason".repeat(100) })) : query.state === "report-target" || query.state === "report-target-deep" ? INITIAL_REPORTS.map(report => { const seq = query.state === "report-target" ? 45 : 450; return { ...report, messageId: `reported-${seq}`, message: { body: `Pesan laporan ${seq}`, seq, deleted: false, authorName: PEOPLE.tutor.name } }; }) : INITIAL_REPORTS);
  const [submittedMentionIds, setSubmittedMentionIds] = useState<string[]>([]);
  const [fixtureReadAttempts, setFixtureReadAttempts] = useState(0);
  const [fixtureReadError, setFixtureReadError] = useState(false);
  const [fixtureReadRetry, setFixtureReadRetry] = useState(0);
  const [fixtureReadRevision, setFixtureReadRevision] = useState(0);
  const [fixtureEmptyObservations, setFixtureEmptyObservations] = useState(0);
  const [hideForwardSource, setHideForwardSource] = useState(false);
  const [forwardAttempts, setForwardAttempts] = useState<Array<{ questionId: string; messageId: string; targetChannelId: string; targetQuestionId: string; requestId: string }>>([]);
  const [replyAttempts, setReplyAttempts] = useState<string[]>([]);
  const delayedForward = useRef<(() => void) | null>(null);
  const [fixturePaging, setFixturePaging] = useState<{ cursors: Array<string | undefined>; index: number }>({ cursors: [undefined], index: 0 });
  const fixtureObservation = useRef({ through: 0, seen: new Set<number>(), versions: new Map<string, number>() });
  const revisedOnOpen = useRef(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(query.channel && INITIAL_CHANNELS.some((channel) => channel.id === query.channel) ? query.channel : null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(query.question === "none" || query.state === "empty" ? null : query.question && INITIAL_QUESTIONS.some((question) => question.id === query.question) ? query.question : "limit");
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(query.message ?? null);
  const [activeTab, setActiveTab] = useState<"questions" | "reports">(query.discussionTab === "reports" ? "reports" : "questions");
  const [search, setSearch] = useState("");
  const [resolvedOpen, setResolvedOpen] = useState(false);
  const [resolvedPageIndex, setResolvedPageIndex] = useState(0);
  const [listState, setListState] = useState<"ready" | "loading" | "error">(query.state === "list-error" ? "error" : query.state === "list-loading" ? "loading" : "ready");
  const [threadState, setThreadState] = useState<"ready" | "loading" | "error">(query.state === "thread-error" ? "error" : query.state === "thread-loading" ? "loading" : "ready");
  const failed = useRef(new Set<string>());
  const uploadedImages = useRef(new Set<string>());
  const committedRequests = useRef(new Set<string>());
  const committedQuestionIds = useRef(new Map<string, string>());
  useEffect(() => () => { uploadedImages.current.forEach((url) => URL.revokeObjectURL(url)); }, []);
  const viewer = PEOPLE[role];
  const selectedQuestion = questions.find((item) => item.id === selectedQuestionId) ?? null;
  const visibleQuestions = questions.filter((item) => (!selectedChannelId || item.channelId === selectedChannelId) && item.title.toLowerCase().includes(search.toLowerCase()));
  useEffect(() => { setResolvedPageIndex(0); }, [search, selectedChannelId]);
  const currentMessages = selectedQuestionId ? messages[selectedQuestionId] ?? [] : [];
  const targetIndex = currentMessages.findIndex(message => message.id === selectedMessageId);
  const fixturePageStart = Number(fixturePaging.cursors[fixturePaging.index] ?? 0);
  const visibleMessages = (query.state === "report-target-deep" && selectedQuestionId === "study" ? currentMessages.slice(fixturePageStart, fixturePageStart + 30)
    : query.state === "report-target" && selectedQuestionId === "study" ? currentMessages.slice(Math.max(0, targetIndex), Math.max(0, targetIndex) + 30) : currentMessages)
    .filter(message => !hideForwardSource || message.id !== "m2");
  const fixtureNext = nextDiscussionMessageCursor(fixturePaging.cursors, fixturePaging.index, fixturePageStart + 30 < currentMessages.length ? String(fixturePageStart + 30) : null);

  useEffect(() => {
    if ((query.state !== "read-observation" && query.state !== "read-visibility") || selectedQuestionId !== "limit") return;
    const root = document.querySelector<HTMLElement>("[data-discussion-workspace]");
    const status = root?.querySelector<HTMLElement>("[data-discussion-status]");
    const message = messages.limit.find(item => item.id === "m1");
    if (!root || !status || !message) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const stop = watchDiscussionVisibility(root, ids => {
      if (timer) clearTimeout(timer);
      if (ids && !ids.length) setFixtureEmptyObservations(count => count + 1);
      const revision = message.revision ?? 1;
      const visible = ids?.includes("m1") ? [{ id: "m1", seq: 1, revision }] : [];
      const snapshot = visibleDiscussionReadSnapshot(fixtureObservation.current, "open", visible, "fixture-receipt");
      if (snapshot) timer = setTimeout(() => {
        void retryDiscussionRead(async () => {
          setFixtureReadAttempts(count => count + 1);
          if (query.fail === "read" && !failed.current.has("read")) { failed.current.add("read"); throw new Error("Read acknowledgement unavailable"); }
          if (query.fail === "read-always" && !failed.current.has("read-recovered")) throw new Error("Read acknowledgement unavailable");
          setFixtureReadError(false);
          setFixtureReadRevision(revision);
        }, () => !cancelled && !discussionVisibilityBlocked() && discussionStatusUncovered(status)).catch(() => { if (!cancelled) setFixtureReadError(true); });
      }, 1500);
    });
    return () => { cancelled = true; stop(); if (timer) clearTimeout(timer); };
  }, [query.state, query.fail, selectedQuestionId, messages, fixtureReadRetry]);

  function failOnce(kind: string) {
    if (query.fail === kind && !failed.current.has(kind)) { failed.current.add(kind); throw new Error("Fixture failure"); }
  }
  function selectQuestion(id: string | null, messageId?: string | null) {
    setSelectedQuestionId(id);
    setSelectedMessageId(messageId ?? null);
    if (query.state === "report-target-deep" && id === "study" && messageId) {
      const target = (messages.study ?? []).findIndex(message => message.id === messageId);
      const startCursor = target > 0 ? String(target) : undefined;
      const previousCursor = target > 0 ? String(Math.max(0, target - 30)) : undefined;
      setFixturePaging(initialDiscussionMessageCursors({ startCursor, previousCursor }));
    } else setFixturePaging({ cursors: [undefined], index: 0 });
    const url = new URL(window.location.href);
    url.searchParams.set("question", id ?? "none");
    if (messageId) url.searchParams.set("message", messageId); else url.searchParams.delete("message");
    if (messageId) { url.searchParams.delete("discussionTab"); setActiveTab("questions"); }
    window.history.replaceState(null, "", url.toString());
    const item = questions.find((question) => question.id === id);
    if (item?.unreadCount) {
      setQuestions((current) => current.map((question) => question.id === id ? { ...question, unreadCount: 0 } : question));
      setChannels((current) => current.map((channel) => channel.id === item.channelId ? { ...channel, unreadCount: Math.max(0, channel.unreadCount - 1) } : channel));
    }
  }
  function updateMessage(questionId: string, messageId: string, update: (message: FixtureMessage) => FixtureMessage) {
    setMessages((current) => ({ ...current, [questionId]: (current[questionId] ?? []).map((message) => message.id === messageId ? update(message) : message) }));
  }
  function appendMessage(questionId: string, message: FixtureMessage) {
    setMessages((current) => ({ ...current, [questionId]: [...(current[questionId] ?? []), message] }));
    setQuestions((current) => current.map((question) => question.id === questionId ? { ...question, answerCount: question.answerCount + (message.messageType === "answer" ? 1 : 0), status: message.messageType === "answer" && question.status === "open" ? "answered" : question.status, lastActivityAt: message.createdAt } : question));
  }

  const renderWorkspace = (draftState?: DiscussionDraftState) => (
    <DiscussionWorkspace readError={fixtureReadError} onRetryRead={() => { failed.current.add("read-recovered"); setFixtureReadError(false); setFixtureReadRetry(value => value + 1); }} draftState={draftState} viewer={viewer} channels={channels} questions={visibleQuestions.filter(item => item.status !== "resolved")} resolvedQuestions={visibleQuestions.filter(item => item.status === "resolved").slice(resolvedPageIndex * 20, (resolvedPageIndex + 1) * 20)} resolvedOpen={resolvedOpen} resolvedState="ready" resolvedPageIndex={resolvedPageIndex} resolvedHasMore={visibleQuestions.filter(item => item.status === "resolved").length > (resolvedPageIndex + 1) * 20} onResolvedOpenChange={setResolvedOpen} onResolvedPage={(direction) => setResolvedPageIndex(index => index + (direction === "next" ? 1 : -1))} selectedQuestion={selectedQuestion} messages={visibleMessages.map((message) => ({ ...message, seq: currentMessages.indexOf(message) + 1, revision: message.revision ?? 1, skinId: message.skinId ?? message.author.skinId, canEdit: role === "admin" || (message.author.id === viewer.id && Date.now() - Date.parse(message.createdAt) < 5 * 60 * 1000), canDelete: role === "admin" || message.author.id === viewer.id, canReport: true }))} selectedChannelId={selectedChannelId} selectedQuestionId={selectedQuestionId} selectedMessageId={selectedMessageId} activeTab={activeTab} onTabChange={(tab) => { setActiveTab(tab); setQuery("discussionTab", tab === "reports" ? tab : null); }} search={search} listState={listState} threadState={threadState} reports={role === "admin" ? reports : undefined} reportState={query.state === "reports-loading" ? "loading" : query.state === "reports-error" ? "error" : "ready"} onRetryReports={() => {}} renderAttachment={(attachment) => <FixtureAttachment attachment={{ ...attachment, previewAvailable: query.state !== "private-image-old" }} fail={query.state === "image-error" && attachment.id === "image-1"} privateRoute={query.state === "private-image" || query.state === "private-image-old"} onOpen={() => { if ((query.state === "read-observation" || query.state === "read-visibility") && !revisedOnOpen.current) { revisedOnOpen.current = true; updateMessage("limit", "m1", message => ({ ...message, revision: (message.revision ?? 1) + 1 })); } }} />}
      onSelectChannel={(channel) => { const id = channel?.id ?? null; setSelectedChannelId(id); setQuery("channel", id); selectQuestion(null); }} onSelectQuestion={selectQuestion} onSearchChange={setSearch} onRetryQuestions={() => setListState("ready")} onRetryMessages={() => setThreadState("ready")}
      onSearchChannels={async ({ search: channelSearch, cursor, courseId, kind, kinds }) => { failOnce("channels"); const found = channels.filter((channel) => (query.state !== "course" || channel.kind === "course" && channel.courseId === "math") && (!courseId || (channel.kind === "course" && channel.courseId === courseId)) && (!kind || channel.kind === kind) && (!kinds || (channel.kind !== "private" && kinds.includes(channel.kind))) && channel.name.toLowerCase().includes(channelSearch.toLowerCase())); const start = cursor ? Number(cursor) : 0; return { items: found.slice(start, start + 20), nextCursor: start + 20 < found.length ? String(start + 20) : null }; }}
      onSearchMentions={async ({ channelId, questionId, query: mentionSearch }) => { failOnce("mention"); const scope = questionId ? questions.find((item) => item.id === questionId)?.channelId : channelId; if (!channels.some((channel) => channel.id === scope)) throw new Error("Unavailable"); const candidates = [PEOPLE.student, PEOPLE.tutor, PEOPLE.admin]; const sameName = query.state === "mention-pages" ? Array.from({ length: 11 }, (_, index) => ({ id: `alice-${index + 1}`, name: "Alice", role: "student" as const, context: `Materi ${index + 1}`, hasNamesake: true })) : query.state === "same-name" ? [{ id: "alice-1", name: "Alice", role: "student" as const, context: "Saya belajar limit." }, { id: "alice-2", name: "Alice", role: "student" as const, context: "Saya belajar integral." }] : query.state === "namesake-metadata" ? [{ id: "alice-1", name: "Alice", role: "student" as const, context: "Saya belajar limit.", hasNamesake: true, ambiguous: true }] : query.state === "mention-overflow" ? [{ id: "alice-1", name: "Alice", role: "student" as const, context: "Saya belajar limit.", ambiguous: true }] : []; return [...candidates, ...sameName].filter((person) => person.name.toLowerCase().includes(mentionSearch.toLowerCase())).map((person) => ({ id: person.id, name: person.name, role: person.role === "zyra" ? undefined : person.role, context: "context" in person && typeof person.context === "string" ? person.context : undefined, ...( "hasNamesake" in person && typeof person.hasNamesake === "boolean" ? { hasNamesake: person.hasNamesake } : {}), ...( "ambiguous" in person && typeof person.ambiguous === "boolean" ? { ambiguous: person.ambiguous } : {}), mention: mentionHandle(person.id, person.name) })); }}
      onSearchForwardTargets={async ({ channelId, search: targetSearch, cursor }) => { failOnce("targets"); const found = questions.filter((question) => (!channelId || question.channelId === channelId) && question.status !== "resolved" && question.title.toLowerCase().includes(targetSearch.toLowerCase())); const start = cursor ? Number(cursor) : 0; return { items: found.slice(start, start + 20).map((question) => { const ch = channels.find((c) => c.id === question.channelId); return { questionId: question.id, channelId: question.channelId, channelName: ch ? discussionChannelLabel(ch, t) : undefined, title: query.state === "long-text" ? "Question".repeat(20) : question.title }; }), nextCursor: start + 20 < found.length ? String(start + 20) : null }; }}
      onCreateQuestion={async (input) => { if (committedRequests.current.has(input.requestId)) { const existingId = committedQuestionIds.current.get(input.requestId); if (existingId) { setSelectedChannelId(null); setSelectedQuestionId(existingId); setQuery("question", existingId); } return; } if (query.fail === "legacy-replay" && !failed.current.has("legacy-unknown")) { failed.current.add("legacy-unknown"); throw new Error("Response lost"); } if (query.fail === "legacy-replay" && !failed.current.has("legacy-result")) { failed.current.add("legacy-result"); return { error: "replay_unverified", target: { threadId: "limit", messageId: "m1" } }; } failOnce("create"); const id = `question-${crypto.randomUUID()}`; const now = new Date().toISOString(); const title = input.title?.trim() || deriveInitialDiscussionTitle(input.body, input.attachments.length > 0); const item: DiscussionQuestion = { id, channelId: input.channelId, title, status: "open", lastActivityAt: now, unreadCount: 0, answerCount: 0, allowedForwardChannelIds: [input.channelId], canReply: true, canResolve: true }; setQuestions((current) => [item, ...current]); setMessages((current) => ({ ...current, [id]: [{ id: `message-${crypto.randomUUID()}`, author: viewer, skinId: input.skinId, body: input.body, createdAt: now, messageType: "question", attachments: input.attachments, reactions: [] }] })); committedRequests.current.add(input.requestId); committedQuestionIds.current.set(input.requestId, id); if (query.fail === "lost-response") throw new Error("Response lost"); setSelectedChannelId(null); setSelectedQuestionId(id); setQuery("question", id); }}
      onSendReply={async (input) => { setReplyAttempts(current => [...current, input.requestId]); if (query.fail === "lost-then-resolved") { if (!failed.current.has("lost-then-resolved")) { failed.current.add("lost-then-resolved"); setQuestions(current => current.map(question => question.id === input.questionId ? { ...question, status: "resolved", canReply: false, canResolve: false } : question)); throw new Error("Response lost before commit"); } return "resolved"; } if (committedRequests.current.has(input.requestId)) return; if (query.fail === "legacy-replay" && !failed.current.has("legacy-unknown")) { failed.current.add("legacy-unknown"); throw new Error("Response lost"); } if (query.fail === "legacy-replay" && !failed.current.has("legacy-result")) { failed.current.add("legacy-result"); return { error: "replay_unverified", target: { threadId: input.questionId, messageId: "m2" } }; } failOnce("send"); if (query.fail === "expired-send" && !failed.current.has("expired-send")) { failed.current.add("expired-send"); return "attachment_expired"; } if (query.fail === "resolved-send" && !failed.current.has("resolved-send")) { failed.current.add("resolved-send"); setQuestions((current) => current.map((question) => question.id === input.questionId ? { ...question, status: "resolved", canReply: false } : question)); return "resolved"; } setSubmittedMentionIds(input.mentionIds); const source = (messages[input.questionId] ?? []).find((message) => message.id === input.replyToMessageId); appendMessage(input.questionId, { id: `message-${crypto.randomUUID()}`, author: viewer, skinId: input.skinId, body: input.body, createdAt: new Date().toISOString(), messageType: input.messageType, replyTo: source ? { id: source.id, authorName: source.author.name, excerpt: source.body || "", excerptKind: source.body ? "body" : "image" } : null, attachments: input.attachments, reactions: [] }); committedRequests.current.add(input.requestId); if (query.fail === "lost-response") throw new Error("Response lost"); }}
      onUploadImage={async ({ file }) => { if (query.fail === "upload-mixed" && file.name === "slow.png") await new Promise(resolve => setTimeout(resolve, 1500)); if (query.fail === "upload-mixed" && file.name === "failed.png" && !failed.current.has("mixed-image")) { failed.current.add("mixed-image"); throw new Error("Fixture upload failure"); } failOnce("upload"); if (query.fail === "upload-pixels" && !failed.current.has("upload-pixels")) { failed.current.add("upload-pixels"); return { ok: false, error: "pixels" }; } const url = URL.createObjectURL(file); uploadedImages.current.add(url); return { ok: true, attachment: { id: `image-${crypto.randomUUID()}`, name: file.name, url, alt: file.name } }; }}
      onEditMessage={async ({ questionId, messageId, body, revision }) => { if (query.fail === "edit-conflict" && !failed.current.has("edit-conflict")) { failed.current.add("edit-conflict"); updateMessage(questionId, messageId, (message) => ({ ...message, body: "Versi terbaru dari admin.", revision: revision + 1 })); throw new Error("Pesan berubah."); } failOnce("edit"); updateMessage(questionId, messageId, (message) => ({ ...message, body, revision: revision + 1, editedAt: new Date().toISOString() })); }}
      onDeleteMessage={async ({ questionId, messageId }) => { failOnce("delete"); setMessages((current) => ({ ...current, [questionId]: (current[questionId] ?? []).filter((message) => message.id !== messageId) })); }}
      onToggleReaction={async ({ questionId, messageId, emoji, selected }) => { failOnce("reaction"); updateMessage(questionId, messageId, (message) => { const existing = message.reactions.find((reaction) => reaction.emoji === emoji); return { ...message, reactions: existing ? message.reactions.map((reaction) => reaction.emoji === emoji ? { ...reaction, selected, count: Math.max(0, reaction.count + (selected === reaction.selected ? 0 : selected ? 1 : -1)) } : reaction) : selected ? [...message.reactions, { emoji, count: 1, selected: true }] : message.reactions }; }); }}
      onForwardMessage={async (input) => { const { questionId, messageId, targetQuestionId, requestId } = input; setForwardAttempts(current => [...current, input]); if (query.fail === "resolved-forward") { if (!failed.current.has("forward-uncertain")) { failed.current.add("forward-uncertain"); return "unknown"; } return "resolved"; } if (query.fail === "delay-forward") { await new Promise<void>(resolve => { delayedForward.current = resolve; }); return "unknown"; } if (committedRequests.current.has(requestId)) return; if (query.fail === "legacy-forward") { if (!failed.current.has("legacy-forward-unknown")) { failed.current.add("legacy-forward-unknown"); throw new Error("Response lost"); } return { error: "replay_unverified", target: { threadId: targetQuestionId, messageId: "existing-forward" } }; } failOnce("forward"); const source = (messages[questionId] ?? []).find((message) => message.id === messageId); if (!source) throw new Error("Missing message"); appendMessage(targetQuestionId, { ...source, id: `message-${crypto.randomUUID()}`, author: viewer, createdAt: new Date().toISOString(), messageType: "forward", replyTo: null, reactions: [] }); committedRequests.current.add(requestId); if (query.fail === "lost-forward") throw new Error("Response lost"); }}
      onReportMessage={async ({ questionId, messageId, reason }) => { failOnce("report"); setReports((current) => [{ id: `report-${crypto.randomUUID()}`, questionId, questionTitle: questions.find((question) => question.id === questionId)?.title ?? "Pertanyaan", messageId, reporterName: viewer.name, reason, createdAt: new Date().toISOString(), status: "pending" }, ...current]); }}
      onSetChannelMuted={async ({ channelId, muted }) => { failOnce("mute"); setChannels((current) => current.map((channel) => channel.id === channelId ? { ...channel, muted } : channel)); }}
      onSetQuestionStatus={async ({ questionId, status }) => { failOnce("status"); setQuestions((current) => current.map((question) => question.id === questionId ? { ...question, status: status === "open" && question.answerCount > 0 ? "answered" : status, canReply: status !== "resolved" } : question)); }}
      onSetReportStatus={async ({ reportId, status }) => { failOnce("report-status"); setReports((current) => current.map((report) => report.id === reportId ? { ...report, status } : report)); }}
      onLoadAuthorProfile={async ({ authorId }) => {
        failOnce("profile");
        if (authorId === PEOPLE.student.id) {
          return {
            kind: "student",
            name: PEOPLE.student.name,
            role: "student",
            profile: {
              publicId: "nadia-public",
              displayName: PEOPLE.student.name,
              avatarUrl: null,
              avatarBadgeId: null,
              avatarMode: "photo",
              avatarBadgeTier: null,
              major: "Matematika",
              faculty: "FMIPA",
              rankKey: "camat",
              baseXpMicro: 420_000,
              earnedBadges: [],
              featuredBadgeIds: [],
              equippedThemeId: null,
              equippedFrameId: null,
              equippedTitleId: null,
              equippedZyraAvatarId: null,
              followerCount: 12,
              followingCount: 5,
              isFollowing: false,
              canFollow: role === "student",
            },
          };
        }
        const person = Object.values(PEOPLE).find((item) => item.id === authorId);
        return {
          kind: "limited",
          id: authorId,
          name: person?.name ?? t("unknownAuthor"),
          role: person?.role === "zyra" ? null : person?.role ?? null,
          avatarUrl: null,
          visibilityReason: "staff",
        };
      }}
    />
  );
  return <main data-fixture-read-attempts={fixtureReadAttempts} data-fixture-mention-ids={submittedMentionIds.join(",")} data-fixture-read-revision={fixtureReadRevision} data-fixture-empty-observations={fixtureEmptyObservations} data-fixture-forward-attempts={JSON.stringify(forwardAttempts)} data-fixture-reply-attempts={JSON.stringify(replyAttempts)} className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-6">{query.state === "read-visibility" && <style>{'[data-discussion-messages] [data-message-id="m1"] { margin-top: 1000px; }'}</style>}<div className="mx-auto max-w-7xl">{query.state === "shell" && <div aria-hidden className="h-13 md:hidden" />}<PageHeader title={t("title")} icon={MessageSquareText} actions={<Select value={role} onValueChange={(value) => { setRole(value as "student" | "tutor" | "admin"); setQuery("role", value); }}><SelectTrigger aria-label={t("fixtureRole")} className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="student">{t("role_student")}</SelectItem><SelectItem value="tutor">Tutor</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent></Select>} />
    {(query.state === "session" || query.state === "session-prepare" || query.state === "session-forward") && <div className="mb-3 flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => setSessionMode("expired")}>Expire fixture session</Button>
      <Button variant="outline" size="sm" onClick={() => setSessionMode("same")}>Resume same account</Button>
      <Button variant="outline" size="sm" onClick={() => setSessionMode("other")}>Switch fixture account</Button>
      {query.state === "session-forward" && <Button variant="outline" size="sm" onClick={() => setHideForwardSource(current => !current)}>{hideForwardSource ? "Show fixture source" : "Hide fixture source"}</Button>}
      {query.fail === "delay-forward" && <Button variant="outline" size="sm" onClick={() => delayedForward.current?.()}>Finish fixture forward</Button>}
    </div>}
    {query.state === "report-target-deep" && selectedQuestionId === "study" && <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={fixturePageStart === 0} onClick={() => setFixturePaging(current => current.index === 0 ? { cursors: [String(Math.max(0, fixturePageStart - 30)), ...current.cursors], index: 0 } : { ...current, index: current.index - 1 })}>{t("previousMessages")}</Button><Button type="button" variant="outline" size="sm" disabled={!fixtureNext} onClick={() => setFixturePaging(current => ({ cursors: [...current.cursors.slice(0, current.index + 1), fixtureNext!], index: current.index + 1 }))}>{t("nextMessages")}</Button></div>}
    {query.state === "session" || query.state === "session-prepare" || query.state === "session-forward" ? <DiscussionSessionGuard viewerId={viewer.id} sessionId={sessionMode === "expired" ? undefined : sessionMode === "other" ? "other-account" : viewer.id} pending={false}>{renderWorkspace}</DiscussionSessionGuard> : renderWorkspace()}
  </div></main>;
}
