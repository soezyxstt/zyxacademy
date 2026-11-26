import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { nativeColors, nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import { ZYRA_IMAGE_MAX_REQUEST_BYTES } from "../../../../../lib/zyra/images/contracts";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import type { NativeSessionTransport } from "../../../network/transport";
import { streamNativeZyra, type NativeZyraRequest } from "../../../network/zyra";
import { nativeTypography } from "../../../typography";
import { NativeListRow } from "../../shared-ui/layout";
import { NavigationIcon } from "../../shared-ui/navigation-icons";
import { SharedSheet } from "../../shared-ui/overlays";
import { CourseMarkdown } from "../CourseMarkdown";
import type { CourseZyraContextInput, CourseZyraHandoff } from "./context";
import { LearningCanvas } from "./LearningCanvas";
import { useZyraPhotos, ZyraDraftPhotos, ZyraSavedPhotos } from "./photo-ui";
import { applyZyraEvent, maxQuestionLength, newTurn, readZyraHistory, readZyraReceipt, turnCompletion, type Turn, type ZyraHistory, ZyraHistoryError } from "./conversation";

const copy = {
  en: {
    open: "Ask Zyra", close: "Close", history: "History", backToChat: "Back to chat", newChat: "New chat", empty: "No saved conversations",
    prompt: "Ask about this course", send: "Send question", stop: "Stop response", loading: "Loading conversation", thinking: "Thinking",
    error: "Could not load this conversation.", denied: "Zyra access for this course is unavailable.", retry: "Try again",
    uncertain: "Your question may have been saved. Check history before sending it again.", receiptMissing: "History does not show this question yet.",
    check: "Check history", continue: "Continue without this reply", unsaved: "This reply is visible here but was not saved in history.",
    rejected: "The question was not accepted.", free: "The Free plan supports text questions.",
    selection: "Selected text", playground: "Code from Playground", explainSelection: "Explain this selection", reviewCode: "Help me with this code",
    removeContext: "Remove context", earlier: "Earlier messages",
  },
  id: {
    open: "Tanya Zyra", close: "Tutup", history: "Riwayat", backToChat: "Kembali ke percakapan", newChat: "Percakapan baru", empty: "Belum ada percakapan tersimpan",
    prompt: "Tanya tentang kelas ini", send: "Kirim pertanyaan", stop: "Hentikan jawaban", loading: "Memuat percakapan", thinking: "Sedang berpikir",
    error: "Percakapan belum dapat dimuat.", denied: "Akses Zyra untuk kelas ini belum tersedia.", retry: "Coba lagi",
    uncertain: "Pertanyaan mungkin sudah tersimpan. Periksa riwayat sebelum mengirimnya lagi.", receiptMissing: "Pertanyaan belum terlihat dalam riwayat.",
    check: "Periksa riwayat", continue: "Lanjut tanpa jawaban ini", unsaved: "Jawaban ini dapat dibaca di sini, tetapi belum tersimpan dalam riwayat.",
    rejected: "Pertanyaan belum diterima.", free: "Paket Free mendukung pertanyaan teks.",
    selection: "Teks pilihan", playground: "Kode dari Playground", explainSelection: "Jelaskan kutipan ini", reviewCode: "Bantu saya memahami kode ini",
    removeContext: "Hapus konteks", earlier: "Pesan sebelumnya",
  },
} as const;

type TurnState = "streaming" | "uncertain" | "retry" | "unsaved";

import { useTourEvent } from "../../onboarding/tour-events";

export function CourseZyra({ courseId, pathname, session, locale, theme, current, openExternal, launcher = true, handoff, onHandoffConsumed }: {
  courseId: string;
  pathname: string;
  session: NativeSessionTransport;
  locale: "en" | "id";
  theme: keyof typeof nativeColors;
  current(): boolean;
  openExternal?(href: string): void;
  launcher?: boolean;
  handoff?: CourseZyraHandoff | null;
  onHandoffConsumed?(id: string): void;
}) {
  const t = copy[locale];
  const colors = nativeColors[theme];
  const tour = useTourEvent();
  const trigger = useRef<ComponentRef<typeof Pressable>>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const follow = useRef(true);
  const scrollY = useRef(0);
  const contentHeight = useRef(0);
  const prepending = useRef(false);
  const read = useRef<AbortController | null>(null);
  const send = useRef<AbortController | null>(null);
  const seenHandoff = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [historyMode, setHistoryMode] = useState(false);
  const [history, setHistory] = useState<ZyraHistory | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);
  const [shownImage, setShownImage] = useState<string | null>(null);
  const [readState, setReadState] = useState<"loading" | "error" | "denied" | null>(null);
  const [receiptState, setReceiptState] = useState<"checking" | "missing" | "error" | null>(null);
  const [draft, setDraft] = useState("");
  const [context, setContext] = useState<CourseZyraContextInput | null>(null);
  const [turn, setTurn] = useState<{ state: TurnState; data: Turn } | null>(null);
  const photoOptions = { session, courseId, pathname, locale, current };
  const photos = useZyraPhotos(photoOptions);
  const photoSessionId = photos.items[0]?.uploaded.sessionId;
  const { origin } = session.scope;
  const services = { session: { userId: session.scope.accountId, origin, role: "student" as const, locale }, devicePreferences: undefined, openExternal };
  const body = [styles.text, { color: colors.foreground }];
  const muted = [styles.text, { color: colors.mutedForeground }];

  useEffect(() => () => {
    read.current?.abort();
    read.current = null;
    send.current?.abort();
    send.current = null;
  }, [courseId, session]);

  useEffect(() => {
    if (!handoff || handoff.id === seenHandoff.current || !current() || send.current) return;
    seenHandoff.current = handoff.id;
    setContext(handoff.input);
    if (handoff.input.kind === "selection") setDraft(previous => previous.trim() ? previous : t.explainSelection);
    onHandoffConsumed?.(handoff.id);
    setOpen(true);
    if (!read.current) void load(photoSessionId ?? history?.history?.sessionId);
  }, [handoff, current, history?.history?.sessionId, onHandoffConsumed, photoSessionId, t.explainSelection]);

  function deny() {
    photos.cancel();
    photos.clear();
    setHistory(null);
    setDraft("");
    setContext(null);
    setTurn(null);
    setReceiptState(null);
    setReadState("denied");
  }

  async function load(sessionId?: string) {
    if (read.current || send.current || !current()) return;
    const controller = new AbortController();
    read.current = controller;
    setReadState("loading");
    try {
      const result = await readZyraHistory(session, courseId, controller.signal, sessionId);
      if (read.current !== controller || !current()) return;
      follow.current = true;
      setHistory(result);
      setVisibleCount(20);
      setShownImage(null);
      if (!result.imageInput) photos.clear();
      setReadState(null);
      setHistoryMode(false);
    } catch (error) {
      if (read.current !== controller || !current()) return;
      if (error instanceof ZyraHistoryError && [401, 403, 409].includes(error.status)) deny();
      else setReadState("error");
    } finally {
      if (read.current === controller) read.current = null;
    }
  }

  function dismiss() {
    read.current?.abort();
    photos.cancel();
    read.current = null;
    send.current?.abort();
    setShownImage(null);
    setReadState(previous => previous === "loading" ? null : previous);
    setReceiptState(previous => previous === "checking" ? null : previous);
    setOpen(false); tour?.("zyraClose");
  }

  async function submit(request: NativeZyraRequest) {
    if (send.current || read.current || photos.busy || !history || !current()) return;
    const attachments = photos.items.map(item => item.uploaded).filter(item => request.attachmentIds?.includes(item.id));
    if (attachments.some(item => Date.now() >= item.expiresAt) ||
      attachments.reduce((bytes, item) => bytes + item.byteSize, new TextEncoder().encode(request.question).length) > ZYRA_IMAGE_MAX_REQUEST_BYTES) {
      photos.warn();
      return;
    }
    const controller = new AbortController();
    send.current = controller;
    follow.current = true;
    setDraft("");
    setContext(null);
    setReceiptState(null);
    let response = newTurn(request);
    let completed = false;
    let error: unknown;
    let ownsTurn = false;
    setTurn({ state: "streaming", data: response });
    try {
      for await (const event of streamNativeZyra(session, request, controller.signal)) {
        if (send.current !== controller || !current()) { controller.abort(); return; }
        if (event.type === "done") completed = true;
        const updated = applyZyraEvent(response, event);
        if (updated !== response) setTurn({ state: "streaming", data: updated });
        response = updated;
      }
    } catch (failure) { error = failure; }
    finally {
      ownsTurn = send.current === controller;
      if (ownsTurn) send.current = null;
    }
    if (!ownsTurn || !current()) return;
    const status = turnCompletion(response, completed, error);
    if (status === "access") { deny(); return; }
    if (status !== "saved" || !response.sessionId) {
      setTurn({ state: status === "saved" ? "uncertain" : status, data: response });
      return;
    }
    const targetId = response.sessionId;
    const previous = history.history?.sessionId === targetId ? history.history : null;
    const title = response.title ?? previous?.sessionTitle ?? (request.question.slice(0, 100) || "Zyra");
    setHistory({ ...history, sessions: [{ id: targetId, title }, ...history.sessions.filter(item => item.id !== targetId)], history: {
      sessionId: targetId, sessionTitle: title,
      messages: [...(previous?.messages ?? []),
        { id: request.requestId + ":student", role: "student", content: request.question, attachments },
        { id: request.requestId + ":ai", role: "ai", content: response.response,
          canvasSpec: history.tier === "standard" ? response.canvasSpec : undefined }],
    } });
    photos.clear();
    setTurn(null);
  }

  async function checkReceipt() {
    if (turn?.state !== "uncertain" || read.current || !history || !current()) return;
    const controller = new AbortController();
    read.current = controller;
    setReceiptState("checking");
    try {
      const result = await readZyraReceipt(session, courseId, turn.data.request.requestId, controller.signal, history.tier === "standard");
      if (read.current !== controller || !current()) return;
      if (!result) { setReceiptState("missing"); return; }
      const title = result.sessionTitle ?? turn.data.request.question.slice(0, 100);
      setHistory({ ...history, history: result, sessions: [{ id: result.sessionId, title }, ...history.sessions.filter(item => item.id !== result.sessionId)] });
      setReceiptState(null);
      photos.clear();
      setTurn(null);
    } catch (error) {
      if (read.current !== controller || !current()) return;
      if (error instanceof ZyraHistoryError && [401, 403, 409].includes(error.status)) deny();
      else setReceiptState("error");
    } finally { if (read.current === controller) read.current = null; }
  }

  const notice = turn?.state === "uncertain" ? t.uncertain : turn?.state === "retry" ? t.rejected : turn?.state === "unsaved" ? t.unsaved : null;
  const contextualQuestion = context?.kind === "selection" ? t.explainSelection : context ? t.reviewCode : "";
  const composer = history && !historyMode && !readState ? <>
    {history.imageInput && photos.supported ? <ZyraDraftPhotos controller={photos} locale={locale} theme={theme}
      threadId={history.history?.sessionId} disabled={Boolean(turn)} /> : null}
    {context ? <View style={styles.actions}>
      <Text style={[muted, styles.context]} numberOfLines={2}>{context.kind === "selection" ? context.snippet : t.playground}</Text>
      <Button theme={theme} variant="ghost" size="icon" accessibilityLabel={t.removeContext}
        onPress={() => setContext(null)} renderIcon={(color, size) => <NavigationIcon name="close" color={color} size={size} />} />
    </View> : null}
    <View style={styles.composer}>
    <Input value={draft} onChangeText={setDraft} maxLength={maxQuestionLength} theme={theme} multiline
      style={styles.input} accessibilityLabel={t.prompt} placeholder={t.prompt} disabled={Boolean(turn)} testID="student-zyra-question" />
    <Button theme={theme} size="icon-lg" accessibilityLabel={turn?.state === "streaming" ? t.stop : t.send}
      testID={turn?.state === "streaming" ? "student-zyra-stop" : "student-zyra-send"}
      disabled={turn?.state !== "streaming" && (Boolean(turn) || photos.busy || (!draft.trim() && !context && !photos.items.length))}
      renderIcon={(color, size) => <NavigationIcon name={turn?.state === "streaming" ? "close" : "arrow-right"} color={color} size={size} />}
      onPress={() => {
        if (turn?.state === "streaming") { send.current?.abort(); return; }
        const question = draft.trim() || contextualQuestion;
        if (!question && !photos.items.length) return;
        void submit({ courseId, pathname, question, requestId: randomUUID(), persistHistory: true,
          sessionId: photoSessionId ?? history.history?.sessionId ?? null,
          attachmentIds: photos.items.length ? photos.items.map(item => item.uploaded.id) : undefined, responseLanguage: locale,
          selectionContext: context?.kind === "selection" ? { snippet: context.snippet, sectionTitle: context.sectionTitle, chapterTitle: context.chapterTitle, intent: context.intent } : undefined,
          codingContext: context?.kind === "playground" ? context : undefined });
      }} />
  </View></> : null;

  return <>
    {launcher ? <Button ref={trigger} theme={theme} size="icon-lg" variant="outline" accessibilityLabel={t.open} accessibilityState={{ expanded: open }}
      testID="student-zyra-open" renderIcon={(color, size) => <NavigationIcon name="discuss" color={color} size={size} />}
      disabled={!open && turn?.state === "streaming"}
      onPress={() => {
        if (!current()) return;
        setOpen(true); tour?.("zyra");
        void load(photoSessionId ?? history?.history?.sessionId);
      }} /> : null}
    <SharedSheet open={open} theme={theme} title="Zyra" closeLabel={t.close} returnFocusRef={trigger} onDismiss={dismiss}
      testID="student-zyra" footer={composer} bodyScrollRef={scroll}
      onBodyScroll={({ nativeEvent }) => {
        scrollY.current = nativeEvent.contentOffset.y;
        follow.current = nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height - scrollY.current <= 44;
      }}
      onBodyContentSizeChange={(_width, height) => {
        if (prepending.current) {
          prepending.current = false;
          scroll.current?.scrollTo({ y: scrollY.current + Math.max(0, height - contentHeight.current), animated: false });
        } else if (follow.current && !historyMode) scroll.current?.scrollToEnd({ animated: false });
        contentHeight.current = height;
      }}>
      {readState === "loading" ? <ActivityIndicator accessibilityLabel={t.loading} color={colors.primary} /> : null}
      {readState === "error" || readState === "denied" ? <View style={styles.actions}>
        <Text accessibilityRole="alert" style={body}>{readState === "denied" ? t.denied : t.error}</Text>
        <Button theme={theme} variant="outline" onPress={() => void load(photoSessionId ?? history?.history?.sessionId)}>{t.retry}</Button>
      </View> : null}
      {history && !readState ? <>
        <View style={styles.actions}>
          <Button theme={theme} variant="ghost" disabled={Boolean(turn) || photos.busy || !!photos.items.length} accessibilityState={{ expanded: historyMode }}
            onPress={() => { follow.current = !historyMode; setHistoryMode(!historyMode); }}>{historyMode ? t.backToChat : t.history}</Button>
          <Button theme={theme} variant="ghost" disabled={Boolean(turn) || photos.busy || !!photos.items.length} onPress={() => {
            follow.current = true;
            setHistory({ ...history, history: null }); setHistoryMode(false); setDraft("");
          }}>{t.newChat}</Button>
        </View>
        {historyMode ? history.sessions.length ? history.sessions.map(item => <NativeListRow key={item.id} theme={theme} layout="compact" title={item.title}
          primary={{ onPress: () => void load(item.id), testID: `student-zyra-session-${item.id}` }} />) : <Text style={muted}>{t.empty}</Text> : <>
          {history.tier === "free" && !history.history ? <Text style={muted}>{t.free}</Text> : null}
          {history.history && history.history.messages.length > visibleCount ? <Button theme={theme} variant="ghost" onPress={() => {
            follow.current = false; prepending.current = true; setVisibleCount(count => count + 20);
          }}>{t.earlier}</Button> : null}
          {[
            ...(history.history?.messages.slice(-visibleCount) ?? []),
            ...(turn ? [
              { id: turn.data.request.requestId + ":student", role: "student" as const, content: turn.data.request.question, attachments: undefined },
              { id: turn.data.request.requestId + ":ai", role: "ai" as const, content: turn.data.response, canvasSpec: turn.data.canvasSpec },
            ] : []),
          ].map((message, index, messages) => message.role === "student" ? <View key={message.id} style={styles.savedQuestion}>
            {message.content ? <Text style={[body, styles.question, { backgroundColor: colors.muted }]}>{message.content}</Text> : null}
            {history.imageInput && message.attachments?.length && history.history ? <ZyraSavedPhotos {...photoOptions} theme={theme}
              sessionId={history.history.sessionId} items={message.attachments} selected={shownImage} select={setShownImage} /> : null}
          </View> : <View key={message.id} style={styles.answer}>
            {message.content ? <CourseMarkdown source={message.content} services={services} theme={theme} allowLinks={turn?.state !== "streaming" || message.id !== turn.data.request.requestId + ":ai"} /> : null}
            {history.tier === "standard" && message.canvasSpec ? <LearningCanvas spec={message.canvasSpec} locale={locale} theme={theme} origin={origin}
              initialExpanded={index === messages.length - 1} /> : null}
          </View>)}
          {turn ? <>
            {turn.state === "streaming" ? <Text accessibilityLiveRegion="polite" style={muted}>{turn.data.stage || t.thinking}</Text> : null}
            {notice ? <Text accessibilityRole="alert" style={body}>{notice}</Text> : null}
            {receiptState === "missing" || receiptState === "error" ? <Text accessibilityLiveRegion="polite" style={muted}>{receiptState === "missing" ? t.receiptMissing : t.error}</Text> : null}
            {turn.state === "uncertain" ? <View style={styles.actions}>
              <Button theme={theme} variant="outline" isLoading={receiptState === "checking"} onPress={() => void checkReceipt()}>{t.check}</Button>
              <Button theme={theme} variant="ghost" disabled={receiptState === "checking"} onPress={() => { photos.clear(); setTurn(null); setReceiptState(null); }}>{t.continue}</Button>
            </View> : null}
            {turn.state === "retry" ? <View style={styles.actions}>
              <Button theme={theme} variant="outline" onPress={() => void submit(turn.data.request)}>{t.retry}</Button>
              <Button theme={theme} variant="ghost" onPress={() => { setDraft(turn.data.request.question); setTurn(null); }}>{t.close}</Button>
            </View> : null}
            {turn.state === "unsaved" ? <Button theme={theme} variant="ghost" onPress={() => { photos.clear(); setTurn(null); }}>{t.close}</Button> : null}
          </> : null}
        </>}
      </> : null}
    </SharedSheet>
  </>;
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  text: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 21, includeFontPadding: false },
  question: { alignSelf: "flex-end", maxWidth: "90%", paddingHorizontal: 12, paddingVertical: 8, borderRadius: nativeRadii.lg },
  savedQuestion: { gap: 6 },
  answer: { gap: 8 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  context: { flex: 1, minWidth: 0 },
  input: { flex: 1, width: 0, minWidth: 0, minHeight: 44, maxHeight: 128 },
});
