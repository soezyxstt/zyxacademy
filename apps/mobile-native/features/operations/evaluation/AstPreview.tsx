import { useMemo, useState } from "react";
import { View } from "react-native";
import type { WebsiteMaterialAST } from "../../../../../lib/ast-validator";
import { evaluationBlockMarkdown, evaluationPreviewTable, evaluationPreviewVisual } from "../../../../../packages/native-parity/operations/evaluation-ast-preview";
import { Button } from "../../../components/Button";
import type { NativeSessionTransport } from "../../../network/transport";
import { AdminMarkdownDiagram } from "../../shared-ui/AdminMarkdownDiagram";
import { AdminPreviewChart } from "../../shared-ui/AdminPreviewChart";
import { AdminMarkdownPreview } from "../../shared-ui/AdminMarkdownPreview";
import { CourseMarkdown } from "../../student/CourseMarkdown";
import { CanvasPlot } from "../../student/zyra/CanvasPlot";
import { Copy, Heading, language, type Locale, type Theme } from "./ui";

type PreviewProps = { theme: Theme; locale: Locale; session: NativeSessionTransport };
const step = 12;

export function EvaluationAstPreview({ ast, ...props }: PreviewProps & { ast: WebsiteMaterialAST }) {
  const { locale, theme, session } = props;
  const [visible, setVisible] = useState(step);
  const blocks = useMemo(() => [...ast.blocks].sort((a, b) => a.globalOrderIndex - b.globalOrderIndex), [ast]);
  const preview = { ...props, audience: "course" as const, origin: session.scope.origin };
  const renderText = (source: string) => <AdminMarkdownPreview {...preview} source={source} />;

  return <View style={{ gap: 16 }} testID="admin-ast-rich-preview">
    <Heading theme={theme}>{ast.documentMetadata.title}</Heading>
    {blocks.slice(0, visible).map(block => {
      if (block.type === "visual") {
        return <AstVisual key={block.id} block={block} {...props} />;
      }
      if (block.type === "image" || block.type === "media") {
        const media = block.type === "image" ? { src: block.content.url, caption: block.content.caption || block.content.alt } : block.metadata;
        return media && <AdminMarkdownPreview key={block.id} {...preview} source={block.id} previewBlocks={[{ type: "media", media }]} />;
      }
      const text = evaluationBlockMarkdown(block, locale);
      return text ? <View key={block.id}>{renderText(text)}</View> : null;
    })}
    {visible < blocks.length ? <Button theme={theme} variant="outline" onPress={() => setVisible(value => value + step)}>
      {language(locale, "Tampilkan bagian berikutnya", "Show more of the document")}
    </Button> : null}
  </View>;
}

function AstVisual({ block, locale, theme, session }: PreviewProps & { block: Extract<WebsiteMaterialAST["blocks"][number], { type: "visual" }> }) {
  const visual = useMemo(() => evaluationPreviewVisual(block, locale), [block, locale]);
  const renderText = (source: string) => <CourseMarkdown source={source} theme={theme} allowLinks={false}
    services={{ session: { origin: session.scope.origin, locale } }} />;
  return <View style={{ gap: 8 }}>
    {block.title ? <Heading theme={theme}>{block.title}</Heading> : null}
    {visual?.kind === "diagram" ? <AdminMarkdownDiagram diagram={visual.diagram} locale={locale} theme={theme}
      title={block.title || language(locale, "Diagram", "Diagram")} /> : null}
    {visual?.kind === "graph" ? <CanvasPlot spec={visual.spec} locale={locale} theme={theme}
      renderValues={table => renderText(evaluationPreviewTable(table.columns.map(column => column.label), table.rows))} /> : null}
    {visual?.kind === "chart" ? <AdminPreviewChart chart={visual.chart} title={block.title} theme={theme} locale={locale} renderText={renderText} /> : null}
    {!visual && <Copy theme={theme} tone="muted">{language(locale, "Visual belum dapat ditampilkan.", "This visual is unavailable.")}</Copy>}
    {block.caption ? renderText(block.caption) : null}
  </View>;
}
