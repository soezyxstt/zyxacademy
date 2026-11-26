import { Fragment, useState } from "react";
import { Share, StyleSheet, Text, View } from "react-native";
import { localizedPublicPath } from "../../../../../lib/public-locale-routes";
import {
  blogArticleHref,
  blogCategories,
  blogListHref,
  blogPageSize,
  type BlogCategory,
  type PublicBlogCard,
} from "../../../../../packages/native-parity/operations/public-contract";
import { Action, Divider, Figure, Hero, Label, layout, RowLink, StatePanel, textWith, usePublic, usePublicResource } from "./ui";

function CategoryTitle(category: BlogCategory | null, copy: ReturnType<typeof usePublic>["copy"]["blog"]) {
  const key = blogCategories.find((item) => item.id === category)?.key;
  return copy.categories[key ?? "all"];
}

function BlogCard({ card, featured = false, related = false }: {
  card: PublicBlogCard; featured?: boolean; related?: boolean;
}) {
  const { colors, copy: { blog } } = usePublic();
  const date = card.publishedAt && new Intl.DateTimeFormat(blog.dateLocale, {
    month: "short", day: "numeric", year: "numeric",
  }).format(new Date(card.publishedAt));
  const minutes = textWith(related ? blog.minutesShort : blog.minutes, { count: card.readMinutes });
  return (
    <RowLink
      href={blogArticleHref(card.slug)}
      id={`public-blog-article-${card.slug}`}
      label={[card.title, date, minutes, !related && card.summary].filter(Boolean).join(". ")}
      style={featured ? { ...styles.featured, borderColor: colors.border } : styles.card}
    >
      {featured && <Figure source={card.thumbnailUrl} style={styles.leadPhoto} />}
      <View style={[layout.item, styles.cardCopy, featured && styles.leadCopy]}>
        {featured || !related ? <Label tone="meta">{[date, minutes].filter(Boolean).join("  ")}</Label> : null}
        <Label tone={featured ? "subheading" : "body"} style={featured ? undefined : styles.articleTitle}>{card.title}</Label>
        {related ? <Label tone="meta">{[date, minutes].filter(Boolean).join("  ")}</Label> : null}
        {!related && !!card.summary && <Label tone="muted" numberOfLines={featured ? 3 : 2}>{card.summary}</Label>}
      </View>
      {!featured && <Figure source={card.thumbnailUrl} style={related ? styles.relatedPhoto : styles.cardPhoto} />}
    </RowLink>
  );
}

export function BlogList({ category, page }: { category: BlogCategory | null; page: number }) {
  const { client, copy: { blog }, colors } = usePublic();
  const { resource, retry } = usePublicResource(blogListHref(category, page), client, (api, signal) => api.blog(category, page, signal));
  const activeTitle = CategoryTitle(category, blog);
  return (
    <View style={layout.stack} testID="public-blog">
      <Hero title={blog.heroTitle} description={blog.heroDescription} />
      <View style={layout.row} accessibilityLabel={blog.categoryNav}>
        {[null, ...blogCategories.map((item) => item.id)].map((item) => (
          <RowLink
            key={item ?? "all"} active={item === category} href={blogListHref(item)} id={`public-blog-filter-${item ?? "all"}`}
            style={{ borderBottomColor: item === category ? colors.primary : "transparent", borderBottomWidth: 2, marginRight: 12 }}
          >
            <Label tone={item === category ? "link" : "muted"} style={styles.articleTitle}>{CategoryTitle(item, blog)}</Label>
          </RowLink>
        ))}
      </View>
      <Divider />
      {resource.status !== "ready" ? <StatePanel kind={resource.status} retry={resource.status === "error" ? retry : undefined} /> : (() => {
        const { articles, sections, total } = resource.value;
        return (
          <View style={layout.stack}>
            <View style={layout.between}>
              <Label tone="subheading">{category ? activeTitle : blog.latest}</Label>
              {category && total > 0 && <Label tone="meta">{textWith(blog.available, { count: total })}</Label>}
            </View>
            {articles.length ? <View>
              {articles.map((card, index) => <Fragment key={card.slug}>
                <BlogCard card={card} featured={!category && index === 0} />
                {index < articles.length - 1 && <Divider />}
              </Fragment>)}
            </View> : <StatePanel kind="empty" title={blog.emptyTitle} />}
            {category ? <View style={layout.row} accessibilityLabel={blog.pagination}>
              {page > 1 && <Action href={blogListHref(category, Math.min(page - 1, Math.max(1, Math.ceil(total / blogPageSize))))}>{blog.previous}</Action>}
              {page * blogPageSize < total && <Action href={blogListHref(category, page + 1)}>{blog.next}</Action>}
            </View> : <>
              {sections.map(({ category: sectionCategory, entries }) => <View key={sectionCategory} style={layout.section}>
                <View style={layout.between}>
                  <Label tone="subheading">{CategoryTitle(sectionCategory, blog)}</Label>
                  <Action href={blogListHref(sectionCategory)} variant="link" accessibilityLabel={`${blog.viewAll} ${CategoryTitle(sectionCategory, blog)}`}>{blog.viewAll}</Action>
                </View>
                <Divider />
                {entries.map((card) => <Fragment key={card.slug}><BlogCard card={card} /><Divider /></Fragment>)}
              </View>)}
              <View style={[layout.panel, { borderColor: colors.border }]}>
                <Label tone="subheading">{blog.coursesTitle}</Label>
                <Action href="/courses">{blog.courses}</Action>
              </View>
            </>}
          </View>
        );
      })()}
    </View>
  );
}

