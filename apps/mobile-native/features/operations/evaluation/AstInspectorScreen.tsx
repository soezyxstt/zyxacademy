import { useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { Button } from "../../../components/Button";
import { compileMarkdown } from "../../../../../lib/markdown-compiler";
import { WebsiteMaterialASTSchema, validateAST, type CompilerResult, type WebsiteMaterialAST } from "../../../../../lib/ast-validator";
import { DEMO_TEMPLATES } from "../../../../../packages/native-parity/operations/evaluation-ast-templates";
import { Copy, Field, Heading, inspectorStrings, interpolate, language, Row, Section, type Presentation } from "./ui";

export type EvaluationFiles = {
  importJson: () => Promise<string | null>;
  exportJson: (name: string, text: string) => Promise<void>;
  copyText?: (text: string) => Promise<void>;
};

const tabs = {
  preview: "livePreview", "block-explorer": "blockExplorer", diagnostics: "diagnostics",
  json: "astJson", pipeline: "pipeline", stats: "statsQuality",
} as const;
const tabIds = Object.keys(tabs) as (keyof typeof tabs)[];
type Tab = keyof typeof tabs;
type Inspection = Pick<CompilerResult, "ast" | "diagnostics"> & { stats?: CompilerResult["stats"] };
const compile = (markdown: string) => compileMarkdown(markdown, "chapter-debug", "course-debug");

export function AstInspectorScreen({ presentation, renderAst, files, initialTab }: {
  presentation: Presentation;
  renderAst?: (ast: WebsiteMaterialAST) => ReactNode;
  files?: EvaluationFiles;
  initialTab?: string | null;
}) {
  const { locale, theme } = presentation;
  const copy = inspectorStrings(locale);
  const t = copy.astInspectorUI;
  const [markdown, setMarkdown] = useState(DEMO_TEMPLATES.standard);
  const [result, setResult] = useState<Inspection>(() => compile(DEMO_TEMPLATES.standard));
  const [tab, setTab] = useState<Tab>(() => tabIds.find((item) => item === initialTab) ?? "preview");
  const [expanded, setExpanded] = useState(new Set<string>());
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(result.ast, null, 2);
  const valid = validateAST(result.ast).success;

  function compileInput(input: string) {
    setError(undefined);
    try {
      setResult(compile(input));
      setExpanded(new Set());
    } catch {
      setError(language(locale, "Gagal mengompilasi Markdown.", "Markdown compilation failed."));
    }
  }

  async function importFile() {
    if (!files) return;
    setError(undefined);
    try {
      const text = await files.importJson();
      if (text === null) return;
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === "object" && "markdown" in parsed && typeof parsed.markdown === "string") {
        setMarkdown(parsed.markdown);
        compileInput(parsed.markdown);
        return;
      }
      const ast = WebsiteMaterialASTSchema.parse(parsed);
      const validation = validateAST(ast);
      setMarkdown("");
      setResult({ ast, diagnostics: validation.errors.map(({ path, message }) => ({ severity: "error", code: path, message })) });
      setExpanded(new Set());
    } catch {
      setError(t.importError);
    }
  }

  async function exportFile() {
    if (!files) return;
    setError(undefined);
    try {
      const name = result.ast.documentMetadata.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "material";
      const payload = result.stats ? {
        markdown,
        compilerResult: result,
        compiledAt: new Date().toISOString(),
        compilerVersion: result.ast.compilerVersion,
        schemaVersion: result.ast.schemaVersion,
      } : result.ast;
      await files.exportJson(`compiled-material-${name}.json`, JSON.stringify(payload, null, 2));
    } catch {
      setError(language(locale, "Gagal mengekspor JSON.", "JSON export failed."));
    }
  }

  return <>
    <Heading theme={theme}>{copy.astInspector.title}</Heading>
    <Row>
      {(Object.keys(DEMO_TEMPLATES) as (keyof typeof DEMO_TEMPLATES)[]).map((name) => <Button key={name} theme={theme} variant="ghost" onPress={() => { const next = DEMO_TEMPLATES[name]; setMarkdown(next); compileInput(next); }}>{t[name]}</Button>)}
      {files && <>
        <Button theme={theme} variant="outline" onPress={() => void importFile()}>{t.import}</Button>
        <Button theme={theme} variant="outline" onPress={() => void exportFile()}>{t.export}</Button>
      </>}
      <Button theme={theme} onPress={() => compileInput(markdown)}>{t.compile}</Button>
    </Row>
    <Field theme={theme} label="Markdown" value={markdown} onChangeText={setMarkdown} placeholder={t.markdownPlaceholder} multiline autoCapitalize="none" />
    {error && <View accessibilityLiveRegion="polite"><Copy theme={theme} tone="error">{error}</Copy></View>}
    <Row>{tabIds.map((item) => <Button key={item} theme={theme} variant={tab === item ? "default" : "ghost"} accessibilityRole="tab" accessibilityState={{ selected: item === tab }} onPress={() => setTab(item)}>{t[tabs[item]]}</Button>)}</Row>
    {tab === "preview" && (renderAst ? renderAst(result.ast) : <Section theme={theme}>
      <Copy theme={theme} tone="strong">{result.ast.documentMetadata.title}</Copy>
      {result.ast.blocks.map((block) => (block.type === "p" || block.type === "h" || block.type === "blockquote")
        ? <Copy key={block.id} theme={theme} tone={block.type === "h" ? "strong" : "normal"}>{block.content}</Copy>
        : <Copy key={block.id} theme={theme} tone="muted">{block.type}</Copy>)}
    </Section>)}
    {tab === "block-explorer" && result.ast.blocks.map((block, index) => <Section key={block.id} theme={theme}>
      <Row>
        <Copy theme={theme} tone="strong">{index + 1} · {block.type}</Copy>
        <Button theme={theme} variant="ghost" accessibilityState={{ expanded: expanded.has(block.id) }} onPress={() => setExpanded((current) => {
          const next = new Set(current);
          if (next.has(block.id)) next.delete(block.id); else next.add(block.id);
          return next;
        })}>{expanded.has(block.id) ? t.hide : t.showJson}</Button>
      </Row>
      {expanded.has(block.id) && <Copy theme={theme}>{JSON.stringify(block, null, 2)}</Copy>}
    </Section>)}
    {tab === "diagnostics" && (result.diagnostics.length ? result.diagnostics.map((item, index) => <Section key={index} theme={theme}>
      <Copy theme={theme} tone={item.severity === "error" ? "error" : "strong"}>{t[item.severity]} · {item.code}</Copy>
      <Copy theme={theme}>{item.message}</Copy>
      {item.blockId && <Copy theme={theme} tone="muted">{t.blockId} {item.blockId}</Copy>}
      {item.recommendation && <Copy theme={theme}>{item.recommendation}</Copy>}
    </Section>) : <Copy theme={theme}>{t.noDiagnostics}</Copy>)}
    {tab === "json" && <Section theme={theme}>
      {files?.copyText && <Row><Button theme={theme} variant="outline" onPress={() => {
        void files.copyText?.(json).then(() => setCopied(true), () => setError(language(locale, "Gagal menyalin JSON.", "JSON could not be copied.")));
      }}>{copied ? t.jsonCopied : t.copyJson}</Button></Row>}
      <Text selectable><Copy theme={theme}>{json}</Copy></Text>
    </Section>}
    {tab === "pipeline" && (["parse", "normalize", "validate", "diagnostics", "stats"] as const).map((step, index) => {
      const details = {
        parse: [t.parseTitle, t.parseDescription, t.complete],
        normalize: [t.normalizeTitle, t.normalizeDescription, t.complete],
        validate: [t.validateTitle, t.validateDescription, valid ? t.valid : t.failed],
        diagnostics: [t.diagnosticsTitle, t.diagnosticsDescription, String(result.diagnostics.length)],
        stats: [t.statsTitle, t.statsDescription, result.stats ? String(result.stats.quality.score) : ""],
      }[step];
      return details && <Section key={step} theme={theme}>
        <Copy theme={theme} tone="strong">{index + 1} · {details[0]} {details[2] && `· ${details[2]}`}</Copy>
        <Copy theme={theme}>{details[1]}</Copy>
      </Section>;
    })}
    {tab === "stats" && (result.stats ? <Section theme={theme}>
      <Copy theme={theme} tone="strong">{t.qualityScore} · {result.stats.quality.score}</Copy>
      <Copy theme={theme}>{t.glossaryCoverage} · {result.stats.quality.breakdown.glossaryCoverage}%</Copy>
      <Copy theme={theme}>{t.visualReference} · {result.stats.quality.breakdown.visualReferenceCoverage}%</Copy>
      <Copy theme={theme}>{t.formulaAtomization} · {result.stats.quality.breakdown.formulaAtomization}%</Copy>
      <Copy theme={theme}>{t.visualCoverage} · {result.stats.quality.breakdown.visualCoverage}%</Copy>
      <Copy theme={theme} tone="strong">{t.structureMetrics}</Copy>
      <Copy theme={theme}>{interpolate(t.conceptsDetected, { count: result.stats.conceptCount })} · {result.stats.conceptCount}</Copy>
      <Copy theme={theme}>{interpolate(t.formulasDetected, { count: result.stats.formulaCount })} · {result.stats.formulaCount}</Copy>
      <Copy theme={theme}>{interpolate(t.glossaryDetected, { count: result.stats.glossaryCount })} · {result.stats.glossaryCount}</Copy>
      <Copy theme={theme}>{interpolate(t.visualsDetected, { count: result.stats.visualCount })} · {result.stats.visualCount}</Copy>
    </Section> : <Copy theme={theme}>{t.noCompileResult}</Copy>)}
  </>;
}
