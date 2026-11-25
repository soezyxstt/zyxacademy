import type { Metadata } from "next";
import { db } from "@/db";
import { blogArticles } from "@/db/schema";
import { and, count, eq, desc, inArray } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasAnyPeran } from "@/lib/auth/request-cache";
import { ArrowRight } from "lucide-react";
import { MarketingPageHero } from "@/components/marketing-page-hero";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { SectionHeading } from "@/components/ui/section-heading";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";
import { createLocalizedMetadata } from "@/lib/site-metadata";
import { getTranslations } from "@/lib/i18n/server";
import { LocalizedPublicLink } from "@/components/localized-public-link";
import { BlogThumbnail } from "@/components/blog/blog-thumbnail";
import { storage } from "@/lib/storage";

export async function generateMetadata(): Promise<Metadata> {
  return createLocalizedMetadata({ path: "/blog", titleKey: "meta.blog.title", descriptionKey: "meta.blog.description" });
}


const CATEGORIES = [
  { id: "all", key: "all", value: null },
  { id: "tips_kuliah", key: "studyTips", value: "tips_kuliah" },
  { id: "pojok_kampus", key: "campusCorner", value: "pojok_kampus" },
  { id: "fakta_seru", key: "funFacts", value: "fakta_seru" },
  { id: "kegiatan_zyx", key: "zyxActivities", value: "kegiatan_zyx" },
] as const;

type ArticlePreview = Pick<
  typeof blogArticles.$inferSelect,
  "id" | "slug" | "title" | "summary" | "status" | "category" | "thumbnailUrl" | "publishedAt" | "readMinutes"
>;

interface BlogPageProps {
  searchParams: Promise<{ category?: string; page?: string }>;
}