export function ReadMarkdown({ markdown, onLink }: { markdown: string; onLink: (href: string) => void }) {
  const { colors } = usePublic();
  function inline(text: string) {
    return text.split(/(\[[^\]]+\]\([^\s)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
      const link = /^\[([^\]]+)\]\(([^\s)]+)\)$/.exec(part);
      if (link) return <Text key={index} accessibilityRole="link" style={{ color: colors.primary, textDecorationLine: "underline" }} onPress={() => onLink(link[2])}>{link[1]}</Text>;
      if (part.startsWith("**") && part.endsWith("**")) return <Text key={index} style={{ fontWeight: "700" }}>{part.slice(2, -2)}</Text>;
      if (part.startsWith("`") && part.endsWith("`")) return <Text key={index} style={{ color: colors.primary }}>{part.slice(1, -1)}</Text>;
      return part;
    });
  }
  return <View style={layout.section}>{markdown.trim().split(/\r?\n\s*\r?\n/).map((block, index) => {
    const image = /^!\[([^\]]*)\]\(([^\s)]+)\)$/.exec(block);
    if (image) return <Figure key={index} source={image[2]} title={image[1]} />;
    const heading = /^#{1,6}\s+(.+)$/.exec(block);
    if (heading) return <Label key={index} tone="subheading">{inline(heading[1])}</Label>;
    return <Label key={index}>{block.split(/\r?\n/).map((line, lineIndex) => (
      <Fragment key={lineIndex}>{lineIndex > 0 ? "\n" : ""}{inline(line.replace(/^\s*[-+*]\s+/, "• "))}</Fragment>
    ))}</Label>;
  })}</View>;
}

export function BlogArticle({ slug }: { slug: string }) {
  const { client, copy: { blog }, locale, origin, onBack, onNavigate, openExternal, renderArticle } = usePublic();
  const { resource, retry } = usePublicResource(blogArticleHref(slug), client, (api, signal) => api.article(slug, signal));
  const [failedShare, setFailedShare] = useState(false);
  const back = () => onBack ? onBack("/blog") : onNavigate("/blog");
  const href = localizedPublicPath(locale, blogArticleHref(slug)) ?? blogArticleHref(slug);
  const articleUrl = new URL(href, origin).toString();
  function openLink(value: string) {
    try {
      const url = new URL(value, articleUrl);
      if (url.origin === new URL(origin).origin && /^\/(?:id\/|en\/)?blog(?:\/|$)/.test(url.pathname)) {
        onNavigate(url.pathname.replace(/^\/(id|en)\//, "/") + url.search);
      } else openExternal(url.toString());
    } catch {
      // Malformed content links cannot open a target.
    }
  }
  if (resource.status !== "ready") return <View style={layout.stack}>
    <Action onPress={back} id="public-blog-back" variant="link">{blog.back}</Action>
    <StatePanel kind={resource.status} retry={resource.status === "error" ? retry : undefined} />
  </View>;
  if (!resource.value) return <View style={layout.stack}>
    <Action onPress={back} id="public-blog-back" variant="link">{blog.back}</Action>
    <StatePanel
      kind="empty"
      title={locale === "id" ? "Artikel tidak ditemukan" : "Article not found"}
      description={blog.articleNotFoundDescription}
    />
  </View>;
  const { article, related } = resource.value;
  const date = article.publishedAt && new Intl.DateTimeFormat(blog.dateLocale, {
    month: "long", day: "numeric", year: "numeric",
  }).format(new Date(article.publishedAt));
  const share = () => {
    setFailedShare(false);
    void Share.share({ title: article.title, message: articleUrl }).catch(() => setFailedShare(true));
  };
  return <View style={layout.stack} testID="public-blog-detail">
    <View style={layout.row}><Action onPress={back} id="public-blog-back" variant="link">{blog.back}</Action></View>
    <Label tone="heading">{article.title}</Label>
    <View style={layout.row}>
      <Label tone="meta">{[article.author || blog.authorFallback, date, textWith(blog.minutes, { count: article.readMinutes })].filter(Boolean).join("  ")}</Label>
      <Action onPress={share} variant="link" id="public-blog-share">{blog.share}</Action>
    </View>
    {failedShare && <Label tone="error" live="assertive">{blog.shareFailed}</Label>}
    <Figure source={article.thumbnailUrl} title={article.title} />
    {renderArticle ? renderArticle({ markdown: article.content, origin, onLink: openLink }) : <ReadMarkdown markdown={article.content} onLink={openLink} />}
    <Divider />
    <View style={layout.between}>
      <Label tone="subheading">{blog.shareArticleTitle}</Label>
      <Action onPress={share} variant="outline">{blog.shareViaSystem}</Action>
    </View>
    <View style={layout.section}>
      <Label tone="subheading">{blog.others}</Label>
      <Divider />
      {related.length
        ? related.map((card) => <Fragment key={card.slug}><BlogCard card={card} related /><Divider /></Fragment>)
        : <Label tone="muted">{blog.noneOthers}</Label>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  featured: { gap: 0, borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  card: { alignItems: "flex-start", flexDirection: "row", gap: 12, paddingVertical: 16 },
  articleTitle: { fontWeight: "700" },
  cardCopy: { flex: 1 },
  leadCopy: { padding: 16 },
  leadPhoto: { borderRadius: 0 },
  cardPhoto: { width: 80, borderRadius: 6 },
  relatedPhoto: { width: 56, aspectRatio: 1, borderRadius: 8 },
});
