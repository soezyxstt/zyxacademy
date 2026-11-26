import * as Clipboard from "expo-clipboard";
import { randomUUID } from "expo-crypto";
import { useEffect, useMemo, useRef, useState, type ComponentRef, type RefObject } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useOpsAiChat } from "../../../../../lib/admin-ops-ai/chat-client";
import { OPS_AI_POLICY_BOUNDS, OpsAiActionProposalV2Schema, type OpsAiActionProposalV2 } from "../../../../../lib/admin-ops-ai/chat-contract";
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
import { approvalPayload, createOpsAiClient, opsChatContext, type ApprovalChoice, type ApprovalReply } from "./client";

const labels = {
  id: {
    close: "Tutup", ask: "Tanya", edit: "Aksi", newChat: "Chat baru", message: "Tulis pesan",
    send: "Kirim pesan", stop: "Hentikan respons", working: "Menyiapkan respons", sources: "Sumber",
    steps: "Aktivitas", once: "Izinkan sekali", chat: "Izinkan di chat", expired: "Persetujuan kedaluwarsa",
    denied: "Akses Admin perlu diperiksa kembali.", unknown: "Hasil aksi belum terverifikasi. Periksa dengan persetujuan yang sama.",
    check: "Periksa hasil", failed: "Aksi belum selesai. Periksa target sebelum meminta aksi lagi.",
    revoke: "Akhiri izin chat", revokeError: "Izin chat belum dapat diakhiri. Coba lagi.", completed: "Aksi selesai.",
    copy: "Salin token", copied: "Token disalin", media: "Gambar", bounded: "Izin untuk aksi dan target yang sama, hingga 10 menit.",
  },
  en: {
    close: "Close", ask: "Ask", edit: "Action", newChat: "New chat", message: "Write a message",
    send: "Send message", stop: "Stop response", working: "Preparing response", sources: "Sources",
    steps: "Activity", once: "Allow once", chat: "Allow in this chat", expired: "Approval expired",
    denied: "Admin access needs to be verified again.", unknown: "The action outcome is uncertain. Check with the same approval.",
    check: "Check outcome", failed: "The action did not complete. Check the target before requesting it again.",
    revoke: "End chat permissions", revokeError: "Chat permissions could not be ended. Try again.", completed: "Action complete.",
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
  returnFocusRef: RefObject<OverlayFocusTarget | null>;
};

type Outcome = { state: "done"; result?: ApprovalReply["result"] } |
  { state: "error"; text: string; retryChoice?: ApprovalChoice };

export function OpsAiWorkspace({ open, uri, theme, locale, session, close, returnFocusRef }: Props) {
  const colors = nativeColors[theme];
  const t = labels[locale];
  const [chatId, setChatId] = useState(randomUUID);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"ask" | "edit">("ask");
  const [grants, setGrants] = useState<Record<string, number>>({});
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now);
  const operation = useRef<AbortController | null>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const client = useMemo(() => createOpsAiClient(session), [session]);
  const { canInteract, suspended } = useProtectedInteraction();
  const { messages, setMessages, input, setInput, sendMessage, isStreaming, stop } = useOpsAiChat({
    request: client.request,
    context: opsChatContext(uri, mode),
    onSessionTitle: (nextTitle, id) => { if (id === chatId && session.isCurrent()) setTitle(nextTitle); },
  });
  const liveGrants = Object.keys(grants).filter(id => grants[id] > now);

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [open]);

  useEffect(() => {
    if (!open || suspended) stop();
  }, [open, suspended, stop]);

  useEffect(() => () => operation.current?.abort(), [session]);

  function current() {
    return open && !suspended && canInteract() && session.isCurrent();
  }

  function send(text = input, nextMode = mode) {
    if (!current() || operation.current || isStreaming || !text.trim()) return;
    setMode(nextMode);
    setNotice("");
    const grantIds = Object.keys(grants).filter(id => grants[id] > Date.now()).slice(-8);
    void sendMessage(text, { chatId, mode: nextMode, grantIds, needsTitle: !title && !messages.length });
  }

  function clearChat() {
    setChatId(randomUUID());
    setTitle("");
    setMessages([]);
    setInput("");
    setGrants({});
    setOutcomes({});
    setNotice("");
  }

  async function approve(proposal: OpsAiActionProposalV2, choice: ApprovalChoice, verify = false) {
    if (!current() || operation.current || isStreaming || !OpsAiActionProposalV2Schema.safeParse(proposal).success) return;
    if (verify ? outcomes[proposal.id]?.state !== "error" : proposal.status !== "pending" || Boolean(outcomes[proposal.id]) ||
      (proposal.expiresAt !== undefined && proposal.expiresAt <= Date.now())) return;
    const payload = approvalPayload(proposal, chatId, choice);
    const controller = new AbortController();
    operation.current = controller;
    setPending(proposal.id);
    setNotice("");
    try {
      const { ok, status, data } = await client.execute(payload, controller.signal);
      if (controller.signal.aborted || !session.isCurrent()) return;
      if (ok) {
        setOutcomes(previous => ({ ...previous, [proposal.id]: { state: "done", result: data?.result } }));
        if (choice === "chat" && typeof data?.grantUntil === "number" && data.grantUntil > Date.now()) {
          const until = data.grantUntil;
          setGrants(previous => ({ ...previous, [proposal.id]: until }));
        }
      } else {
        const denied = status === 401 || status === 403;
        const retryable = data?.retryable === true || status >= 500;
        setOutcomes(previous => ({ ...previous, [proposal.id]: {
          state: "error",
          text: denied ? t.denied : retryable ? t.unknown : (locale === "id" && data?.error) || t.failed,
          ...(retryable && !denied ? { retryChoice: choice } : {}),
        } }));
      }
    } catch (error) {
      if (!controller.signal.aborted && session.isCurrent()) {
        const denied = error instanceof NativeRequestNotDispatched;
        setOutcomes(previous => ({ ...previous, [proposal.id]: {
          state: "error", text: denied ? t.denied : t.unknown, retryChoice: choice,
        } }));
      }
    } finally {
      if (operation.current === controller) {
        operation.current = null;
        setPending(null);
      }
    }
  }

  async function revoke(reset: boolean) {
    if (!current() || operation.current || isStreaming) return;
    const ids = Object.keys(grants).filter(id => grants[id] > Date.now());
    if (!ids.length) { if (reset) clearChat(); return; }
    const controller = new AbortController();
    operation.current = controller;
    setPending("revoke");
    setNotice("");
    try {
      for (let i = 0; i < ids.length; i += 8) {
        const { ok } = await client.execute({ chatId, revokeGrantIds: ids.slice(i, i + 8) }, controller.signal);
        if (!ok) throw new Error();
      }
      if (!controller.signal.aborted && session.isCurrent()) {
        if (reset) clearChat();
        else setGrants({});
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

  const blocked = pending !== null || suspended;
  const text = [styles.text, { color: colors.foreground }];
  const muted = [styles.small, { color: colors.mutedForeground }];

  function proposalCard(proposal: OpsAiActionProposalV2) {
    const parsed = OpsAiActionProposalV2Schema.safeParse(proposal);
    if (!parsed.success) return null;
    const outcome = outcomes[proposal.id];
    const expired = proposal.expiresAt !== undefined && proposal.expiresAt <= now;
    const canApprove = proposal.status === "pending" && !expired && !outcome && (proposal.type !== "admin_operation" || proposal.approval != null);
    const token = outcome?.state === "done" ? outcome.result?.token : undefined;
    return <View key={proposal.id} style={[styles.proposal, { borderColor: colors.border }]}>
      <Text accessibilityRole="header" style={[text, nativeTypography.bodySemibold]}>{proposal.title}</Text>
      <Text style={text}>{proposal.preview.summary}</Text>
      {proposal.preview.targetEntity ? <Text style={text}>{proposal.preview.targetEntity}</Text> : null}
      {proposal.preview.fields?.map(({ label, value }, index) => <Text key={index} style={muted}>{label} · {value}</Text>)}
      {outcome?.state === "done" ? <Text accessibilityLiveRegion="polite" style={text}>{outcome.result?.message || t.completed}</Text> : null}
      {outcome?.state === "error" ? <Text accessibilityRole="alert" style={text}>{outcome.text}</Text> : null}
      {proposal.status === "pending" && expired && !outcome ? <Text style={muted}>{t.expired}</Text> : null}
      {token ? <Button theme={theme} variant="outline" onPress={() => {
        if (current()) void Clipboard.setStringAsync(token).then(() => { if (session.isCurrent()) setNotice(t.copied); }).catch(() => {});
      }}>{t.copy}</Button> : null}
      {canApprove && proposal.approval === "chat" ? <Text style={muted}>{t.bounded}</Text> : null}
      <View style={styles.row}>
        {canApprove && <Button theme={theme} disabled={blocked || isStreaming} isLoading={pending === proposal.id}
          onPress={() => void approve(proposal, "once")}>{t.once}</Button>}
        {canApprove && proposal.approval === "chat" && <Button theme={theme} variant="outline" disabled={blocked || isStreaming}
          onPress={() => void approve(proposal, "chat")}>{t.chat}</Button>}
        {outcome?.state === "error" && outcome.retryChoice && <Button theme={theme} variant="outline" disabled={blocked || isStreaming}
          isLoading={pending === proposal.id} onPress={() => void approve(proposal, outcome.retryChoice!, true)}>{t.check}</Button>}
      </View>
    </View>;
  }

  return <SharedSheet open={open} title={title || "Zyx Ops AI"} closeLabel={t.close} theme={theme}
    onDismiss={close} dismissDisabled={pending !== null} returnFocusRef={returnFocusRef} testID="admin-ops-ai-drawer"
    bodyScrollRef={scroll} onBodyContentSizeChange={() => { if (isStreaming) scroll.current?.scrollToEnd({ animated: false }); }}
    footer={<View style={styles.composer}>
      <View style={styles.row}>
        {(["ask", "edit"] as const).map(value => <Button key={value} theme={theme} variant={mode === value ? "secondary" : "ghost"}
          accessibilityState={{ selected: mode === value }} disabled={blocked || isStreaming} onPress={() => setMode(value)}>{t[value]}</Button>)}
        {messages.length ? <Button theme={theme} variant="ghost" disabled={blocked || isStreaming}
          onPress={() => void revoke(true)}>{t.newChat}</Button> : null}
      </View>
      <View style={styles.inputRow}>
        <Input theme={theme} multiline maxLength={OPS_AI_POLICY_BOUNDS.maxMessageCharLength} accessibilityLabel={t.message}
          placeholder={t.message} value={input} onChangeText={setInput} disabled={blocked} style={styles.input} />
        <Button theme={theme} size="icon-lg" accessibilityLabel={isStreaming ? t.stop : t.send}
          disabled={blocked || (!isStreaming && !input.trim())}
          renderIcon={(color, size) => <NavigationIcon name={isStreaming ? "close" : "send"} color={color} size={size} />}
          onPress={() => { if (isStreaming) stop(); else send(); }} />
      </View>
    </View>}>
    {liveGrants.length > 0 && <View style={styles.row}>
      <Button theme={theme} variant="outline" disabled={blocked || isStreaming}
        isLoading={pending === "revoke"} onPress={() => void revoke(false)}>{`${t.revoke} (${liveGrants.length})`}</Button>
    </View>}
    {notice ? <Text accessibilityLiveRegion="polite" style={text}>{notice}</Text> : null}
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
          {message.citations?.length ? <View style={styles.message}>
            <Text style={[text, nativeTypography.bodySemibold]}>{t.sources}</Text>
            {message.citations.map(citation => <View key={citation.id}>
              <Text style={text}>{citation.title}</Text>
              <Text style={muted}>{citation.snippet}</Text>
            </View>)}
          </View> : null}
          {message.proposals?.map(proposalCard)}
          {message === messages.at(-1) && !isStreaming && message.followups?.length ? <View style={styles.row}>
            {message.followups.map(followup => <Button key={followup.prompt} theme={theme} variant="outline" disabled={blocked}
              onPress={() => send(followup.prompt, followup.mode ?? mode)}>{followup.label}</Button>)}
          </View> : null}
        </>}
    </View>)}
    {isStreaming ? <Text accessibilityLiveRegion="polite" style={muted}>{t.working}</Text> : null}
  </SharedSheet>;
}

const styles = StyleSheet.create({
  composer: { gap: 8 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  input: { flex: 1, width: "auto", minHeight: 44, maxHeight: 116 },
  message: { gap: 8, minWidth: 0 },
  text: { ...nativeTypography.bodyRegular, fontSize: 16, lineHeight: 23 },
  small: { ...nativeTypography.bodyRegular, fontSize: 12, lineHeight: 18 },
  proposal: { borderWidth: 1, borderRadius: nativeRadii.lg, padding: 12, gap: 8 },
  user: { borderRadius: nativeRadii.md, padding: 10, alignSelf: "flex-end" },
});