export default async function BlogPage({ searchParams }: BlogPageProps) {
  const t = await getTranslations("marketing");
  const resolvedParams = await searchParams;
  const requestedCategory = resolvedParams.category || null;
  const activeCategory = CATEGORIES.find(category => category.value === requestedCategory)?.value ?? null;

  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  const userRole = session?.user?.role;
  const isAdminOrTeacher =
    session?.user &&
    ((await hasAnyPeran(session.user.id, ["admin", "tutor"], { allowAdmin: true })) ||
      userRole === "admin" ||
      userRole === "teacher");

  const statusFilter = isAdminOrTeacher
    ? inArray(blogArticles.status, ["published", "draft"])
    : eq(blogArticles.status, "published");

  const pageSize = 12;
  const cards = (category: typeof blogArticles.$inferSelect.category | null, limit: number, offset = 0) =>
    db.query.blogArticles.findMany({
      columns: { id: true, slug: true, title: true, summary: true, status: true, category: true, thumbnailUrl: true, publishedAt: true, readMinutes: true },
      where: and(statusFilter, category ? eq(blogArticles.category, category) : undefined),
      orderBy: [desc(blogArticles.publishedAt), desc(blogArticles.createdAt), desc(blogArticles.id)],
      limit,
      offset,
    });
  const requestedPage = Number(resolvedParams.page ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 1_000_000 ? requestedPage : 1;
  const [countRows, articles, previews] = await Promise.all([
    db.select({ total: count() }).from(blogArticles).where(and(statusFilter, activeCategory ? eq(blogArticles.category, activeCategory) : undefined)),
    activeCategory ? cards(activeCategory, pageSize, (page - 1) * pageSize) : cards(null, 3),
    activeCategory ? [] : Promise.all(CATEGORIES.filter(category => category.value !== null).map(category => cards(category.value, 6))),
  ]);
  const total = countRows[0]?.total ?? 0;
  const [leadArticle, ...recentArticles] = articles;
  const featuredIds = new Set(articles.map((article) => article.id));
  const categoryPreviews = previews.flat();
  const categorySections = CATEGORIES.flatMap((category) => {
    const entries = categoryPreviews
      .filter((article) => article.category === category.value && !featuredIds.has(article.id))
      .slice(0, 3);
    return entries.length ? [{ category, entries }] : [];
  });
  const activeCategoryData = CATEGORIES.find((category) => category.value === activeCategory);
  const activeCategoryName = activeCategoryData ? t(`blog.categories.${activeCategoryData.key}`) : null;

  return (
    <div className="relative overflow-hidden bg-background">
      <PageOrnaments variant="about" />

      <div className="relative z-10">
        <MarketingPageHero
          sectionId="blog"
          title={t("blog.heroTitle")}
          description={t("blog.heroDescription")}
          className="py-8 text-left md:py-12 [&_h1]:mx-0 [&_p]:mx-0"
        />

        <div className="marketing-container space-y-8 pb-10 lg:space-y-12 lg:pb-14">
          <nav aria-label={t("blog.categoryNav")} className="flex flex-wrap gap-x-5 gap-y-1 border-b border-border py-2">
            {CATEGORIES.map((category) => {
              const href = category.value ? `/blog?category=${category.value}` : "/blog";
              const isActive = category.value === activeCategory;
              return (
                <LocalizedPublicLink
                  key={category.id}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex min-h-10 items-center border-b-2 text-body-sm font-semibold transition-colors hover:text-primary",
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-foreground",
                  )}
                >
                  {t(`blog.categories.${category.key}`)}
                </LocalizedPublicLink>
              );
            })}
          </nav>

          {activeCategory ? (
            <section aria-labelledby="blog-category-heading" className="max-w-4xl space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <SectionHeading id="blog-category-heading" tier="secondary">{activeCategoryName}</SectionHeading>
                {total > 0 && <span className="text-body-xs text-muted-foreground">{t("blog.available", { count: total })}</span>}
              </div>

              {articles.length > 0 ? (
                <div className="divide-y divide-border border-y border-border">
                  {articles.map((article) => (
                    <ArticleEntry key={article.id} article={article} t={t} />
                  ))}
                </div>
              ) : (
                <BlogEmptyState title={t("blog.emptyTitle")} />
              )}
              {(page > 1 || page * pageSize < total) && (
                <nav className="flex gap-4 text-body-sm text-primary" aria-label={t("blog.pagination")}>
                  {page > 1 && <LocalizedPublicLink href={`/blog?category=${activeCategory}&page=${Math.min(page - 1, Math.max(1, Math.ceil(total / pageSize)))}`}>{t("blog.previous")}</LocalizedPublicLink>}
                  {page * pageSize < total && <LocalizedPublicLink href={`/blog?category=${activeCategory}&page=${page + 1}`}>{t("blog.next")}</LocalizedPublicLink>}
                </nav>
              )}
            </section>
          ) : (
            <>
              <section aria-labelledby="blog-latest-heading" className="space-y-4">
                <SectionHeading id="blog-latest-heading" tier="secondary">{t("blog.latest")}</SectionHeading>

                {leadArticle ? (
                  <div className="grid items-start gap-4 lg:grid-cols-5 lg:gap-6">
                    <ArticleEntry article={leadArticle} t={t} featured />
                    {recentArticles.length > 0 && (
                      <div className="min-w-0 divide-y divide-border border-y border-border lg:col-span-2">
                        {recentArticles.map((article) => (
                          <ArticleEntry key={article.id} article={article} t={t} />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <BlogEmptyState title={t("blog.emptyTitle")} />
                )}
              </section>

              {categorySections.length > 0 && (
                <Reveal>
                  <div className="space-y-6 gap-8 lg:columns-2">
                    {categorySections.map(({ category, entries }) => {
                      const headingId = `blog-${category.id}-heading`;
                      const linkId = `blog-${category.id}-link`;
                      return (
                        <section key={category.id} aria-labelledby={headingId} className="min-w-0" style={{ breakInside: "avoid-column" }}>
                          <div className="flex flex-wrap items-center justify-between gap-x-4 border-b border-border">
                            <h2 id={headingId} className="font-heading text-body-base font-bold">
                              {t(`blog.categories.${category.key}`)}
                            </h2>
                            <LocalizedPublicLink
                              id={linkId}
                              aria-labelledby={`${linkId} ${headingId}`}
                              href={`/blog?category=${category.value}`}
                              className="inline-flex min-h-10 items-center text-body-sm font-semibold text-primary hover:underline"
                            >
                              {t("blog.viewAll")}
                            </LocalizedPublicLink>
                          </div>
                          <div className="divide-y divide-border border-b border-border">
                            {entries.map((article) => <ArticleEntry key={article.id} article={article} t={t} />)}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </Reveal>
              )}

              <Reveal>
                <section aria-labelledby="blog-courses-heading" className="flex flex-wrap items-center justify-between gap-3 border-y border-border bg-card px-4 py-4 sm:px-6">
                  <h2 id="blog-courses-heading" className="font-heading text-body-base font-bold">{t("blog.coursesTitle")}</h2>
                  <Button asChild size="marketing" variant="outline">
                    <LocalizedPublicLink href="/courses">
                      {t("blog.courses")}
                      <ArrowRight aria-hidden="true" />
                    </LocalizedPublicLink>
                  </Button>
                </section>
              </Reveal>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BlogEmptyState({ title }: { title: string }) {
  return (
    <h3 className="border-y border-border py-6 font-heading text-body-base font-semibold">{title}</h3>
  );
}

function ArticleEntry({ article, t, featured = false }: {
  article: ArticlePreview;
  t: Awaited<ReturnType<typeof getTranslations>>;
  featured?: boolean;
}) {
  const { publishedAt, thumbnailUrl } = article;
  return (
    <LocalizedPublicLink
      href={`/blog/${article.slug}`}
      className={cn(
        "group flex min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        featured
          ? "flex-col rounded-xl border border-border-strong bg-card lg:col-span-3"
          : "items-start gap-3 py-4 sm:gap-4",
      )}
    >
      {thumbnailUrl && (
        <BlogThumbnail
          src={thumbnailUrl.startsWith("http") ? storage.getUrl(thumbnailUrl) : thumbnailUrl}
          sizes={featured ? "(max-width: 1023px) 100vw, 768px" : "(max-width: 639px) 80px, 112px"}
          className={featured ? "photo-card aspect-video w-full rounded-b-none rounded-t-xl" : "photo-card order-last w-20 shrink-0 rounded-md sm:w-28"}
        />
      )}
      <div className={cn("min-w-0 flex-1 space-y-1.5", featured && "p-4 sm:p-6")}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-xs text-muted-foreground">
          {article.status === "draft" && (
            <Badge className="rounded-md bg-status-warning text-status-warning-foreground">{t("blog.draft")}</Badge>
          )}
          {publishedAt && (
            <time dateTime={publishedAt.toISOString()}>
              {new Intl.DateTimeFormat(t("blog.dateLocale"), { month: "short", day: "numeric", year: "numeric" }).format(publishedAt)}
            </time>
          )}
          <span>{t("blog.minutes", { count: article.readMinutes })}</span>
        </div>
        <h3 className={cn("wrap-anywhere font-heading font-bold leading-snug text-foreground transition-colors group-hover:text-primary group-focus-visible:text-primary", featured ? "text-h5" : "text-body-base")}>
          {article.title}
        </h3>
        {article.summary && (
          <p className={cn("wrap-anywhere text-muted-foreground", featured ? "line-clamp-3 text-body-base" : "line-clamp-2 text-body-sm")}>
            {article.summary}
          </p>
        )}
      </div>
    </LocalizedPublicLink>
  );
}
