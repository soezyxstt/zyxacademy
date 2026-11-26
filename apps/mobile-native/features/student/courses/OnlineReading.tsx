import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { nativeColors } from "../../../../../packages/design-tokens/native-colors";
import { Button } from "../../../components/Button";
import { ReadingContentDocument } from "../../../offline/ReadingDocument";
import type { ReadingContent } from "../../../offline/reading-document";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import type { StudentRequest } from "../contracts";
import { OnlineReadingError, readOnlineMaterial } from "./online-reading";

type ReaderProps = {
  request: StudentRequest;
  kind: ReadingContent["kind"];
  courseId: string;
  materialId: string;
  locale: ReadingContent["locale"];
  section?: string;
  title: string;
  theme: keyof typeof nativeColors;
  openWeb?: () => void;
};

export function OnlineReading(props: ReaderProps) {
  const { suspended, canInteract } = useProtectedInteraction();
  const [open, setOpen] = useState(false);
  const id = props.locale === "id";
  const close = () => setOpen(false);
  return <>
    <Button theme={props.theme} testID="student-open-native-reading" onPress={() => { if (canInteract()) setOpen(true); }}>
      {id ? "Baca materi" : "Read material"}
    </Button>
    <Modal visible={open && !suspended} animationType="none" presentationStyle="fullScreen" onRequestClose={close}>
      {open && !suspended ? <OnlineReadingPage {...props} close={close} /> : null}
    </Modal>
  </>;
}

function OnlineReadingPage({ request, kind, courseId, materialId, locale, section, title, theme, close, openWeb }: ReaderProps & { close(): void }) {
  const { canInteract } = useProtectedInteraction();
  const [state, setState] = useState<{ content: ReadingContent } | { status: number } | null>(null);
  const [attempt, setAttempt] = useState(0);
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

  const status = state && "status" in state ? state.status : null;
  const forbidden = status === 401 || status === 403;
  const web = !forbidden && (status === 404 || status === 413);
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} testID="student-native-reading-screen">
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderBottomWidth: 1, borderColor: colors.border }}>
      <Button theme={theme} variant="outline" onPress={close}>{id ? "Kembali" : "Back"}</Button>
      <Text accessibilityRole="header" numberOfLines={2} style={{ color: colors.foreground, fontSize: 16, fontWeight: "600", flex: 1 }}>{title}</Text>
    </View>
    {state && "content" in state ? <ReadingContentDocument content={state.content} testID="student-online-reading-document" />
      : !state ? <ActivityIndicator style={{ margin: 20 }} accessibilityLabel={id ? "Memuat bacaan" : "Loading reading"} />
      : <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text accessibilityRole="alert" style={{ color: colors.foreground }}>
          {forbidden ? id ? "Akses bacaan berakhir." : "Access to this reading ended."
            : id ? "Bacaan belum dapat dibuka." : "This reading is unavailable."}
        </Text>
        {web && openWeb ? <Button theme={theme} onPress={() => { if (canInteract()) openWeb(); }}>
          {id ? "Buka di web" : "Open on the web"}
        </Button> : !forbidden ? <Button theme={theme} onPress={() => {
          if (canInteract()) { setState(null); setAttempt(value => value + 1); }
        }}>{id ? "Coba lagi" : "Try again"}</Button> : null}
      </ScrollView>}
  </SafeAreaView>;
}
