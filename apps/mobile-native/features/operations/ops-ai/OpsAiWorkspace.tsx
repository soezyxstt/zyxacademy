import * as Clipboard from "expo-clipboard";
import Storage from "expo-sqlite/kv-store";
import { randomUUID } from "expo-crypto";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from "react";
import { Keyboard, ScrollView, StyleSheet, Text, View } from "react-native";
import { useOpsAiChat } from "../../../../../lib/admin-ops-ai/chat-client";
import { OPS_AI_POLICY_BOUNDS, OpsAiActionProposalV2Schema, type OpsAiActionProposalV2, type OpsAiCitation } from "../../../../../lib/admin-ops-ai/chat-contract";
import { stripOpsFollowupMarkup } from "../../../../../lib/admin-ops-ai/followups";
import { nativeColors, nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { NativeRequestNotDispatched, type NativeSessionTransport } from "../../../network/transport";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { nativeTypography } from "../../../typography";
import { SharedSheet, type OverlayFocusTarget } from "../../shared-ui/overlays";
import { NavigationIcon } from "../../shared-ui/navigation-icons";
import { CourseMarkdown } from "../../student/CourseMarkdown";
import { approvalPayload, createOpsAiClient, opsChatContext, type ApprovalChoice } from "./client";

import {
  beginOpsAiApproval, liveOpsAiGrants, newOpsAiChat, opsAiHistoryKey, readOpsAiHistory, redactOpsAiTokens, removeOpsAiHistory,
  replaceOpsAiChat, serializeOpsAiHistory, type OpsAiChat, type OpsAiHistory, type OpsAiOutcome,
} from "./history";
import { OpsAiSources } from "./OpsAiSources";

const labels = {
  id: {
    close: "Tutup", ask: "Tanya", edit: "Aksi", newChat: "Chat baru", message: "Tulis pesan",
    send: "Kirim pesan", stop: "Hentikan respons", working: "Menyiapkan respons",
    steps: "Aktivitas", once: "Izinkan sekali", chat: "Izinkan di chat", expired: "Persetujuan kedaluwarsa",
    denied: "Akses Admin perlu diperiksa kembali.", unknown: "Hasil aksi belum terverifikasi. Periksa dengan persetujuan yang sama.",
    check: "Periksa hasil", failed: "Aksi belum selesai. Periksa target sebelum meminta aksi lagi.",
    revoke: "Akhiri izin chat", revokeError: "Izin chat belum dapat diakhiri. Coba lagi.", completed: "Aksi selesai.",
    history: "Riwayat", back: "Kembali ke chat", empty: "Belum ada riwayat chat.", untitled: "Chat baru",
    delete: "Hapus chat", clear: "Bersihkan chat", clearAll: "Hapus semua chat", cancel: "Batal",
    confirmDelete: "Hapus chat ini?", confirmClear: "Bersihkan pesan dan izin chat ini?",
    confirmAll: "Hapus semua chat Ops AI akun ini dari perangkat?",
    storageError: "Riwayat chat belum dapat disimpan. Coba lagi.",
    otherSession: "Persetujuan ini terikat pada sesi sebelumnya.",
    copy: "Salin token", copied: "Token disalin", media: "Gambar", bounded: "Izin untuk aksi dan target yang sama, hingga 10 menit.",
  },
  en: {
    close: "Close", ask: "Ask", edit: "Action", newChat: "New chat", message: "Write a message",
    send: "Send message", stop: "Stop response", working: "Preparing response",
    steps: "Activity", once: "Allow once", chat: "Allow in this chat", expired: "Approval expired",
    denied: "Admin access needs to be verified again.", unknown: "The action outcome is uncertain. Check with the same approval.",
    check: "Check outcome", failed: "The action did not complete. Check the target before requesting it again.",
    revoke: "End chat permissions", revokeError: "Chat permissions could not be ended. Try again.", completed: "Action complete.",
    history: "History", back: "Back to chat", empty: "No chat history yet.", untitled: "New chat",
    delete: "Delete chat", clear: "Clear chat", clearAll: "Delete all chats", cancel: "Cancel",
    confirmDelete: "Delete this chat?", confirmClear: "Clear this chat’s messages and permissions?",
    confirmAll: "Delete all Ops AI chats for this account from this device?",
    storageError: "Chat history could not be saved. Try again.",
    otherSession: "This approval belongs to an earlier session.",
    copy: "Copy token", copied: "Token copied", media: "Image", bounded: "Allows the same action and target for up to 10 minutes.",
  },
} as const;

type Props = {
  open: boolean;
  uri: string;
  theme: keyof typeof nativeColors;
  locale: "id" | "en";
  session: NativeSessionTransport;
  close(): void;
  citationDestination(citation: OpsAiCitation): string | null;
  visitCitation(href: string): void;
  returnFocusRef: RefObject<OverlayFocusTarget | null>;
};

type Removal = Parameters<typeof removeOpsAiHistory>[1];

export function OpsAiWorkspace({ open, uri, theme, locale, session, close, returnFocusRef, citationDestination, visitCitation }: Props) {
  const colors = nativeColors[theme];
  const t = labels[locale];
  const [history, setHistory] = useState(() => readOpsAiHistory(null, newOpsAiChat(randomUUID())));
  const chat = history.chats.find(item => item.id === history.activeId)!;
  const { id: chatId, title, mode } = chat;
  const [viewHistory, setViewHistory] = useState(false);
  const [removal, setRemoval] = useState<Removal>();
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [now, setNow] = useState(Date.now);
  const operation = useRef<AbortController | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const openNow = useRef(false);
  const activeHistory = useRef(history);
  const proposalSessions = useRef(chat.proposals);
  const savedAt = useRef(0);
  const storageKey = opsAiHistoryKey(session.scope);
  const sessionId = session.scope.sessionId;
  const client = useMemo(() => createOpsAiClient(session), [session]);
  const { canInteract, suspended } = useProtectedInteraction();
  const { messages, setMessages, input, setInput, sendMessage, isStreaming, stop } = useOpsAiChat({
    request: client.request,
    initialMessages: chat.messages,
    context: opsChatContext(uri, mode),
    onProposal: proposal => {
      if (openNow.current && session.isCurrent() && OpsAiActionProposalV2Schema.safeParse(proposal).success &&
        /^prop-[a-f0-9-]{36}$/.test(proposal.id) && !proposalSessions.current[proposal.id]) {
        proposalSessions.current = { ...proposalSessions.current, [proposal.id]: { sessionId } };
      }
    },
    onSessionTitle: (nextTitle, id) => {
      if (!openNow.current || id !== chatId || activeHistory.current.activeId !== chatId || !session.isCurrent()) return;
      const currentChat = activeHistory.current.chats.find(item => item.id === chatId)!;
      const cleanedTitle = redactOpsAiTokens(nextTitle).replace(/\s+/g, " ").trim().slice(0, 80);
      if (cleanedTitle) saveChat({ ...currentChat, title: cleanedTitle });
    },
  });
  const liveGrants = liveOpsAiGrants(chat, sessionId, now);

  function persist(historyToSave: OpsAiHistory) {
    if (!session.isCurrent() || !storageReady) return false;
    try {
      Storage.setItemSync(storageKey, serializeOpsAiHistory(historyToSave));
    } catch {
      setNotice(t.storageError);
      return false;
    }
    activeHistory.current = historyToSave;
    setHistory(historyToSave);
    return true;
  }

  function saveChat(nextChat: OpsAiChat) {
    return persist(replaceOpsAiChat(activeHistory.current, nextChat));
  }

  function restore(next: OpsAiHistory) {
    const selected = next.chats.find(item => item.id === next.activeId)!;
    proposalSessions.current = selected.proposals;
    setMessages(selected.messages);
    setInput("");
    setTokens({});
  }

  useLayoutEffect(() => {
    openNow.current = open;
    if (!open) return;
    let raw: string | null = null;
    try {
      raw = Storage.getItemSync(storageKey);
      setStorageReady(true);
    } catch {
      setStorageReady(false);
      setNotice(t.storageError);
    }
    const next = readOpsAiHistory(raw, newOpsAiChat(randomUUID()));
    activeHistory.current = next;
    setHistory(next);
    restore(next);
    savedAt.current = 0;
    setNow(Date.now());
  }, [open, storageKey]);

  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || suspended || !storageReady || activeHistory.current !== history || !session.isCurrent() || messages === chat.messages) return;
    if (isStreaming && Date.now() - savedAt.current < 1000) return;
    const firstUserMessage = messages.find(message => message.role === "user");
    if (saveChat({
      ...chat, messages, proposals: proposalSessions.current,
      title: title || (firstUserMessage ? redactOpsAiTokens(firstUserMessage.content).trim().slice(0, 48) : ""),
    })) savedAt.current = Date.now();
  }, [chat, history, isStreaming, messages, open, session, storageReady, suspended, title]);

  useEffect(() => {
    if (!open || suspended) {
      stop();
      operation.current?.abort();
      setTokens({});
      setViewHistory(false);
      setRemoval(undefined);
      setNotice("");
    }
  }, [open, suspended, stop]);

  useEffect(() => () => operation.current?.abort(), [session]);

  function checkpoint() {
    if (messages === chat.messages) return;
    saveChat({ ...chat, messages, proposals: proposalSessions.current });
  }

  function current() {
    return openNow.current && !suspended && storageReady && canInteract() && session.isCurrent();
  }

  function send(text = input, nextMode = mode) {
    if (!current() || operation.current || isStreaming || !text.trim()) return;
    Keyboard.dismiss();
    setNotice("");
    if (nextMode !== mode) saveChat({ ...chat, mode: nextMode });
    const grantIds = liveOpsAiGrants(chat, sessionId, Date.now()).slice(-8);
    savedAt.current = 0;
    void sendMessage(text, { chatId, mode: nextMode, grantIds, needsTitle: !title && !messages.length });
  }

  function selectChat(id: string) {
    if (!current() || operation.current || isStreaming || !activeHistory.current.chats.some(item => item.id === id)) return;
    const next = { ...activeHistory.current, activeId: id };
    if (id !== chatId && !persist(next)) return;
    if (id !== chatId) restore(next);
    setViewHistory(false);
    setRemoval(undefined);
    setNotice("");
  }

  function startChat() {
    if (!current() || operation.current || isStreaming) return;
    const blank = newOpsAiChat(randomUUID());
    const next = { activeId: blank.id, chats: [blank, ...activeHistory.current.chats.filter(item => item.messages.length)] };
    if (persist(next)) {
      restore(next);
      setViewHistory(false);
      setRemoval(undefined);
      setNotice("");
    }
  }

  function confirmRemoval() {
    if (!removal || !current() || operation.current || isStreaming) return;
    const next = removeOpsAiHistory(activeHistory.current, removal, newOpsAiChat(randomUUID()));
    if (!persist(next)) return;
    if (next.activeId !== chatId) restore(next);
    setRemoval(undefined);
    if (removal.type === "clear") setViewHistory(false);
    setNotice("");
  }

  async function approve(proposal: OpsAiActionProposalV2, choice: ApprovalChoice, verify = false) {
    if (!current() || operation.current || isStreaming || !OpsAiActionProposalV2Schema.safeParse(proposal).success) return;
    const withAttempt = beginOpsAiApproval(chat, proposal, sessionId, choice, verify, Date.now());
    if (!withAttempt) return;
    const payload = approvalPayload(proposal, chatId, choice);
    // Journal the proposal and the exact choice before sending. A process exit
    // after dispatch must leave an explicit outcome check for the same approval.
    setNotice("");
    if (!saveChat({ ...chat, messages, proposals: withAttempt })) return;
    proposalSessions.current = withAttempt;
    const controller = new AbortController();
    operation.current = controller;
    setPending(proposal.id);

    function record(outcome: OpsAiOutcome, grantUntil?: number) {
      if (controller.signal.aborted || !session.isCurrent()) return false;
      const latest = activeHistory.current.chats.find(item => item.id === chatId);
      if (!latest) return false;
      const proposals = {
        ...proposalSessions.current, [proposal.id]: { sessionId, outcome, grantUntil },
      };
      const saved = saveChat({ ...latest, proposals });
      if (saved) proposalSessions.current = proposals;
      return saved;
    }

    try {
      const { ok, status, data } = await client.execute(payload, controller.signal);
      if (controller.signal.aborted || !session.isCurrent()) return;
      if (ok) {
        const message = typeof data?.result?.message === "string" ? data.result.message : undefined;
        const until = choice === "chat" && typeof data?.grantUntil === "number" && data.grantUntil > Date.now()
          ? data.grantUntil : undefined;
        const token = data?.result?.token;
        if (record({ state: "done", message }, until) && typeof token === "string" && current()) {
          setTokens(previous => ({ ...previous, [proposal.id]: token }));
        }
      } else if (status === 401 || status === 403) {
        if (verify) setNotice(t.denied);
        else record({ state: "denied" });
      } else if (data?.retryable !== true && status < 500 && !(status >= 200 && status < 300)) {
        record({ state: "failed", message: typeof data?.error === "string" ? data.error : undefined });
      }
    } catch (error) {
      if (!controller.signal.aborted && session.isCurrent() && error instanceof NativeRequestNotDispatched) {
        if (verify) setNotice(t.denied);
        else record({ state: "denied" });
      }
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        setPending(null);
      }
    }
  }

  async function revoke() {
    if (!current() || operation.current || isStreaming) return;
    const ids = liveOpsAiGrants(chat, sessionId, Date.now());
    if (!ids.length) return;
    const controller = new AbortController();
    operation.current = controller;
    setPending("revoke");
    setNotice("");
    try {
      for (let i = 0; i < ids.length; i += 8) {
        const batch = ids.slice(i, i + 8);
        const { ok } = await client.execute({ chatId, revokeGrantIds: batch }, controller.signal);
        if (!ok) throw new Error();
        if (controller.signal.aborted || !session.isCurrent()) return;
        const proposals = { ...proposalSessions.current };
        for (const id of batch) proposals[id] = { ...proposals[id], grantUntil: undefined };
        const latest = activeHistory.current.chats.find(item => item.id === chatId);
        if (!latest || !saveChat({ ...latest, proposals })) return;
        proposalSessions.current = proposals;
      }
    } catch {
      if (!controller.signal.aborted && session.isCurrent()) setNotice(t.revokeError);
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        setPending(null);
      }
    }
  }

  const blocked = pending !== null || suspended || !storageReady;
  const text = [styles.text, { color: colors.foreground }];
  const muted = [styles.small, { color: colors.mutedForeground }];

  function proposalCard(proposal: OpsAiActionProposalV2) {
    const parsed = OpsAiActionProposalV2Schema.safeParse(proposal);
    if (!parsed.success) return null;
    const authority = chat.proposals[proposal.id];
    const sameSession = authority?.sessionId === sessionId;
    const outcome = authority?.outcome;
    const expired = proposal.expiresAt !== undefined && proposal.expiresAt <= now;
    const canApprove = sameSession && proposal.status === "pending" && !expired && !outcome && (proposal.type !== "admin_operation" || proposal.approval != null);
    const token = tokens[proposal.id];
    const feedback = outcome?.state === "done" ? outcome.message || t.completed :
      outcome?.state === "denied" ? t.denied :
      outcome?.state === "unknown" ? sameSession ? t.unknown : t.otherSession :
      outcome?.state === "failed" ? (locale === "id" && outcome.message) || t.failed : null;
    return <View key={proposal.id} style={[styles.proposal, { borderColor: colors.border }]}>
      <Text accessibilityRole="header" style={[text, nativeTypography.bodySemibold]}>{proposal.title}</Text>
      <Text style={text}>{proposal.preview.summary}</Text>
      {proposal.preview.targetEntity ? <Text style={text}>{proposal.preview.targetEntity}</Text> : null}
      {proposal.preview.fields?.map(({ label, value }, index) => <Text key={index} style={muted}>{label} · {value}</Text>)}
      {feedback ? <Text accessibilityLiveRegion="polite" style={text}>{feedback}</Text> : null}
      {proposal.status === "pending" && !outcome && (expired || !sameSession) ?
        <Text style={muted}>{expired ? t.expired : t.otherSession}</Text> : null}
      {token ? <Button theme={theme} variant="outline" onPress={() => {
        if (current()) void Clipboard.setStringAsync(token).then(() => { if (session.isCurrent()) setNotice(t.copied); }).catch(() => {});
      }}>{t.copy}</Button> : null}
      {canApprove && proposal.approval === "chat" ? <Text style={muted}>{t.bounded}</Text> : null}
      <View style={styles.row}>
        {canApprove && <Button theme={theme} disabled={blocked || isStreaming} isLoading={pending === proposal.id}
          onPress={() => void approve(proposal, "once")}>{t.once}</Button>}
        {canApprove && proposal.approval === "chat" && <Button theme={theme} variant="outline" disabled={blocked || isStreaming}
          onPress={() => void approve(proposal, "chat")}>{t.chat}</Button>}
        {outcome?.state === "unknown" && sameSession && <Button theme={theme} variant="outline" disabled={blocked || isStreaming}
          isLoading={pending === proposal.id} onPress={() => void approve(proposal, outcome.choice, true)}>{t.check}</Button>}
      </View>
    </View>;
  }

  const historyChats = history.chats.filter(item => item.messages.length);
  const confirmationTitle = removal?.type === "all" ? t.confirmAll : removal?.type === "clear" ? t.confirmClear : t.confirmDelete;
  const removalLabel = removal?.type === "all" ? t.clearAll : removal?.type === "clear" ? t.clear : t.delete;
  const removalChat = removal && removal.type !== "all" ? history.chats.find(item => item.id === removal.id) : undefined;
  const historyBlocked = blocked || isStreaming;
  const closeSheet = () => {
    if (removal) setRemoval(undefined);
    else if (viewHistory) setViewHistory(false);
    else {
      if (current()) checkpoint();
      close();
    }
  };

  return <SharedSheet open={open} title={viewHistory ? t.history : title || "Zyx Ops AI"} closeLabel={t.close} theme={theme}
    onDismiss={closeSheet} dismissDisabled={pending !== null} returnFocusRef={returnFocusRef} testID="admin-ops-ai-drawer"
    bodyScrollRef={scroll} onBodyContentSizeChange={() => { if (isStreaming) scroll.current?.scrollToEnd({ animated: false }); }}
    footer={viewHistory ? <View style={styles.row}>
      <Button theme={theme} variant="ghost" onPress={() => { setViewHistory(false); setRemoval(undefined); }}>{t.back}</Button>
      <Button theme={theme} disabled={historyBlocked || Boolean(removal)} onPress={startChat}>{t.newChat}</Button>
    </View> : <View style={styles.composer}>
      <View style={styles.row}>
        {(["ask", "edit"] as const).map(value => <Button key={value} theme={theme} variant={mode === value ? "secondary" : "ghost"}
          accessibilityState={{ selected: mode === value }} disabled={blocked || isStreaming} onPress={() => { if (current() && mode !== value) saveChat({ ...chat, mode: value }); }}>{t[value]}</Button>)}
        <Button theme={theme} variant="ghost" disabled={historyBlocked}
          onPress={() => { if (current()) { Keyboard.dismiss(); setViewHistory(true); } }}>{t.history}</Button>
        {messages.length ? <Button theme={theme} variant="ghost" disabled={historyBlocked} onPress={startChat}>{t.newChat}</Button> : null}
      </View>
      <View style={styles.inputRow}>
        <Input testID="admin-ops-ai-input" theme={theme} multiline maxLength={OPS_AI_POLICY_BOUNDS.maxMessageCharLength} accessibilityLabel={t.message}
          placeholder={t.message} value={input} onChangeText={setInput} disabled={blocked} style={styles.input} />
        <Button testID="admin-ops-ai-send" theme={theme} size="icon-lg" accessibilityLabel={isStreaming ? t.stop : t.send}
          disabled={blocked || (!isStreaming && !input.trim())}
          renderIcon={(color, size) => <NavigationIcon name={isStreaming ? "close" : "send"} color={color} size={size} />}
          onPress={() => { if (isStreaming) stop(); else send(); }} />
      </View>
    </View>}>
    {notice ? <Text accessibilityLiveRegion="polite" style={text}>{notice}</Text> : null}
    {viewHistory ? removal ? <View style={styles.message}>
      <Text accessibilityRole="header" style={[text, nativeTypography.bodySemibold]}>{confirmationTitle}</Text>
      {removalChat && <Text style={text}>{removalChat.title || t.untitled}</Text>}
      <View style={styles.row}>
        <Button theme={theme} variant="outline" onPress={() => setRemoval(undefined)}>{t.cancel}</Button>
        <Button theme={theme} variant="destructive" disabled={historyBlocked} onPress={confirmRemoval}>{removalLabel}</Button>
      </View>
    </View> : <>
      {historyChats.length === 0 && <Text style={muted}>{t.empty}</Text>}
      {historyChats.map(item => <View key={item.id} style={[styles.historyRow, { borderBottomColor: colors.border }]}>
        <Button theme={theme} variant={item.id === chatId ? "secondary" : "ghost"} style={styles.historyTitle}
          wrapLabel accessibilityState={{ selected: item.id === chatId }} disabled={historyBlocked}
          onPress={() => selectChat(item.id)}>{item.title || t.untitled}</Button>
        <Button theme={theme} variant="ghost" disabled={historyBlocked}
          accessibilityLabel={`${t.delete}, ${item.title || t.untitled}`}
          onPress={() => setRemoval({ type: "delete", id: item.id })}>{t.delete}</Button>
      </View>)}
      {historyChats.length > 0 && <View style={styles.row}>
        {messages.length > 0 && <Button theme={theme} variant="outline" disabled={historyBlocked}
          onPress={() => setRemoval({ type: "clear", id: chatId })}>{t.clear}</Button>}
        <Button theme={theme} variant="outline" disabled={historyBlocked} onPress={() => setRemoval({ type: "all" })}>{t.clearAll}</Button>
      </View>}
    </> : <>
    {liveGrants.length > 0 && <View style={styles.row}>
      <Button theme={theme} variant="outline" disabled={blocked || isStreaming}
        isLoading={pending === "revoke"} onPress={() => void revoke()}>{`${t.revoke} (${liveGrants.length})`}</Button>
    </View>}
    {messages.map(message => <View key={message.id} style={styles.message}>
      {message.role === "user" ? <Text selectable style={[text, styles.user, { backgroundColor: colors.muted }]}>{message.content}</Text> :
        <>
          {message.content ? <CourseMarkdown source={stripOpsFollowupMarkup(message.content)} theme={theme} allowLinks={false}
            services={{ session: { origin: session.scope.origin, locale } }}
            renderPreviewImage={({ altText }) => <Text style={muted}>{altText || t.media}</Text>} /> : null}
          {message.workSteps?.length ? <View style={styles.message}>
            <Text style={[text, nativeTypography.bodySemibold]}>{t.steps}</Text>
            {message.workSteps.map(step => <Text key={step.stepId} style={muted}>{step.title}</Text>)}
          </View> : null}
          {message.citations?.length ? <OpsAiSources citations={message.citations} theme={theme} locale={locale}
            resolveDestination={citationDestination} disabled={blocked || isStreaming} onVisit={target => {
              if (current() && !operation.current && !isStreaming) visitCitation(target);
            }} /> : null}
          {message.proposals?.map(proposalCard)}
          {message === messages.at(-1) && !isStreaming && message.followups?.length ? <View style={styles.row}>
            {message.followups.map(followup => <Button key={followup.prompt} theme={theme} variant="outline" disabled={blocked}
              onPress={() => send(followup.prompt, followup.mode ?? mode)}>{followup.label}</Button>)}
          </View> : null}
        </>}
    </View>)}
    {isStreaming ? <Text accessibilityLiveRegion="polite" style={muted}>{t.working}</Text> : null}
    </>}
  </SharedSheet>;
}

const styles = StyleSheet.create({
  composer: { gap: 8 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  historyTitle: { flex: 1, minWidth: 0, minHeight: 40, height: "auto", justifyContent: "flex-start" },
  input: { flex: 1, width: "auto", minHeight: 44, maxHeight: 116 },
  message: { gap: 8, minWidth: 0 },
  text: { ...nativeTypography.bodyRegular, fontSize: 16, lineHeight: 23 },
  small: { ...nativeTypography.bodyRegular, fontSize: 12, lineHeight: 18 },
  proposal: { borderWidth: 1, borderRadius: nativeRadii.lg, padding: 12, gap: 8 },
  user: { borderRadius: nativeRadii.md, padding: 10, alignSelf: "flex-end" },
});
