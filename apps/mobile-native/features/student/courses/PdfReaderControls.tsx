import Storage from "expo-sqlite/kv-store";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { nativeColors } from "../../../../../packages/design-tokens/native-colors";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { SharedDialog } from "../../shared-ui/overlays";
import { NativeListRow } from "../../shared-ui/layout";
import { PdfTextSearch, type ReaderPdfSearch } from "./PdfTextSearch";
import { bindPdfAnnotations, maxPdfNoteLength, type PdfAnnotations, type PdfOutlineRow } from "./pdf-reader-model";

export type PdfAnnotationIdentity = { origin: string; userId: string };
type Props = {
  position: { page: number; total: number };
  scale: number;
  outline: PdfOutlineRow[];
  go(page: number): void;
  zoom(scale: number): void;
  theme: keyof typeof nativeColors;
  locale: string;
  testID: string;
  search?: ReaderPdfSearch;
  annotationScope?: PdfAnnotationIdentity & { courseId: string; materialId: string; revision: string; active(): boolean };
};

export function PdfReaderControls({ position, scale, outline, go, zoom, theme, locale, testID, search, annotationScope }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"pages" | "personal" | "search">("pages");
  const [draftPage, setDraftPage] = useState("");
  const [editPage, setEditPage] = useState(1);
  const [draftNote, setDraftNote] = useState("");
  const [notes, setNotes] = useState<PdfAnnotations>();
  const [error, setError] = useState(false);
  const { canInteract } = useProtectedInteraction();
  const en = locale === "en";
  const t = (id: string, english: string) => en ? english : id;
  const colors = nativeColors[theme];
  const text = { color: colors.foreground };
  const { page, total } = position;
  const annotations = useMemo(() => annotationScope ? bindPdfAnnotations({
    read: key => Storage.getItemSync(key), write: (key, value) => Storage.setItemSync(key, value),
  }, annotationScope, () => annotationScope.active() && canInteract(), total) : null, [annotationScope, canInteract, total]);

  function show() {
    if (!canInteract()) return;
    setDraftPage(String(page));
    setEditPage(page);
    setTab("pages");
    setError(false);
    try {
      const data = annotations?.get();
      setNotes(data);
      setDraftNote(data?.notes[page] ?? "");
    } catch { setError(true); }
    setOpen(true);
  }

  function jump(target: number) {
    if (!canInteract() || !Number.isSafeInteger(target) || target < 1 || target > total) return;
    go(target);
    setOpen(false);
  }

  function write(update: () => PdfAnnotations | null | undefined) {
    try {
      const value = update();
      if (!value) { setError(true); return; }
      setNotes(value);
      setError(false);
    } catch { setError(true); }
  }

  return <>
    <Button theme={theme} variant="ghost" size="sm" testID={testID} onPress={show}
      accessibilityLabel={t("Halaman dan pengaturan PDF", "Pages and PDF controls")}>{`${page} / ${total}`}</Button>
    {open && <SharedDialog open title={t("Navigasi PDF", "PDF navigation")} closeLabel={t("Tutup", "Close")}
      theme={theme} onDismiss={() => setOpen(false)}>
      {(annotations || search) && <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button theme={theme} variant={tab === "pages" ? "secondary" : "ghost"} onPress={() => setTab("pages")}>{t("Halaman", "Pages")}</Button>
        {search && <Button theme={theme} variant={tab === "search" ? "secondary" : "ghost"} onPress={() => setTab("search")}>{t("Cari", "Search")}</Button>}
        {annotations && <Button theme={theme} variant={tab === "personal" ? "secondary" : "ghost"} onPress={() => setTab("personal")}>{t("Catatan dan penanda", "Notes and bookmarks")}</Button>}
      </View>}
      {tab === "pages" ? <>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Button theme={theme} variant="outline" disabled={page <= 1} onPress={() => jump(page - 1)}>{t("Sebelumnya", "Previous")}</Button>
          <Button theme={theme} variant="outline" disabled={page >= total} onPress={() => jump(page + 1)}>{t("Berikutnya", "Next")}</Button>
          <Button theme={theme} variant="outline" disabled={scale <= 1} onPress={() => zoom(Math.max(1, scale - 0.25))}>{t("Perkecil", "Zoom out")}</Button>
          <Button theme={theme} variant="outline" disabled={scale >= 3} onPress={() => zoom(Math.min(3, scale + 0.25))}>{t("Perbesar", "Zoom in")}</Button>
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Input theme={theme} accessibilityLabel={t("Nomor halaman", "Page number")} keyboardType="number-pad"
            value={draftPage} onChangeText={setDraftPage} maxLength={String(total).length} style={{ flex: 1 }} />
          <Button theme={theme} disabled={!/^\d+$/.test(draftPage) || Number(draftPage) < 1 || Number(draftPage) > total}
            onPress={() => jump(Number(draftPage))}>{t("Buka halaman", "Go to page")}</Button>
        </View>
        {outline.length > 0 && <Text accessibilityRole="header" style={text}>{t("Daftar isi", "Outline")}</Text>}
        {outline.map((entry, index) => <View key={index} style={{ marginStart: entry.depth * 10 }}>
          <NativeListRow layout="compact" theme={theme} title={entry.title} subtitle={t("Halaman", "Page") + " " + entry.page}
            primary={{ label: entry.title, role: "button", onPress: () => jump(entry.page) }} />
        </View>)}
      </> : tab === "search" && search ? <PdfTextSearch search={search} total={total} onOpen={jump} theme={theme} en={en} /> : annotations && <>
        <Text accessibilityRole="header" style={text}>{t("Halaman", "Page")} {editPage}</Text>
        <Button theme={theme} variant="outline" onPress={() => write(() => annotations.toggle(editPage))} testID="student-pdf-bookmark">
          {notes?.bookmarks.includes(editPage) ? t("Hapus penanda", "Remove bookmark") : t("Tandai halaman", "Bookmark page")}
        </Button>
        <Input theme={theme} accessibilityLabel={t("Catatan halaman", "Page note")} value={draftNote} onChangeText={setDraftNote}
          maxLength={maxPdfNoteLength} multiline style={{ minHeight: 96 }} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Button theme={theme} onPress={() => write(() => annotations.note(editPage, draftNote))} testID="student-pdf-note-save">{t("Simpan catatan", "Save note")}</Button>
          {notes?.notes[editPage] && <Button theme={theme} variant="ghost" onPress={() => {
            write(() => annotations.note(editPage, ""));
            setDraftNote("");
          }}>{t("Hapus catatan", "Delete note")}</Button>}
        </View>
        {notes && [...new Set([...notes.bookmarks, ...Object.keys(notes.notes).map(Number)])].sort((a, b) => a - b).map(item =>
          <NativeListRow layout="compact" key={item} theme={theme} title={t("Halaman", "Page") + " " + item}
            subtitle={notes.notes[item] || t("Penanda", "Bookmark")}
            primary={{ label: t("Buka halaman", "Go to page") + " " + item, role: "button", onPress: () => jump(item) }} />)}
      </>}
      {error && <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{t("Catatan belum dapat disimpan.", "Could not save reader notes.")}</Text>}
    </SharedDialog>}
  </>;
}
