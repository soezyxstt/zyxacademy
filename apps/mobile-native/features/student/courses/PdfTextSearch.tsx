import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { nativeColors } from "../../../../../packages/design-tokens/native-colors";
import { maxPdfSearchPages, type PdfSearchInput, type PdfSearchResult } from "../../../../../packages/native-parity/student/courses/pdf-search";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { NativeListRow } from "../../shared-ui/layout";

export type ReaderPdfSearch = { revision: string; run(input: PdfSearchInput, signal: AbortSignal): Promise<PdfSearchResult> };
type SearchPage = { from: number; until: number; result: PdfSearchResult };

export function PdfTextSearch({ search, total, onOpen, theme, en }: {
  search: ReaderPdfSearch; total: number; onOpen(page: number): void; theme: keyof typeof nativeColors; en: boolean;
}) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<SearchPage>();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const t = (id: string, english: string) => en ? english : id;
  const color = nativeColors[theme];

  async function scan(from: number) {
    if (active.current || query.trim().length < 2 || from < 1 || from > total) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setFailed(false);
    const to = Math.min(total, from + maxPdfSearchPages - 1);
    try {
      const result = await search.run({ revision: search.revision, query, from, to }, controller.signal);
      if (!controller.signal.aborted) setFound({ from, until: to, result });
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (active.current === controller) active.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return <>
    <Input theme={theme} testID="student-pdf-query" accessibilityLabel={t("Cari teks PDF", "Search PDF text")} placeholder={t("Cari teks PDF", "Search PDF text")}
      value={query} onChangeText={value => { setQuery(value); setFound(undefined); setFailed(false); }}
      maxLength={120} disabled={pending} returnKeyType="search" onSubmitEditing={() => void scan(1)} />
    <Button theme={theme} testID="student-pdf-search-submit" isLoading={pending} disabled={query.trim().length < 2} onPress={() => void scan(1)}>{t("Cari", "Search")}</Button>
    {failed && <Text accessibilityRole="alert" style={{ color: color.destructive }}>{t("PDF belum dapat dicari. Coba lagi.", "PDF search is unavailable. Try again.")}</Text>}
    {found && <>
      <Text accessibilityLiveRegion="polite" style={{ color: color.mutedForeground }}>
        {t("Halaman", "Pages")} {found.from} sampai {found.until} · {found.result.matches.length} {t("hasil", "matches")}
      </Text>
      {found.result.matches.map(hit => <NativeListRow testID={`student-pdf-search-result-${hit.page}`} layout="compact" key={hit.page} theme={theme} title={t("Halaman", "Page") + " " + hit.page}
        subtitle={hit.excerpt} primary={{ role: "button", label: t("Buka halaman", "Go to page") + " " + hit.page, onPress: () => onOpen(hit.page) }} />)}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {found.from > 1 && <Button theme={theme} variant="outline" disabled={pending}
          onPress={() => void scan(Math.max(1, found.from - maxPdfSearchPages))}>{t("Cari halaman sebelumnya", "Search earlier pages")}</Button>}
        {found.until < Math.min(total, found.result.total) && <Button theme={theme} variant="outline" disabled={pending}
          onPress={() => void scan(found.until + 1)}>{t("Cari halaman berikutnya", "Search more pages")}</Button>}
      </View>
    </>}
  </>;
}
