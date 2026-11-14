import type { Metadata } from "next";
import { db } from "@/db";
import { blogArticles } from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasAnyPeran } from "@/lib/auth/request-cache";
import { Calendar, Clock, Bot, BookOpen, FileText, CreditCard, Target } from "lucide-react";
import { MarketingPageHero } from "@/components/marketing-page-hero";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { SectionHeading } from "@/components/ui/section-heading";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";
import { createLocalizedMetadata } from "@/lib/site-metadata";
import { getTranslations } from "@/lib/i18n/server";
import { LocalizedPublicLink } from "@/components/localized-public-link";
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

const APP_FEATURES = [
  {
    titleKey: "zyraTitle",
    descKey: "zyraDescription",
    icon: Bot,
    bg: "bg-primary/10 text-primary border-primary/20",
  },
  {
    titleKey: "handoutsTitle",
    descKey: "handoutsDescription",
    icon: BookOpen,
    bg: "bg-[var(--zx-accent)]/10 text-[var(--zx-accent)] border-[var(--zx-accent)]/20",
  },
  {
    titleKey: "examsTitle",
    descKey: "examsDescription",
    icon: FileText,
    bg: "bg-status-error/10 text-status-error border-status-error/20",
  },
  {
    titleKey: "flashcardsTitle",
    descKey: "flashcardsDescription",
    icon: CreditCard,
    bg: "bg-status-success/10 text-status-success border-status-success/20",
  },
  {
    titleKey: "studyPathTitle",
    descKey: "studyPathDescription",
    icon: Target,
    bg: "bg-tertiary-1/10 text-tertiary-1 border-tertiary-1/20",
  },
];

interface BlogPageProps {
  searchParams: Promise<{ category?: string }>;
}

