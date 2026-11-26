import { randomUUID } from "expo-crypto";
import { getStringAsync, setStringAsync } from "expo-clipboard";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { nativeColors } from "../../../../../packages/design-tokens/native-colors";
import { Button } from "../../../components/Button";
import { normalizeReadingSelection, readingSelectionKeys, type ReadingSelectionKey } from "../../../offline/reading-selection";
import type { ReadingContent } from "../../../offline/reading-document";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import type { StudentRequest, StudentServices, StudentSession } from "../contracts";
import { useOpenCourseZyra, type CourseZyraContextInput } from "../zyra/context";
import { OnlineReadingError, readOnlineMaterial, type OnlineReadingContent } from "./online-reading";
import { ReadingStudy } from "./ReadingStudy";

type ReaderProps = {
  request: StudentRequest;
  session: StudentSession;
  drafts?: StudentServices["drafts"];
  recordOfflineReadingVisit?: StudentServices["recordOfflineReadingVisit"];
  kind: ReadingContent["kind"];
  courseId: string;
  materialId: string;
  locale: ReadingContent["locale"];
  section?: string;
  title: string;
  theme: keyof typeof nativeColors;
  openWeb?: () => void;
  reloadDetail(): void;
};

export function OnlineReading(props: ReaderProps) {
  const { suspended, canInteract } = useProtectedInteraction();
  const [open, setOpen] = useState(false);
  const openZyra = useOpenCourseZyra();
  const quote = useRef<CourseZyraContextInput | null>(null);
  const changed = useRef(false);
  const id = props.locale === "id";
  const close = () => {
    setOpen(false);
    if (changed.current) { changed.current = false; props.reloadDetail(); }
  };
  const sendQuote = () => {
    const selection = quote.current;
    quote.current = null;
    if (selection && canInteract()) openZyra?.(selection);
  };
  const ask = openZyra ? (snippet: string, sectionTitle?: string) => {
    quote.current = { kind: "selection", snippet, chapterTitle: props.title, sectionTitle };
    close();
    if (Platform.OS !== "ios") requestAnimationFrame(sendQuote);
  } : undefined;
  return <>
    <Button theme={props.theme} testID="student-open-native-reading" onPress={() => { if (canInteract()) setOpen(true); }}>
      {id ? "Baca materi" : "Read material"}
    </Button>
    <Modal visible={open && !suspended} animationType="none" presentationStyle="fullScreen" onRequestClose={close} onDismiss={sendQuote}>
      {open && !suspended ? <OnlineReadingPage {...props} close={close} ask={ask} onCompleted={() => { changed.current = true; }} /> : null}
    </Modal>
  </>;
}

