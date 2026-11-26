import { useEffect, useRef, useState, type ComponentRef } from "react";
import { ScrollView, Text, View } from "react-native";
import enTutor from "../../../../../messages/en/tutor.json";
import idTutor from "../../../../../messages/id/tutor.json";
import { readDocInline } from "../../../../../packages/academic/docs/inline";
import { docSectionId } from "../../../../../packages/academic/docs/search";
import { getTutorDocBySlug, getTutorDocs, searchTutorDocs } from "../../../../../packages/academic/docs/tutor";
import { getTutorDocDiagram } from "../../../../../packages/academic/docs/tutor/diagrams";
import type { DocEntry, DocLocale } from "../../../../../packages/academic/docs/types";
import { nativeColors } from "../../../../../packages/design-tokens/native-colors";
import { getSafeRedirectPath } from "../../../../../packages/native-session/auth-redirect";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { nativeTypography } from "../../../typography";
import { SharedSheet } from "../../shared-ui";
import type { AcademicScreenProps } from "../contracts";
import { Empty, Heading, Label, Row, TutorPage, tutorLayout } from "./ui";

type Props = Pick<AcademicScreenProps, "path" | "theme" | "back" | "navigate" | "replace"> & { locale: DocLocale; slug?: string };
type DocNav = Pick<Props, "theme" | "navigate">;

function safeDocHref(href: string): string | null {
  return getSafeRedirectPath(href) === href ? href : null;
}

export function TutorDocs(props: Props) {
  const { slug, theme, navigate, back, locale } = props;
  const [search, setSearch] = useState("");
  const copy = (locale === "en" ? enTutor : idTutor).docs;
  if (slug) {
    const doc = getTutorDocBySlug(slug, locale);
    return doc ? <TutorDocArticle {...props} doc={doc} /> :
      <TutorPage title={copy.title} theme={theme} onBack={back}><Empty theme={theme} title={copy.noResults} /></TutorPage>;
  }

  const docs = searchTutorDocs(search, locale);
  const categories = [...new Set(docs.map(doc => doc.category))];
  return <TutorPage title={copy.title} theme={theme} onBack={back}>
    <Input theme={theme} placeholder={copy.search} accessibilityLabel={copy.search} value={search}
      onChangeText={setSearch} style={tutorLayout.input} />
    {categories.map(category => <View key={category}>
      <Heading theme={theme} title={category} />
      {docs.filter(doc => doc.category === category).map(doc =>
        <Row key={doc.slug} theme={theme} title={doc.title} subtitle={doc.summary}
          onPress={() => navigate(`/tutor/docs/${encodeURIComponent(doc.slug)}`)} />)}
    </View>)}
    {docs.length === 0 ? <Empty theme={theme} title={copy.noResults} description={copy.tryAnother} /> : null}
  </TutorPage>;
}

function DocText({ value, theme, navigate }: DocNav & { value: string }) {
  return <Label theme={theme}>{readDocInline(value).map((part, index) => {
    if (part.kind === "link") {
      const href = safeDocHref(part.href);
      if (href) return <Text accessibilityRole="link" key={index}
        style={{ color: nativeColors[theme].primary, textDecorationLine: "underline" }}
        onPress={() => navigate(href)}>{part.text}</Text>;
    }
    if (part.kind === "code") return <Text key={index} style={nativeTypography.mono}>{part.text}</Text>;
    if (part.kind === "strong") return <Text key={index} style={nativeTypography.bodySemibold}>{part.text}</Text>;
    return part.text;
  })}</Label>;
}

