import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Pdf from "react-native-pdf";
import { nativeColors, nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import { Button } from "../../../components/Button";
import { pdfThumbnailPageCount, pdfThumbnailPages } from "./pdf-reader-model";

type Theme = keyof typeof nativeColors;
const toolbar = { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 };

export function PdfThumbnailGrid({ uri, page, total, en, theme, onOpen }: {
  uri: string; page: number; total: number; en: boolean; theme: Theme; onOpen(page: number): void;
}) {
  const [cursor, setCursor] = useState(page);
  const pages = pdfThumbnailPages(cursor, total);
  const first = pages[0] ?? 1;
  const last = pages.at(-1) ?? 0;
  const source = useMemo(() => ({ uri, cache: false }), [uri]);
  return <>
    <View style={toolbar}>
      <Button theme={theme} variant="outline" disabled={first <= 1} onPress={() => setCursor(Math.max(1, first - pdfThumbnailPageCount))}>
        {en ? "Previous previews" : "Pratinjau sebelumnya"}
      </Button>
      <Button theme={theme} variant="outline" disabled={last >= total} onPress={() => setCursor(last + 1)}>
        {en ? "More previews" : "Pratinjau berikutnya"}
      </Button>
    </View>
    <View style={toolbar} testID="student-pdf-thumbnail-grid">
      {pages.map(value => <PdfThumbnail key={value} source={source} page={value} selected={page === value} en={en} theme={theme} onOpen={onOpen} />)}
    </View>
  </>;
}

function PdfThumbnail({ source, page, selected, en, theme, onOpen }: {
  source: { uri: string; cache: boolean }; page: number; selected: boolean; en: boolean; theme: Theme; onOpen(page: number): void;
}) {
  const [failed, setFailed] = useState(false);
  const colors = nativeColors[theme];
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={(en ? "Open page " : "Buka halaman ") + page}
    onPress={() => onOpen(page)} style={({ pressed }) => ({ flexBasis: "47%", flexGrow: 1, padding: 6, gap: 5, borderWidth: 1,
      borderColor: selected ? colors.primary : colors.border, borderRadius: nativeRadii.md, backgroundColor: pressed ? colors.muted : colors.card })}>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ height: 140, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }}>
      {failed ? <Text style={{ color: colors.mutedForeground }}>{en ? "Preview unavailable" : "Pratinjau tidak tersedia"}</Text>
        : <Pdf source={source} page={page} singlePage scrollEnabled={false} enableDoubleTapZoom={false}
            fitPolicy={2} trustAllCerts={false} style={{ width: "100%", height: "100%" }} onError={() => setFailed(true)} />}
    </View>
    <Text style={{ color: colors.foreground, textAlign: "center" }}>{page}</Text>
  </Pressable>;
}
