import { cache } from "react";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/db";
import { blogArticles } from "@/db/schema";
import { eq, and, ne, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { hasAnyPeran } from "@/lib/auth/authorization";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import Image from "next/image";
import { Calendar, Clock, ChevronLeft, User, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShareDialog, ShareBlock } from "@/components/blog/share-widget";
import { getAppLocale, getTranslations } from "@/lib/i18n/server";
import { LocalizedPublicLink } from "@/components/localized-public-link";

const getArticleBySlug = cache(async (slug: string) => {
  return db.query.blogArticles.findFirst({
    where: eq(blogArticles.slug, slug),
    with: { author: true },
  });
});

import { createMetadata, siteOgImage } from "@/lib/site";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const locale = await getAppLocale();
  const t = await getTranslations("marketing");
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article || article.status !== "published") {
    return createMetadata({
      title: t("blog.articleNotFoundTitle"),
      description: t("blog.articleNotFoundDescription"),
      path: `/blog/${slug}`,
      locale,
    });
  }

  return createMetadata({
    title: article.title,
    description: article.summary || t("blog.articleMetaDescription", { title: article.title }),
    path: `/blog/${article.slug}`,
    image: article.thumbnailUrl || siteOgImage,
    type: "article",
    locale,
  });
}


export default async function BlogDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const t = await getTranslations("marketing");
  const locale = await getAppLocale();
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) notFound();

  // Draft Leakage Guard
  if (article.status !== "published") {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    const userRole = session?.user?.role;
    const isStaff =
      session?.user &&
      ((await hasAnyPeran(session.user.id, ["admin", "tutor"], { allowAdmin: true })) ||
        userRole === "admin" ||
        userRole === "teacher");

    if (!isStaff) {
      notFound();
    }
  }

  // Fetch other published articles for the sidebar
  const otherArticles = await db.query.blogArticles.findMany({
    where: and(
      eq(blogArticles.status, "published"),
      ne(blogArticles.id, article.id)
    ),
    orderBy: [desc(blogArticles.publishedAt)],
    limit: 5,
  });

  return (
    <article className="min-h-screen bg-background pb-20">
      {/* Outer Wrapper with tight top padding (SiteMain handles header space) */}
      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 py-6 md:py-8">

        {/* Back Button */}
        <Button variant="ghost" className="mb-6 -ml-4 text-muted-foreground hover:text-foreground" asChild>
          <LocalizedPublicLink href="/blog">
            <ChevronLeft className="w-4 h-4 mr-2" />
            {t("blog.back")}
          </LocalizedPublicLink>
        </Button>

        {/* 2-Column Grid on Large Screens */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">

          {/* Left Column: Article content (consistent width!) */}
          <div className="lg:col-span-9 space-y-6">
            <div className="container mx-auto px-4 md:px-8 space-y-6">
              {/* Header info */}
              <div className="space-y-4">

                <h1 className="text-h4 md:text-h3 font-heading font-bold text-foreground leading-tight">
                  {article.title}
                </h1>

                <div className="flex flex-wrap items-center gap-5 text-body-sm text-muted-foreground">
                  <div className="flex items-center">
                    <User className="w-4 h-4 mr-2" />
                    {article.author?.name || t("blog.authorFallback")}
                  </div>
                  {article.publishedAt && (
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-2" />
                      {new Intl.DateTimeFormat(locale === "en" ? "en-US" : "id-ID", { month: "long", day: "numeric", year: "numeric" }).format(new Date(article.publishedAt))}
                    </div>
                  )}
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 mr-2" />
                    {t("blog.minutes", { count: article.readMinutes })}
                  </div>
                  <div className="flex items-center border-l border-border pl-5">
                    <ShareDialog
                      slug={article.slug}
                      title={article.title}
                      description={article.summary || ""}
                      locale={locale}
                      trigger={
                        <button className="flex items-center hover:text-foreground transition-colors outline-none cursor-pointer">
                          <Share2 className="w-4 h-4 mr-2" />
                          {t("blog.share")}
                        </button>
                      }
                    />
                  </div>
                </div>

                {article.status !== "published" && (
                  <div className="inline-block px-3 py-1 bg-status-warning/20 text-status-warning border border-status-warning/40 rounded-md text-body-sm font-semibold">
                    {t("blog.preview", { status: article.status })}
                  </div>
                )}
              </div>

              {/* Thumbnail Image (fluid width inside left column, matching text width!) */}
              {article.thumbnailUrl && (
                <div className="relative aspect-[16/9] w-full rounded-xl overflow-hidden border border-border shadow-sm">
                  <Image
                    src={article.thumbnailUrl}
                    alt={article.title}
                    fill
                    className="object-cover"
                  />
                </div>
              )}

              {/* Content Body */}
              <div className="prose prose-zinc dark:prose-invert max-w-none prose-headings:font-heading pt-4">
                <MarkdownRenderer content={article.content} />
              </div>

              <div className="pt-8 border-t border-border mt-12">
              <ShareBlock
                  slug={article.slug}
                  title={article.title}
                  description={article.summary || ""}
                  inline
                locale={locale}
                />
              </div>
            </div>
          </div>

          {/* Right Column: Sidebar (Sticky on desktop) */}
          <aside className="lg:col-span-3 lg:sticky lg:top-24 space-y-6">
            <h3 className="text-body-base font-heading font-bold text-foreground mb-4 border-b border-border pb-2">
              {t("blog.others")}
            </h3>

            {otherArticles.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">{t("blog.noneOthers")}</p>
            ) : (
              <div className="divide-y divide-border">
                {otherArticles.map((other) => (
                  <LocalizedPublicLink
                    key={other.id}
                    href={`/blog/${other.slug}`}
                    className="group flex gap-4 py-3 hover:text-brand-primary transition-colors items-center justify-between"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <h4 className="text-body-sm font-semibold text-foreground group-hover:text-brand-primary transition-colors line-clamp-2 leading-snug">
                        {other.title}
                      </h4>
                      <div className="flex items-center gap-2 text-body-xs text-muted-foreground">
                        {other.publishedAt && (
                          <span>
                            {new Intl.DateTimeFormat(locale === "en" ? "en-US" : "id-ID", { month: "short", day: "numeric", year: "numeric" }).format(new Date(other.publishedAt))}
                          </span>
                        )}
                        <span>•</span>
                        <span>{t("blog.minutesShort", { count: other.readMinutes })}</span>
                      </div>
                    </div>
                    {other.thumbnailUrl && (
                      <div className="relative w-14 h-14 rounded-lg overflow-hidden shrink-0 border border-border bg-muted">
                        <Image
                          src={other.thumbnailUrl}
                          alt={other.title}
                          fill
                          className="object-cover"
                        />
                      </div>
                    )}
                  </LocalizedPublicLink>
                ))}
              </div>
            )}
          </aside>

        </div>
      </div>
    </article>
  );
}
