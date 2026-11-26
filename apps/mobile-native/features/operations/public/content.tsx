import { useState, type ComponentRef, type RefObject } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { testimonialStories } from "../../../../../lib/testimonials";
import { Action, Divider, Figure, Hero, Label, layout, RowLink, textWith, usePublic } from "./ui";

type FAQ = "free" | "preview" | "paid" | "pricing" | "tutorial" | "activation";
const faqKeys: FAQ[] = ["free", "preview", "paid", "pricing", "tutorial", "activation"];

export function Landing() {
  const { copy: { home, faq, support }, colors } = usePublic();
  const [open, setOpen] = useState<FAQ | null>(null);
  return <View style={layout.stack} testID="public-home">
    <Hero title={`${home.heroTitle} ${home.heroEmphasis}`} description={home.heroDescription} centered>
      <View style={layout.row}>
        <Action href="/sign-up" variant="default">{home.startFree}</Action>
        <Action href="/demo">{home.tryDemo}</Action>
      </View>
    </Hero>
    <Divider />
    <View style={layout.section}>
      <Label tone="heading">{home.proofTitle}</Label>
      <Label>{home.proofDescription}</Label>
      <Label tone="muted">{`“${testimonialStories[0].quote}”`}</Label>
      <Action href="/testimonial" variant="link">{home.readStories}</Action>
    </View>
    <Divider />
    <View style={layout.section}>
      <Label tone="heading">{home.loop.title}</Label>
      {Object.values(home.loop.steps).map((item) => <View key={item.title} style={layout.item}>
        <Label tone="subheading">{item.title}</Label>
        <Label>{item.body}</Label>
      </View>)}
    </View>
    {[
      { title: home.quizTitle, description: home.quizDescription, route: "/demo/quiz" },
      { title: home.tutorTitle, description: home.tutorDescription, route: "/demo/zyra" },
      { title: home.flashcardsTitle, description: home.flashcardsDescription, route: "/demo/flashcards" },
      { title: home.pathTitle, description: home.loop.unlockDescription, route: "/demo/path" },
    ].map((item) => <View style={[layout.panel, { borderColor: colors.border }]} key={item.route}>
      <Label tone="subheading">{item.title}</Label>
      <Label>{item.description}</Label>
      <Action href={item.route} variant="link">{home.tryDemo}</Action>
    </View>)}
    <View style={layout.section}>
      <Label tone="heading">{support.title}</Label>
      {[
        [support.selfStudyTitle, support.selfStudyBody],
        [support.scheduledTitle, support.scheduledBody],
        [support.intensiveTitle, support.intensiveBody],
      ].map(([title, body]) => <View key={title} style={layout.item}><Label tone="subheading">{title}</Label><Label>{body}</Label></View>)}
    </View>
    <View style={layout.section}>
      <Label tone="heading">{home.coursesTitle}</Label>
      <Label>{home.coursesDescription}</Label>
      <Action href="/courses">{home.coursesCta}</Action>
    </View>
    <View style={layout.section}>
      <Label tone="heading">{home.pricingTitle}</Label>
      <Label>{home.pricingDescription}</Label>
      <Action href="/plans">{home.viewPlans}</Action>
    </View>
    <View style={layout.section}>
      <Label tone="heading">{faq.title}</Label>
      {faqKeys.map((key) => <View key={key}>
        <Divider />
        <RowLink role="button" active={open === key} onPress={() => setOpen(open === key ? null : key)}>
          <View style={layout.between}><Label>{faq[key].question}</Label><Label tone="link">{open === key ? "−" : "+"}</Label></View>
        </RowLink>
        {open === key && <Label tone="muted">{faq[key].answer}</Label>}
      </View>)}
    </View>
    <Hero title={home.closingTitle} description={home.closingDescription} compact centered>
      <Action href="/sign-up" variant="default">{home.startFree}</Action>
    </Hero>
  </View>;
}

export function About() {
  const { copy: { about } } = usePublic();
  return <View style={layout.stack} testID="public-about">
    <Hero title={about.title} description={about.intro} centered />
    <Divider />
    <View style={layout.section}>
      <Label tone="heading">{about.storyTitle}</Label>
      <Label>{about.storyOne}</Label>
      <Label>{about.storyTwo}</Label>
    </View>
    <Divider />
    <View style={layout.section}>
      <Label tone="heading">{about.principlesTitle}</Label>
      <Label>{about.principlesIntro}</Label>
      {[
        [about.principleAligned, about.principleAlignedDescription],
        [about.principlePractice, about.principlePracticeDescription],
        [about.principleSupport, about.principleSupportDescription],
      ].map(([title, description]) => <View key={title} style={layout.item}>
        <Label tone="subheading">{title}</Label><Label>{description}</Label>
      </View>)}
    </View>
    <Divider />
    <View style={layout.section}>
      <Label tone="heading">{about.founderSectionTitle}</Label>
      <Label>{about.founderSectionDescription}</Label>
      <Label tone="subheading">Adi Haditya Nursyam</Label>
      <Label>{about.founderAdiRole}</Label>
      <Label>{about.founderAdiBio}</Label>
      <Label tone="subheading">{about.productContribution}</Label>
      <Label>{about.founderAdiContribution}</Label>
      <View style={layout.row}>
        <Action href="https://adihnursyam.com" external>{about.founderPortfolio}</Action>
        <Action href="https://github.com/soezyxstt/zyx-authoring-mcp" external>{about.authoringTools}</Action>
      </View>
    </View>
    <Divider />
    <View style={layout.section}>
      <Label tone="heading">{about.peopleTitle}</Label>
      <Label>{about.peopleDescription}</Label>
      {[
        ["Dawam", about.founderDawamRole, about.founderDawamBio],
        ["Heidi", about.founderHeidiRole, about.founderHeidiBio],
        ["Raihan", about.founderRaihanRole, about.founderRaihanBio],
      ].map(([name, role, bio]) => <View key={name} style={layout.item}>
        <Label tone="subheading">{name}</Label><Label tone="meta">{role}</Label><Label>{bio}</Label>
      </View>)}
    </View>
  </View>;
}

