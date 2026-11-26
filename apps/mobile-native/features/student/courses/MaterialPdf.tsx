import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Text, View } from "react-native";
import Pdf from "react-native-pdf";
import { SafeAreaView } from "react-native-safe-area-context";
import { nativeColors } from "../../../../../packages/design-tokens/native-colors";
import { Button } from "../../../components/Button";
import type { MaterialPdfResult, PreparedMaterialPdf } from "../../../device/file-controller";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { safeMaterialPdfLink, type StudentPdfReader } from "./pdf-reading";

type Props = {
  reader: StudentPdfReader;
  courseId: string;
  materialId: string;
  title: string;
  page?: number;
  locale: string;
  theme: keyof typeof nativeColors;
  openWeb?: () => void;
  openExternal?: (url: string) => void;
};

export function MaterialPdf(props: Props) {
  const { suspended, canInteract } = useProtectedInteraction();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return <>
    <Button theme={props.theme} testID="student-open-material-pdf" onPress={() => { if (canInteract()) setOpen(true); }}>
      {props.locale === "en" ? "Read PDF" : "Baca PDF"}
    </Button>
    <Modal visible={open && !suspended} animationType="none" presentationStyle="fullScreen" onRequestClose={close}>
      {open && !suspended ? <PdfPage {...props} close={close} /> : null}
    </Modal>
  </>;
}

function PdfPage({ courseId, materialId, reader, title, page, locale, theme, openWeb, openExternal, close }: Props & { close(): void }) {
  const { canInteract } = useProtectedInteraction();
  const access = useRef({ reader, canInteract });
  access.current = { reader, canInteract };
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<MaterialPdfResult | null>(null);
  const [pageLabel, setPageLabel] = useState("");
  const release = useRef<() => void>(() => {});
  const colors = nativeColors[theme];
  const en = locale === "en";
  useEffect(() => {
    const controller = new AbortController();
    const target = { courseId, materialId };
    let document: PreparedMaterialPdf | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let check: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      controller.abort();
      clearTimeout(expiry);
      clearTimeout(check);
      document?.release();
    };
    release.current = stop;
    function fail(result: MaterialPdfResult) {
      stop();
      setPageLabel("");
      setState(result);
    }
    function schedule(until: number) {
      clearTimeout(expiry);
      clearTimeout(check);
      const remaining = until - Date.now();
      if (remaining <= 0) {
        fail({ status: "error", issue: "unauthorized" });
        return;
      }
      expiry = setTimeout(() => fail({ status: "error", issue: "unauthorized" }), remaining);
      check = setTimeout(renew, Math.min(60_000, Math.max(1000, remaining - 3000)));
    }
    async function renew() {
      if (!document || controller.signal.aborted) return;
      const result = await access.current.reader.renew(target, document.revision, controller.signal)
        .catch(() => ({ status: "error", issue: "fetch" } as const));
      if (controller.signal.aborted) return;
      if (result.status === "ready") schedule(result.grant.expiresAt);
      else if (result.status === "error" && result.issue === "fetch") check = setTimeout(renew, 5000);
      else fail(result);
    }
    access.current.reader.open(target, controller.signal).then(result => {
      if (controller.signal.aborted || !access.current.canInteract()) {
        if (result.status === "ready") result.document.release();
        return;
      }
      setState(result);
      if (result.status === "ready") {
        document = result.document;
        schedule(document.expiresAt);
      }
    }, () => { if (!controller.signal.aborted) fail({ status: "error", issue: "fetch" }); });
    return stop;
  }, [attempt, courseId, materialId]);

  const issue = state?.status === "error" ? state.issue : null;
  const denied = issue === "unauthorized" || state?.status === "stale";
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} testID="student-material-pdf-screen">
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderBottomWidth: 1, borderColor: colors.border }}>
      <Button theme={theme} variant="outline" testID="student-material-pdf-close" onPress={close}>{en ? "Back" : "Kembali"}</Button>
      <Text accessibilityRole="header" numberOfLines={2} style={{ flex: 1, color: colors.foreground, fontWeight: "600", fontSize: 16 }}>{title}</Text>
      {pageLabel ? <Text style={{ color: colors.mutedForeground, fontVariant: ["tabular-nums"] }} testID="student-material-pdf-page">{pageLabel}</Text> : null}
    </View>
    {state?.status === "ready" ? <Pdf
      source={{ uri: state.document.uri, cache: false }}
      page={page}
      fitPolicy={0}
      enableAnnotationRendering
      trustAllCerts={false}
      style={{ flex: 1, width: "100%", backgroundColor: colors.card }}
      onPageChanged={(current, total) => setPageLabel(`${current} / ${total}`)}
      onError={() => { release.current(); setPageLabel(""); setState({ status: "error", issue: "type" }); }}
      onPressLink={value => {
        const url = safeMaterialPdfLink(value);
        if (url && canInteract()) openExternal?.(url);
      }}
    /> : !state ? <ActivityIndicator style={{ margin: 20 }} accessibilityLabel={en ? "Loading PDF" : "Memuat PDF"} /> :
      <View style={{ padding: 16, gap: 10 }}>
        <Text accessibilityRole="alert" style={{ color: colors.foreground }}>
          {denied ? en ? "Access to this PDF ended." : "Akses PDF berakhir."
            : en ? "The PDF could not be opened." : "PDF belum dapat dibuka."}
        </Text>
        {!denied ? <>
          <Button theme={theme} onPress={() => {
            if (!canInteract()) return;
            setState(null);
            setAttempt(value => value + 1);
          }}>{en ? "Try again" : "Coba lagi"}</Button>
          {openWeb ? <Button theme={theme} variant="outline" onPress={() => { if (canInteract()) openWeb(); }}>
            {en ? "Open PDF on the web" : "Buka PDF di web"}
          </Button> : null}
        </> : null}
      </View>}
  </SafeAreaView>;
}