export default async function BlogPage({ searchParams }: BlogPageProps) {
  const t = await getTranslations("marketing");
  const resolvedParams = await searchParams;
  const requestedCategory = resolvedParams.category || null;
  const activeCategory = CATEGORIES.some(
    (category) => category.value !== null && category.value === requestedCategory,
  )
    ? requestedCategory
    : null;

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

  const allArticles = await db.query.blogArticles.findMany({
    where: statusFilter,
    orderBy: [desc(blogArticles.publishedAt), desc(blogArticles.createdAt)],
    with: { author: true },
  });

  const filteredArticles = activeCategory
    ? allArticles.filter((article) => article.category === activeCategory)
    : allArticles;
  const featuredArticles = allArticles.slice(0, 3);
  const featuredIds = new Set(featuredArticles.map((article) => article.id));
  const activeCategoryData = CATEGORIES.find((category) => category.value === activeCategory);
  const activeCategoryName = activeCategoryData ? t(`blog.categories.${activeCategoryData.key}`) : null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <PageOrnaments variant="about" />

      <main className="relative z-10">
        <Reveal>
          <MarketingPageHero
            sectionId="blog"
            title={t("blog.heroTitle")}
            description={t("blog.heroDescription")}
          />
        </Reveal>

        <div className="mx-auto max-w-7xl space-y-14 px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <nav aria-label={t("blog.categoryNav")} className="flex flex-wrap gap-2">
            {CATEGORIES.map((category) => {
              const href = category.value ? `/blog?category=${category.value}` : "/blog";
              const isActive = category.value === activeCategory || (category.value === null && activeCategory === null);
              return (
                <LocalizedPublicLink
                  key={category.id}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-body-sm font-semibold transition-colors",
                    isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {t(`blog.categories.${category.key}`)}
                </LocalizedPublicLink>
              );
            })}
          </nav>

          {activeCategory ? (
            <section aria-labelledby="blog-category-heading" className="space-y-6">
              <div className="space-y-2">
                <SectionHeading as="h2" id="blog-category-heading" tier="secondary" className="text-foreground">
                  {activeCategoryName}
                </SectionHeading>
                <p className="text-body-base text-muted-foreground">
                  {t("blog.categoryCount", { count: filteredArticles.length })}
                </p>
              </div>

              {filteredArticles.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {filteredArticles.map((article) => (
                    <ArticleCard key={article.id} article={article} t={t} />
                  ))}
                </div>
              ) : (
                <BlogEmptyState title={t("blog.emptyTitle")} description={t("blog.emptyCategory")} />
              )}
            </section>
          ) : (
            <>
              <section aria-labelledby="blog-latest-heading" className="space-y-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="space-y-2">
                    <SectionHeading as="h2" id="blog-latest-heading" tier="secondary" className="text-foreground">
                      {t("blog.latest")}
                    </SectionHeading>
                    <p className="text-body-base text-muted-foreground">
                      {t("blog.latestDescription")}
                    </p>
                  </div>
                  {allArticles.length > 0 ? (
                    <span className="text-body-xs text-muted-foreground">{t("blog.available", { count: allArticles.length })}</span>
                  ) : null}
                </div>

                {featuredArticles.length > 0 ? (
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {featuredArticles.map((article) => (
                    <ArticleCard key={article.id} article={article} t={t} />
                    ))}
                  </div>
                ) : (
                  <BlogEmptyState title={t("blog.emptyTitle")} description={t("blog.emptyLatest")} />
                )}
              </section>

              {CATEGORIES.filter((category) => category.value !== null).map((category) => {
                const remainingArticles = allArticles
                  .filter((article) => article.category === category.value && !featuredIds.has(article.id))
                  .slice(0, 3);
                if (remainingArticles.length === 0) return null;

                return (
                  <section key={category.id} aria-labelledby={`blog-${category.id}-heading`} className="space-y-6">
                    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
                      <SectionHeading as="h3" id={`blog-${category.id}-heading`} tier="secondary" className="text-foreground">
                        {t(`blog.categories.${category.key}`)}
                      </SectionHeading>
                      <LocalizedPublicLink
                        href={`/blog?category=${category.value}`}
                        className="inline-flex items-center text-body-sm font-semibold text-primary underline underline-offset-2 hover:text-primary/80"
                      >
                        {t("blog.viewAll")}
                      </LocalizedPublicLink>
                    </div>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                      {remainingArticles.map((article) => (
                        <ArticleCard key={article.id} article={article} t={t} />
                      ))}
                    </div>
                  </section>
                );
              })}

              <section aria-labelledby="blog-features-heading" className="space-y-6 border-t border-border pt-10">
                <div className="max-w-2xl space-y-2">
                    <SectionHeading as="h2" id="blog-features-heading" tier="secondary" className="text-foreground">
                    {t("blog.featuresTitle")}
                  </SectionHeading>
                  <p className="text-body-base text-muted-foreground">
                    {t("blog.featuresDescription")}
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  {APP_FEATURES.map((feature) => {
                    const Icon = feature.icon;
                    return (
                    <div key={feature.titleKey} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-xs">
                        <div className={cn("w-fit rounded-lg border p-2.5", feature.bg)}>
                          <Icon className="size-5" aria-hidden="true" />
                        </div>
                        <div className="space-y-1.5">
                          <h3 className="font-heading text-body-base font-semibold text-foreground">{t(`blog.${feature.titleKey}`)}</h3>
                          <p className="text-body-sm leading-relaxed text-muted-foreground">{t(`blog.${feature.descKey}`)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <LocalizedPublicLink
                  href="/courses"
                  className="inline-flex items-center rounded-md border border-primary px-4 py-2 text-body-sm font-semibold text-primary transition-colors hover:bg-primary/10"
                >
                  {t("blog.courses")}
                </LocalizedPublicLink>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function BlogEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <FileText className="size-8 text-muted-foreground" aria-hidden="true" />
      <h3 className="font-heading text-h5 font-semibold text-foreground">{title}</h3>
      <p className="max-w-md text-body-base text-muted-foreground">{description}</p>
    </div>
  );
}

function ArticleCard({ article, t }: { article: any; t: Awaited<ReturnType<typeof getTranslations>> }) {
  const isDraft = article.status === "draft";
  return (
    <LocalizedPublicLink
      href={`/blog/${article.slug}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {isDraft && (
        <Badge className="absolute left-3 top-3 z-20 rounded-md bg-status-warning text-status-warning-foreground hover:bg-status-warning/90">
          {t("blog.draft")}
        </Badge>
      )}
      <div className="relative aspect-[4/3] w-full overflow-hidden border-b border-border/50 bg-muted">
        {article.thumbnailUrl ? (
          <Image
            src={article.thumbnailUrl.startsWith("http") ? storage.getUrl(article.thumbnailUrl) : article.thumbnailUrl}
            alt={article.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 33vw, 400px"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/80">
            <span className="font-heading text-body-sm text-muted-foreground">Zyx Blog</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-between p-5">
        <div className="space-y-2">
          <h3 className="line-clamp-2 font-heading text-body-base font-bold leading-snug text-foreground transition-colors group-hover:text-primary">
            {article.title}
          </h3>
          <p className="line-clamp-3 text-body-sm text-muted-foreground">{article.summary}</p>
        </div>

        <div className="mt-4 flex items-center gap-4 border-t border-border/50 pt-4 text-body-xs text-muted-foreground">
          {article.publishedAt ? (
            <span className="flex items-center">
              <Calendar className="mr-1.5 size-3.5" aria-hidden="true" />
              {new Intl.DateTimeFormat(t("blog.dateLocale"), { month: "short", day: "numeric", year: "numeric" }).format(
                new Date(article.publishedAt),
              )}
            </span>
          ) : null}
          <span className="flex items-center">
            <Clock className="mr-1.5 size-3.5" aria-hidden="true" />
            {t("blog.minutes", { count: article.readMinutes })}
          </span>
        </div>
      </div>
    </LocalizedPublicLink>
  );
}