function TutorDocArticle({ doc, path, theme, back, replace, navigate, locale }: Props & { doc: DocEntry }) {
  const docs = getTutorDocs(locale);
  const index = docs.findIndex(entry => entry.slug === doc.slug);
  const adjacent = [docs[index - 1], docs[index + 1]];
  const copy = (locale === "en" ? enTutor : idTutor).docs;
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const contentsButton = useRef<ComponentRef<typeof Button>>(null);
  const positions = useRef(new Map<string, number>());
  const [contentsOpen, setContentsOpen] = useState(false);
  const anchor = path.split("#", 2)[1];
  const shared = { theme, navigate };

  useEffect(() => {
    if (!anchor) return;
    const y = positions.current.get(anchor);
    if (y !== undefined) scroll.current?.scrollTo({ y, animated: true });
  }, [anchor]);

  return <TutorPage title={doc.title} subtitle={doc.category} theme={theme} onBack={back} scrollRef={scroll}>
    <DocText {...shared} value={doc.summary} />
    <Button ref={contentsButton} theme={theme} variant="outline" onPress={() => setContentsOpen(true)} testID="tutor-doc-contents">
      {copy.navigation}
    </Button>
    <SharedSheet theme={theme} open={contentsOpen} returnFocusRef={contentsButton} onDismiss={() => setContentsOpen(false)}
      title={copy.sectionsFor.replace("{title}", doc.title)} closeLabel={locale === "en" ? "Close" : "Tutup"}>
      {doc.sections.map((section, sectionIndex) => {
        const id = docSectionId(sectionIndex);
        return <Row key={id} theme={theme} title={section.title} testID={`tutor-doc-section-${id}`} onPress={() => {
          setContentsOpen(false);
          if (anchor !== id) replace(`${path.split("#", 1)[0]}#${id}`);
          const y = positions.current.get(id);
          if (y !== undefined) scroll.current?.scrollTo({ y, animated: true });
        }} />;
      })}
    </SharedSheet>
    {doc.quickLinks?.length ? <View>
      <Heading theme={theme} title={copy.quickLinks} />
      {doc.quickLinks.map(link => <Row key={link.href} theme={theme} title={link.label} subtitle={link.description}
        onPress={() => { const href = safeDocHref(link.href); if (href) navigate(href); }} />)}
    </View> : null}
    {doc.sections.map((section, sectionIndex) => {
      const id = docSectionId(sectionIndex);
      const diagram = section.diagram ? getTutorDocDiagram(section.diagram, locale) : null;
      return <View key={id} style={tutorLayout.group} onLayout={({ nativeEvent }) => {
        const { y } = nativeEvent.layout;
        positions.current.set(id, y);
        if (anchor === id) scroll.current?.scrollTo({ y, animated: false });
      }}>
        <Heading theme={theme} title={section.title} />
        {diagram ? <View accessibilityLabel={diagram.caption} testID={`tutor-doc-diagram-${section.diagram}`}>
          {diagram.rows.map(row => <Row key={row.title} theme={theme} title={row.title} subtitle={row.note} />)}
          <Label theme={theme} tone="muted">{diagram.caption}</Label>
        </View> : null}
        {section.paragraphs?.map((paragraph, index) => <DocText key={index} {...shared} value={paragraph} />)}
        {section.steps?.map((step, index) => {
          const body = typeof step === "string" ? step : step.body;
          return <View key={index} style={tutorLayout.group}>
            {typeof step !== "string" && step.title ? <Label theme={theme} tone="strong">{index + 1}. {step.title}</Label> : null}
            <DocText {...shared} value={body} />
          </View>;
        })}
        {section.callouts?.map((callout, index) => <View key={index} style={tutorLayout.group}>
          {callout.title ? <Label theme={theme} tone="strong">{callout.title}</Label> : null}
          <DocText {...shared} value={callout.body} />
        </View>)}
        {section.examples?.map((example, index) => <DocText key={index} {...shared} value={example} />)}
        {section.codeBlocks?.map((block, index) => <Row key={index} theme={theme} title={block.label ?? (locale === "en" ? "Code" : "Kode")} subtitle={block.code} />)}
        {section.table?.rows.map((row, rowIndex) =>
          <Row key={rowIndex} theme={theme} title={row[0] ?? ""}>
            {row.slice(1).map((value, index) =>
              <DocText key={index} {...shared} value={`${section.table?.headers[index + 1]} · ${value}`} />)}
          </Row>)}
      </View>;
    })}
    <View>
      {adjacent.map((entry, index) => entry ? <Row key={entry.slug} theme={theme}
        title={entry.title} subtitle={index === 0 ? copy.previous : copy.next}
        onPress={() => navigate(`/tutor/docs/${encodeURIComponent(entry.slug)}`)} /> : null)}
    </View>
  </TutorPage>;
}