function OnlineReadingPage({ request, session, kind, courseId, materialId, locale, section, title, theme, close, openWeb, drafts, ask, onCompleted, recordOfflineReadingVisit }: ReaderProps & {
  close(): void; onCompleted(): void; ask?: (snippet: string, sectionTitle?: string) => void;
}) {
  const { canInteract } = useProtectedInteraction();
  const [state, setState] = useState<{ content: OnlineReadingContent } | { status: number } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [copyFailed, setCopyFailed] = useState(false);
  const [emptyClipboard, setEmptyClipboard] = useState(false);
  const alive = useRef(true);
  const [visitId] = useState(randomUUID);
  const recordedVisit = useRef(false);
  const hasContent = Boolean(state && "content" in state);
  const colors = nativeColors[theme];
  const id = locale === "id";
  useEffect(() => {
    const ctrl = new AbortController();
    readOnlineMaterial(request, { courseId, materialId, kind, section }, locale, ctrl.signal).then(content => {
      if (!ctrl.signal.aborted && canInteract()) setState({ content });
    }, (error: unknown) => {
      if (!ctrl.signal.aborted && canInteract()) setState({ status: error instanceof OnlineReadingError ? error.status : 0 });
    });
    return () => ctrl.abort();
  }, [attempt, canInteract, courseId, kind, locale, materialId, request, section]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!hasContent || !recordOfflineReadingVisit || recordedVisit.current || !canInteract()) return;
    recordedVisit.current = true;
    void recordOfflineReadingVisit({ kind, courseId, id: materialId }, visitId).catch(() => {});
  }, [canInteract, courseId, hasContent, kind, materialId, recordOfflineReadingVisit, visitId]);

  function onSelection(key: ReadingSelectionKey, selected: unknown, sectionTitle?: string) {
    if (!canInteract() || !alive.current) return;
    const snippet = normalizeReadingSelection(selected, key === readingSelectionKeys.copy ? "clipboard" : "quote");
    if (!snippet) { setEmptyClipboard(true); return; }
    if (key === readingSelectionKeys.ask) ask?.(snippet, sectionTitle);
    else {
      setCopyFailed(false);
      void setStringAsync(snippet).catch(() => false).then(copied => {
        if (!copied && alive.current && canInteract()) setCopyFailed(true);
      });
    }
  }

  const status = state && "status" in state ? state.status : null;
  const forbidden = status === 401 || status === 403;
  const web = !forbidden && (status === 404 || status === 413);
  function reload() { if (canInteract()) { setState(null); setAttempt(value => value + 1); } }
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} testID="student-native-reading-screen">
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderBottomWidth: 1, borderColor: colors.border }}>
      <Button theme={theme} variant="outline" onPress={close}>{id ? "Kembali" : "Back"}</Button>
      <Text accessibilityRole="header" numberOfLines={2} style={{ color: colors.foreground, fontSize: 16, fontWeight: "600", flex: 1 }}>{title}</Text>
    </View>
    {copyFailed && <Text accessibilityRole="alert" style={{ color: colors.mutedForeground, paddingHorizontal: 12 }}>
      {id ? "Teks belum dapat disalin." : "Could not copy the text."}
    </Text>}
    {state && "content" in state && ask && ((Platform.OS !== "ios" && Platform.OS !== "android") || emptyClipboard) ? <View style={{ paddingHorizontal: 12, paddingVertical: 4 }}>
      <Button theme={theme} variant="ghost" style={{ alignSelf: "flex-start" }} onPress={() => {
        if (!canInteract()) return;
        void getStringAsync().then(value => {
          if (!alive.current || !canInteract()) return;
          const snippet = normalizeReadingSelection(value);
          if (snippet) ask(snippet);
          else setEmptyClipboard(true);
        }).catch(() => { if (alive.current && canInteract()) setEmptyClipboard(true); });
      }}>{id ? "Tanya Zyra tentang teks yang disalin" : "Ask Zyra about copied text"}</Button>
      {emptyClipboard ? <Text accessibilityRole="alert" style={{ color: colors.mutedForeground }}>
        {id ? "Salin teks bacaan terlebih dahulu." : "Copy text from the reading first."}
      </Text> : null}
    </View> : null}
    {state && "content" in state ? <ReadingStudy key={state.content.revision} content={state.content} courseId={courseId} request={request}
      session={session} theme={theme} drafts={drafts} openWeb={openWeb} onSelection={ask ? onSelection : undefined} onCompleted={onCompleted} reload={reload} />
      : !state ? <ActivityIndicator style={{ margin: 20 }} accessibilityLabel={id ? "Memuat bacaan" : "Loading reading"} />
      : <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text accessibilityRole="alert" style={{ color: colors.foreground }}>
          {forbidden ? id ? "Akses bacaan berakhir." : "Access to this reading ended."
            : id ? "Bacaan belum dapat dibuka." : "This reading is unavailable."}
        </Text>
        {web && openWeb ? <Button theme={theme} onPress={() => { if (canInteract()) openWeb(); }}>
          {id ? "Buka di web" : "Open on the web"}
        </Button> : !forbidden ? <Button theme={theme} onPress={reload}>{id ? "Coba lagi" : "Try again"}</Button> : null}
      </ScrollView>}
  </SafeAreaView>;
}
