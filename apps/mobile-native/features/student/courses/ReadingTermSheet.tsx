import { useState } from "react";
import { Text, View } from "react-native";
import en from "../../../../../messages/en/studentCourse.json";
import id from "../../../../../messages/id/studentCourse.json";
import { nativeColors } from "../../../../../packages/design-tokens/native-colors";
import { Button } from "../../../components/Button";
import { SharedSheet } from "../../shared-ui/overlays";
import { CourseMarkdown } from "../CourseMarkdown";
import type { StudentSession } from "../contracts";
import type { ReadingTerm } from "./reading-term";

export function ReadingTermSheet({ state, theme, locale, session, canNavigate, close, retry, ask, quiz, review }: {
  state: ReadingTerm | "loading" | "failed" | "revoked";
  theme: keyof typeof nativeColors;
  locale: "id" | "en";
  session: StudentSession;
  canNavigate: boolean;
  close(): void;
  retry(): void;
  ask(): void;
  quiz(): void;
  review(): void;
}) {
  const t = (locale === "id" ? id : en).termPopover;
  const colors = nativeColors[theme];
  const [tab, setTab] = useState<string>();
  const item = typeof state === "string" ? null : state;
  const tabs = item ? [
    { id: "explain", label: t.explain, content: item.quickExplain?.content },
    { id: "analogy", label: t.analogy, content: item.analogy },
    { id: "example", label: t.example, content: item.example?.content },
    { id: "mistake", label: t.commonMistake, content: item.commonMistake?.content },
  ].filter(entry => entry.content) : [];
  const active = tabs.find(entry => entry.id === tab) ?? tabs[0];
  return <SharedSheet open title={item?.conceptName ?? (locale === "id" ? "Konsep" : "Concept")} theme={theme}
    closeLabel={locale === "id" ? "Tutup" : "Close"} onDismiss={close}>
    {state === "loading" ? <Text accessibilityLiveRegion="polite" style={{ color: colors.mutedForeground }}>{t.loading}</Text> : null}
    {state === "failed" || state === "revoked" ? <>
      <Text accessibilityRole="alert" style={{ color: colors.mutedForeground }}>{state === "revoked"
        ? locale === "id" ? "Bacaan atau akses berubah." : "Reading or access changed."
        : locale === "id" ? "Konsep belum dapat dimuat." : "Could not load the concept."}</Text>
      {state === "failed" && <Button theme={theme} variant="outline" onPress={retry}>{locale === "id" ? "Coba lagi" : "Try again"}</Button>}
    </> : null}
    {item ? <Text style={{ color: colors.mutedForeground }}>
      {locale === "id" ? "Penguasaan" : "Mastery"} {item.mastery.score}{item.mastery.trend ? ` · ${t.trend[item.mastery.trend]}` : ""}
    </Text> : null}
    {tabs.length > 1 && <View accessibilityRole="tablist" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {tabs.map(entry => <Button key={entry.id} theme={theme} variant={active?.id === entry.id ? "default" : "outline"}
        accessibilityRole="tab" accessibilityState={{ selected: active?.id === entry.id }} onPress={() => setTab(entry.id)}>{entry.label}</Button>)}
    </View>}
    {active?.content ? <CourseMarkdown source={active.content} services={{ session }} theme={theme} allowLinks={false} /> : null}
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {item && canNavigate ? <>
        <Button theme={theme} variant="outline" onPress={quiz}>{t.quizMe}</Button>
        <Button theme={theme} variant="outline" onPress={review}>{t.review}</Button>
      </> : null}
      {state !== "revoked" && state !== "loading" ? <Button theme={theme} onPress={ask}>{t.askZyra}</Button> : null}
    </View>
  </SharedSheet>;
}
