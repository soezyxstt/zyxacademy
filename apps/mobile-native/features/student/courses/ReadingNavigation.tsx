import { useState } from "react";
import { Text } from "react-native";
import { nativeColors } from "../../../../../packages/design-tokens/native-colors";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { NativeListRow } from "../../shared-ui/layout";
import { SharedDialog } from "../../shared-ui/overlays";
import { findReadingSections, type ReadingNavigationItem, type ReadingSearchMatch } from "./reading-search";

type Props = {
  items: ReadingNavigationItem[];
  locale: "id" | "en";
  theme: keyof typeof nativeColors;
  onOpen(item: ReadingSearchMatch, query: string): void;
};

export function ReadingNavigation({ items, locale, theme, onOpen }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const id = locale === "id";
  const matches = open ? findReadingSections(items, query) : [];
  return <>
    <Button theme={theme} variant="outline" testID="student-reader-open-outline" onPress={() => setOpen(true)}>
      {id ? "Daftar isi dan cari" : "Contents and search"}
    </Button>
    {open && <SharedDialog open title={id ? "Daftar isi" : "Contents"} closeLabel={id ? "Tutup" : "Close"}
      theme={theme} onDismiss={() => { setOpen(false); setQuery(""); }}>
      <Input theme={theme} value={query} onChangeText={setQuery} maxLength={120}
        testID="student-reader-query" accessibilityLabel={id ? "Cari di bacaan" : "Search reading"} placeholder={id ? "Cari di bacaan" : "Search reading"} />
      {matches.map(item => <NativeListRow layout="compact" key={item.id} theme={theme} title={item.title} subtitle={item.snippet || undefined}
        primary={{ role: "button", label: item.snippet ? `${item.title}. ${item.snippet}` : item.title, testID: "student-reader-result-" + item.id, onPress: () => { onOpen(item, query.trim()); setOpen(false); setQuery(""); } }} />)}
      {!matches.length && <Text style={{ color: nativeColors[theme].mutedForeground }}>
        {id ? "Tidak ada hasil." : "No matches."}
      </Text>}
    </SharedDialog>}
  </>;
}
