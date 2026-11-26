import { useState } from "react";
import { Text, View } from "react-native";
import { getAdminDocs, searchAdminDocs } from "../../../../../lib/docs/admin";
import { Action, Copy, Field, Heading, Item, Screen, Section, styles, useManagement } from "./ui";

export function Documentation({ slug }: { slug?: string }) {
  const { locale, navigate, openExternal, colors } = useManagement();
  const [query, setQuery] = useState("");
  const docs = getAdminDocs(locale);
  const title = locale === "id" ? "Dokumentasi" : "Documentation";
  if (!slug) {
    const results = searchAdminDocs(query, locale);
    const groups = [...new Set(results.map(doc => doc.category))];
    return <Screen title={title}>
      <Field label={locale === "id" ? "Cari dokumentasi" : "Search documentation"} value={query} onChangeText={setQuery} />
      {groups.map(group => <Section key={group} title={group}>{results.filter(doc => doc.category === group).map(doc => <Item key={doc.slug} title={doc.title} meta={doc.summary} onPress={() => navigate(`/admin/docs/${doc.slug}`)} />)}</Section>)}
      {!results.length && <Section><Copy muted>{locale === "id" ? "Dokumentasi tidak ditemukan. Coba kata kunci lain." : "No documentation found. Try another search."}</Copy></Section>}
    </Screen>;
  }
  const index = docs.findIndex(doc => doc.slug === slug);
  const doc = docs[index];
  const back = { label: locale === "id" ? "Semua dokumentasi" : "All documentation", run: () => navigate("/admin/docs") };
  if (!doc) return <Screen title={title} back={back}><Copy status="error">{locale === "id" ? "Dokumentasi tidak ditemukan." : "Documentation not found."}</Copy></Screen>;
  return <Screen title={doc.title} description={doc.summary} back={back}>
    {doc.sections.map((section, index) => <Section key={section.title} title={section.title}>
      {section.paragraphs?.map((paragraph, order) => <Copy key={order}>{paragraph}</Copy>)}
      {section.steps?.map((step, order) => <Copy key={order}>{`${order + 1}. ${typeof step === "string" ? step : `${step.title ? `${step.title}. ` : ""}${step.body}`}`}</Copy>)}
      {section.examples?.map((example, order) => <Copy muted key={order}>{example}</Copy>)}
      {section.callouts?.map((callout, order) => <View key={order} style={{ borderLeftWidth: 2, borderColor: colors.accent, paddingLeft: 8 }}>
        {callout.title && <Copy strong>{callout.title}</Copy>}<Copy>{callout.body}</Copy>
      </View>)}
      {section.codeBlocks?.map((block, order) => <View key={order} style={{ backgroundColor: colors.muted, padding: 8 }}>
        {block.label && <Copy strong>{block.label}</Copy>}<Text selectable style={{ fontFamily: "monospace", color: colors.foreground }}>{block.code}</Text>
      </View>)}
      {section.table && <View style={styles.field} accessibilityLabel={section.table.caption}>
        {section.table.rows.map((row, order) => <View key={order} style={styles.field}>{row.map((cell, cellIndex) => <Copy key={cellIndex}><Text style={{ fontWeight: "600" }}>{section.table?.headers[cellIndex]} </Text>{cell}</Copy>)}</View>)}
      </View>}
    </Section>)}
    {doc.quickLinks && <Section title={locale === "id" ? "Tautan cepat" : "Quick links"}>{doc.quickLinks.map(link => <Item key={link.href} title={link.label} meta={link.description} onPress={link.href.startsWith("/") ? () => navigate(link.href) : openExternal ? () => openExternal(link.href) : undefined} />)}</Section>}
    <View style={styles.row}>
      {index > 0 && <Action onPress={() => navigate(`/admin/docs/${docs[index - 1].slug}`)}>{locale === "id" ? "Sebelumnya" : "Previous"}</Action>}
      {index < docs.length - 1 && <Action onPress={() => navigate(`/admin/docs/${docs[index + 1].slug}`)}>{locale === "id" ? "Berikutnya" : "Next"}</Action>}
    </View>
  </Screen>;
}