export function Testimonial() {
  const { copy: { testimonial, home } } = usePublic();
  return <View style={layout.stack} testID="public-testimonial">
    <Hero title={testimonial.title} description={testimonial.intro} centered />
    <Label tone="heading">{testimonial.storiesTitle}</Label>
    {testimonialStories.map((story) => <View key={story.id} style={layout.section}>
      <Divider />
      <Label>{`“${story.quote}”`}</Label>
      <View style={layout.inline}>
        <Figure source={story.avatarSrc} title={textWith(testimonial.studentPhoto, { name: story.name })} style={styles.avatar} />
        <View style={layout.item}>
          <Label style={styles.name}>{story.name}</Label>
          <Label tone="meta">{story.program} / {story.location}</Label>
        </View>
      </View>
    </View>)}
    <Divider />
    <Hero title={testimonial.ctaTitle} description={testimonial.ctaDescription} compact centered>
      <View style={layout.row}>
        <Action href="/sign-up" variant="default">{home.startFree}</Action><Action href="/plans">{home.viewPlans}</Action>
      </View>
    </Hero>
  </View>;
}

const documentIds = {
  privacy: ["cakupan", "data-yang-dikumpulkan", "penggunaan-data", "ai-dan-pihak-ketiga", "cookie-dan-penyimpanan-lokal", "penyimpanan-dan-keamanan", "hak-pengguna", "pengguna-di-bawah-umur", "perubahan-kebijakan", "kontak"],
  terms: ["penerimaan", "akun-dan-kelayakan", "penggunaan-layanan", "integritas-akademik", "fitur-ai", "konten-dan-kekayaan-intelektual", "layanan-pihak-ketiga", "pembayaran", "ketersediaan-dan-penghentian", "batas-tanggung-jawab", "perubahan-ketentuan", "hukum-dan-kontak"],
};

export function Legal({ document, scroller }: { document: "privacy" | "terms"; scroller: RefObject<ComponentRef<typeof ScrollView> | null> }) {
  const { copy, colors, brandEmail, onNavigate, openExternal } = usePublic();
  const page = copy[document];
  const title = copy.meta[document].title;
  const updated = new Intl.DateTimeFormat(copy.legal.localeTag, { dateStyle: "long", timeZone: "UTC" }).format(new Date("2026-08-30T00:00:00Z"));
  const [positions, setPositions] = useState<Record<string, number>>({});
  return <View style={layout.stack} testID={`public-${document}`}>
    <Hero title={title} description={page.pageDescription} compact>
      <Label tone="meta">{copy.legal.updatedAt} {updated}</Label>
    </Hero>
    <View style={[layout.panel, { borderColor: colors.border }]} accessibilityLabel={textWith(copy.legal.tableOfContents, { title })}>
      <Label tone="subheading">{copy.legal.tableOfContentsHeading}</Label>
      {page.sections.map((section, index) => {
        const id = documentIds[document][index];
        return <RowLink key={id} onPress={() => scroller.current?.scrollTo({ y: (positions[id] ?? 0) + 24 })}>
          <Label tone="link">{section.title}</Label>
        </RowLink>;
      })}
    </View>
    {page.sections.map((section, index) => {
      const id = documentIds[document][index];
      return <View key={id} style={layout.section} onLayout={({ nativeEvent }) => {
        const { y } = nativeEvent.layout;
        setPositions((previous) => previous[id] === y ? previous : { ...previous, [id]: y });
      }}>
        <Divider />
        <Label tone="subheading">{section.title}</Label>
        {section.blocks.map((block, blockIndex) => {
          if ("items" in block && block.items) return <View key={blockIndex} style={layout.item}>{block.items.map((item) => <Label key={item}>{`•  ${item}`}</Label>)}</View>;
          if ("href" in block && block.href) {
            const href = block.href;
            const target = document === "privacy" ? copy.privacy.termsLink : copy.terms.privacyLink;
            return <Label key={blockIndex}>{block.before}<Text
              accessibilityRole="link"
              style={{ textDecorationLine: "underline", color: colors.primary }}
              onPress={() => onNavigate(href)}
            >{target}</Text>{block.after}</Label>;
          }
          const [before, after] = (block.text ?? "").split("{email}");
          if (after === undefined) return <Label key={blockIndex}>{before}</Label>;
          const address = brandEmail ?? "contact@zyxacademy.com";
          return <Label key={blockIndex}>{before}<Text accessibilityRole="link" onPress={() => openExternal(`mailto:${address}`)}
            style={{ textDecorationLine: "underline", color: colors.primary }}>{address}</Text>{after}</Label>;
        })}
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  avatar: { width: 40, height: 40, aspectRatio: 1, borderRadius: 20 },
  name: { fontWeight: "700" },
});
