import { Fragment, useMemo } from "react";
import { useColorScheme, View } from "react-native";
import { parseEmbeddedVisual } from "../../../../../lib/materials/embedded-visuals";
import type { InteractiveDocumentScope } from "../../../../../lib/materials/interactive-document-path";
import { evaluationPreviewTable, evaluationPreviewVisual } from "../../../../../packages/native-parity/operations/evaluation-ast-preview";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { AdminInteractiveGraph } from "../../shared-ui/AdminInteractiveGraph";
import { AdminMarkdownDiagram } from "../../shared-ui/AdminMarkdownDiagram";
import { AdminPreviewChart } from "../../shared-ui/AdminPreviewChart";
import { graphEntryLimit, initialGraphEntries } from "../../shared-ui/admin-interactive-graph-model";
import { SolutionVisualPreview } from "../../solutions/SolutionVisualPreview";
import { CanvasTable } from "../zyra/LearningCanvas";
import { CanvasPlot } from "../zyra/CanvasPlot";
import { InteractiveVisual } from "../InteractiveDocument";
import { AssessmentImage } from "./AssessmentImage";
import { Body, Heading, Markdown, useAssessment, useAssessmentCopy } from "./ui";
import { assessmentMarkdownBlocks } from "./visual-markdown";

const previewImage = ({ url, altText }: { url: string; altText: string }) => <AssessmentImage key={url} raw={url} alt={altText} />;
export function AssessmentText({ value, allowLinks }: { value: string; allowLinks?: boolean }) {
  return <Markdown value={value} allowLinks={allowLinks} renderPreviewImage={previewImage} />;
}

export function InteractiveAssessmentMarkdown({ value, scope, visualsOnly = false, disabled }: {
  value: string; scope: InteractiveDocumentScope | null; visualsOnly?: boolean; disabled?: boolean;
}) {
  const blocks = useMemo(() => assessmentMarkdownBlocks(value), [value]);
  const { session, request, devicePreferences, focused } = useAssessment();
  const { tx } = useAssessmentCopy();
  const { canInteract, suspended } = useProtectedInteraction();
  const system = useColorScheme();
  const preferred = devicePreferences?.theme;
  const theme = preferred && preferred !== "system" ? preferred : system ?? "light";
  const locale = /^en(?:-|$)/i.test(session.locale) ? "en" : "id";
  const display = { origin: session.origin, locale, theme } as const;
  const current = () => !disabled && !suspended && focused !== false && canInteract();
  const markdown = (text: string) => <AssessmentText value={text} />;
  const unavailable = () => <Body tone="muted">{tx("Visual belum dapat ditampilkan.", "The visual could not be displayed.")}</Body>;
  const selected = visualsOnly ? blocks.filter(block => block.type !== "markdown" && block.type !== "code") : blocks;
  if (!selected.length) return null;
  return <View style={{ gap: 8 }}>
    {selected.map((block, index) => {
      let content;
      switch (block.type) {
        case "markdown":
        case "code": content = markdown(block.source); break;
        case "media":
          content = <AssessmentImage raw={block.media.src} alt={block.media.caption ?? ""} />;
          break;
        case "diagram":
          content = block.diagram ? <>
            <AdminMarkdownDiagram {...display} diagram={block.diagram} title={block.title || tx("Diagram soal", "Question diagram")} />
            {block.caption && markdown(block.caption)}
          </> : unavailable();
          break;
        case "visual": {
          const visual = evaluationPreviewVisual(block.visual, locale);
          const { title, caption } = block.visual;
          content = <>
            {title && <Heading level={3}>{title}</Heading>}
            {visual?.kind === "chart" ? <AdminPreviewChart {...display} chart={visual.chart} title={title} renderText={markdown} />
              : visual?.kind === "graph" ? <CanvasPlot {...display} spec={visual.spec} interactive={current()} renderValues={table => <CanvasTable {...display} table={table} />} />
              : unavailable()}
            {caption && markdown(caption)}
          </>;
          break;
        }
        case "function-widget": {
          const entries = block.content.length <= 12_000 ? initialGraphEntries(block.content) : [];
          content = entries.length && entries.length <= graphEntryLimit
            ? <AdminInteractiveGraph {...display} entries={entries} current={current} /> : unavailable();
          break;
        }
        case "embedded-visual": {
          const visual = parseEmbeddedVisual(block.content);
          content = !visual ? unavailable() : visual.kind === "interactive_document"
            ? <InteractiveVisual source={{ spec: visual, scope }} request={request} locale={session.locale} disabled={!current()} />
            : visual.kind === "source_figure" ? <>
              <Heading level={3}>{visual.label}</Heading>
              {markdown(visual.description)}
              {visual.captionMarkdown && markdown(visual.captionMarkdown)}
              {markdown(visual.staticFallback.summary)}
              {markdown(visual.staticFallback.type === "table"
                ? evaluationPreviewTable(visual.staticFallback.headers, visual.staticFallback.rows) : visual.staticFallback.content)}
            </> : <SolutionVisualPreview {...display} value={visual} />;
          break;
        }
      }
      return <Fragment key={index}>{content}</Fragment>;
    })}
  </View>;
}
