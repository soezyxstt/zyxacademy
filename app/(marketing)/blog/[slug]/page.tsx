import { cache } from "react";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/db";
import { blogArticles } from "@/db/schema";
import { eq, and, ne, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, ChevronLeft, User } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const getArticleBySlug = cache(async (slug: string) => {
  return db.query.blogArticles.findFirst({
    where: eq(blogArticles.slug, slug),
    with: { author: true },
  });
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article || article.status !== "published") return {};

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.zyxacademy.com";
  return {
    title: `${article.title} - Zyx Blog`,
    description: article.summary,
    alternates: { canonical: `${baseUrl}/blog/${article.slug}` },
    openGraph: {
      title: article.title,
      description: article.summary,
      type: "article",
      url: `${baseUrl}/blog/${article.slug}`,
      images: article.thumbnailUrl ? [{ url: article.thumbnailUrl }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.summary,
      images: article.thumbnailUrl ? [article.thumbnailUrl] : [],
    }
  };
}

export default async function BlogDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) notFound();

  // Draft Leakage Guard
  if (article.status !== "published") {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    const userRole = session?.user?.role;
    
    if (userRole !== "admin" && userRole !== "teacher") {
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        
        {/* Back Button */}
        <Button variant="ghost" className="mb-6 -ml-4 text-muted-foreground hover:text-foreground" asChild>
          <Link href="/blog">
            <ChevronLeft className="w-4 h-4 mr-2" />
            Kembali ke Blog
          </Link>
        </Button>

        {/* 2-Column Grid on Large Screens */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          
          {/* Left Column: Article content (consistent width!) */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Header info */}
            <div className="space-y-4">
              
              <h1 className="text-h4 md:text-h3 font-heading font-bold text-foreground leading-tight">
                {article.title}
              </h1>
              
              <div className="flex flex-wrap items-center gap-5 text-body-sm text-muted-foreground">
                <div className="flex items-center">
                  <User className="w-4 h-4 mr-2" />
                  {article.author?.name || "Zyx Academy"}
                </div>
                {article.publishedAt && (
                  <div className="flex items-center">
                    <Calendar className="w-4 h-4 mr-2" />
                    {new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(article.publishedAt))}
                  </div>
                )}
                <div className="flex items-center">
                  <Clock className="w-4 h-4 mr-2" />
                  {article.readMinutes} min read
                </div>
              </div>
              
              {article.status !== "published" && (
                <div className="inline-block px-3 py-1 bg-status-warning/20 text-status-warning border border-status-warning/40 rounded-md text-sm font-semibold">
                  Mode Pratinjau (Status: {article.status})
                </div>
              )}
            </div>

            {/* Thumbnail Image (fluid width inside left column, matching text width!) */}
            {article.thumbnailUrl && (
              <div className="aspect-[16/9] w-full rounded-xl overflow-hidden border border-border shadow-sm">
                <img 
                  src={article.thumbnailUrl} 
                  alt={article.title} 
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Content Body */}
            <div className="prose prose-zinc dark:prose-invert max-w-none prose-headings:font-heading pt-4">
              <MarkdownRenderer content={article.content} />
            </div>

          </div>

          {/* Right Column: Sidebar (Sticky on desktop) */}
          <aside className="lg:col-span-4 lg:sticky lg:top-24 space-y-6">
            <h3 className="text-body-lg font-heading font-bold text-foreground mb-4 border-b border-border pb-2">
              Artikel Lainnya
            </h3>
            
            {otherArticles.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">Tidak ada artikel lain.</p>
            ) : (
              <div className="divide-y divide-border">
                {otherArticles.map((other) => (
                  <Link
                    key={other.id}
                    href={`/blog/${other.slug}`}
                    className="group flex gap-4 py-3 hover:text-brand-primary transition-colors items-center justify-between"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <h4 className="text-body-sm font-semibold text-foreground group-hover:text-brand-primary transition-colors line-clamp-2 leading-snug">
                        {other.title}
                      </h4>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        {other.publishedAt && (
                          <span>
                            {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(other.publishedAt))}
                          </span>
                        )}
                        <span>•</span>
                        <span>{other.readMinutes} min read</span>
                      </div>
                    </div>
                    {other.thumbnailUrl && (
                      <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 border border-border bg-muted">
                        <img 
                          src={other.thumbnailUrl} 
                          alt={other.title} 
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </aside>

        </div>
      </div>
    </article>
  );
}
