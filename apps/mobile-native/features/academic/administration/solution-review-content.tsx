import { useContext } from "react";
import { View } from "react-native";
import { openBrowserAsync } from "expo-web-browser";
import type { ArticlePart } from "../../../../../lib/materials/article-parts";
import type { SolutionCollectionItem, SolutionProvenance } from "../../../../../lib/materials/solution-collection";
import copyId from "../../../../../messages/id/admin.json";
import copyEn from "../../../../../messages/en/admin.json";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { partText } from "../../solutions/semantic";
import { SolutionGeometry } from "../../solutions/geometry";
import { CourseMarkdown } from "../../student/CourseMarkdown";
import { CourseTheme } from "../courses/ui";
import { Action, Ink, layout } from "./ui";

export const reviewCopy = (locale: string) => (locale === "en" ? copyEn : copyId).solutionCollectionReview;

function externalHttps(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

export function SolutionReviewContent({ item, origin, locale, webReview }: {
  item: SolutionCollectionItem; origin: string; locale: string; webReview?: string;
}) {
  const theme = useContext(CourseTheme);
  const { canInteract } = useProtectedInteraction();
  const t = reviewCopy(locale);
  const en = locale === "en";
  const markdown = (source: string) => <CourseMarkdown theme={theme} source={source} services={{
    session: { origin, locale },
  }} allowLinks={false} />;
  const parts = (entries: ArticlePart[]) => entries.map(part => {
    if (part.kind === "visual_ref") {
      const visual = item.visuals.find(value => value.id === part.visualId);
      return <View key={part.id} style={layout.compact}>
        {visual && <Ink kind="strong">{visual.label}</Ink>}
        {visual && markdown(visual.description)}
        {visual?.kind === "geometry_2d" ? <SolutionGeometry visual={visual} /> : null}
        {visual && "staticFallback" in visual ? <>
          {markdown(visual.staticFallback.summary)}
          {visual.staticFallback.type === "text" ? markdown(visual.staticFallback.content) : null}
        </> : null}
        {visual?.kind !== "geometry_2d" && webReview ? <View style={layout.row}>
          <Action label={en ? "View full visual on the web" : "Lihat visual lengkap di web"} onPress={() => {
            if (canInteract()) void openBrowserAsync(new URL(webReview, origin).href).catch(() => {});
          }} />
        </View> : null}
      </View>;
    }
    return <View key={part.id}>{markdown(partText(part))}</View>;
  });
  const source = (label: string, entry: SolutionProvenance) => <View style={layout.compact}>
    <Ink kind="strong">{label}</Ink>
    <Ink>{t[entry.kind]}</Ink>
    {markdown(entry.attribution)}
    {entry.sources.map((source, index) => {
      const url = source.url && externalHttps(source.url);
      return <View style={layout.compact} key={index}>
        <Ink>{source.title} · {source.locator}</Ink>
        {url ? <View style={layout.row}><Action label={en ? "Open source" : "Buka sumber"} onPress={() => {
          if (canInteract()) void openBrowserAsync(url).catch(() => {});
        }} /></View> : null}
      </View>;
    })}
  </View>;

  return <View style={layout.group}>
    <Ink kind="heading">{item.title}</Ink>
    <Ink kind="strong">{en ? "Question" : "Soal"}</Ink>
    {parts(item.prompt)}
    {item.options.map((option, index) => <View key={option.id} style={layout.compact}>
      <Ink kind="strong">{String.fromCharCode(65 + index)}</Ink>{parts(option.parts)}
    </View>)}
    {item.hintMarkdown ? <View style={layout.compact}>
      <Ink kind="strong">{t.studentHint}</Ink>{markdown(item.hintMarkdown)}<Ink kind="meta">{t.hintCheck}</Ink>
    </View> : null}
    <Ink kind="strong">{en ? "Answer" : "Jawaban"}</Ink>
    {item.answer.optionIds.length ? <Ink>{item.answer.optionIds.map(id =>
      String.fromCharCode(65 + item.options.findIndex(option => option.id === id))).join(", ")}</Ink> : null}
    {parts(item.answer.parts)}
    <Ink kind="strong">{en ? "Approach" : "Strategi"}</Ink>
    {parts(item.strategy)}
    <Ink kind="strong">{en ? "Reasoned steps" : "Langkah dan alasan"}</Ink>
    {item.steps.map((step, index) => <View key={step.id} style={layout.compact}>
      {markdown(`${index + 1}. ${step.operationMarkdown}`)}
      {markdown(step.reasonMarkdown)}
      {step.conditionsMarkdown ? markdown(step.conditionsMarkdown) : null}
      {step.parts ? parts(step.parts) : null}
    </View>)}
    <Ink kind="strong">{en ? "Verification" : "Pemeriksaan"}</Ink>
    {parts(item.verification)}
    {item.misconceptions?.length ? <View style={layout.compact}>
      <Ink kind="strong">{en ? "Misconceptions" : "Miskonsepsi"}</Ink>
      {item.misconceptions.map(entry => <View key={entry.id} style={layout.compact}>
        {markdown(entry.misconceptionMarkdown)}
        <Ink kind="strong">{en ? "Correction" : "Koreksi"}</Ink>{markdown(entry.correctionMarkdown)}
      </View>)}
    </View> : null}
    {source(t.problemSource, item.provenance.problem)}
    {source(t.solutionSource, item.provenance.solution)}
  </View>;
}
