import { db } from "@/db";
import { blogArticles } from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { Calendar, Clock, ChevronRight, Sparkles, BookOpen, FileText, CreditCard, Target, ArrowRight } from "lucide-react";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Blog - Zyx Academy",
  description: "Artikel terbaru seputar tips kuliah, pojok kampus, fakta seru, dan kegiatan Zyx Academy.",
};

const CATEGORIES = [
  { id: "all", name: "Semua", value: null },
  { id: "tips_kuliah", name: "Tips Kuliah", value: "tips_kuliah" },
  { id: "pojok_kampus", name: "Pojok Kampus", value: "pojok_kampus" },
  { id: "fakta_seru", name: "Fakta Seru", value: "fakta_seru" },
  { id: "kegiatan_zyx", name: "Kegiatan Zyx", value: "kegiatan_zyx" },
];

const APP_FEATURES = [
  {
    title: "Zyx Tutor AI",
    desc: "Belajar adaptif dengan AI tutor pribadi 24/7.",
    icon: Sparkles,
    bg: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  },
  {
    title: "Diktat Interaktif",
    desc: "Master Teaching Document lengkap dengan penjelasan rumus.",
    icon: BookOpen,
    bg: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  },
  {
    title: "Ujian & Tryout",
    desc: "Latihan soal terarah seputar materi ITB dan PTN.",
    icon: FileText,
    bg: "bg-red-500/10 text-red-500 border-red-500/20",
  },
  {
    title: "SM-2 Flashcards",
    desc: "Hafalkan formula penting dengan Spaced Repetition.",
    icon: CreditCard,
    bg: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  },
  {
    title: "Misi Belajar",
    desc: "Panduan studi harian adaptif sesuai kurikulum Anda.",
    icon: Target,
    bg: "bg-violet-500/10 text-violet-500 border-violet-500/20",
  },
];

interface BlogPageProps {
  searchParams: Promise<{ category?: string }>;
}

export default async function BlogPage({ searchParams }: BlogPageProps) {
  const resolvedParams = await searchParams;
  const activeCategory = resolvedParams.category || null;

  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  const userRole = session?.user?.role;
  const isAdminOrTeacher = userRole === "admin" || userRole === "teacher";

  const statusFilter = isAdminOrTeacher
    ? inArray(blogArticles.status, ["published", "draft"])
    : eq(blogArticles.status, "published");

  // Fetch articles based on user permissions
  const allArticles = await db.query.blogArticles.findMany({
    where: statusFilter,
    orderBy: [desc(blogArticles.publishedAt), desc(blogArticles.createdAt)],
    with: { author: true },
  });

  // Filter based on active category
  const filteredArticles = activeCategory
    ? allArticles.filter((a) => a.category === activeCategory)
    : allArticles;

  // Split data for the dashboard layout
  const latestArticles = allArticles.slice(0, 2); // 2 featured articles
  
  // Group rest by category
  const articlesByCategory = (cat: string) => {
    return allArticles.filter((a) => a.category === cat).slice(0, 3);
  };

  return (
    <div className="relative min-h-screen bg-background overflow-hidden">
      <PageOrnaments variant="about" />

      {activeCategory ? (
        /* Filtered Grid View */
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 relative z-10">
          <div className="mb-10">
            <h1 className="text-h2 font-heading text-foreground mb-2">
              Kategori: {CATEGORIES.find((c) => c.value === activeCategory)?.name}
            </h1>
            <p className="text-body-base text-muted-foreground">
              Menampilkan {filteredArticles.length} artikel terbit.
            </p>
          </div>

          {filteredArticles.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-border rounded-xl">
              <h3 className="text-h4 font-heading text-foreground mb-2">Belum ada artikel</h3>
              <p className="text-body-base text-muted-foreground">Artikel untuk kategori ini akan segera hadir.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredArticles.map((article) => (
                <ArticleCard key={article.id} article={article} />
              ))}
            </div>
          )}
        </main>
      ) : (
        /* Dashboard Home View */
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-16 relative z-10">
          
          {/* Custom Scrollbar Styles */}
          <style dangerouslySetInnerHTML={{ __html: `
            .custom-scroll::-webkit-scrollbar {
              height: 6px;
            }
            .custom-scroll::-webkit-scrollbar-track {
              background: transparent;
            }
            .custom-scroll::-webkit-scrollbar-thumb {
              background: rgba(156, 163, 175, 0.25);
              border-radius: 9999px;
            }
            .custom-scroll::-webkit-scrollbar-thumb:hover {
              background: var(--color-brand-primary, #3b82f6);
            }
            .dark .custom-scroll::-webkit-scrollbar-thumb {
              background: rgba(156, 163, 175, 0.15);
            }
          `}} />

          {/* Super App Carousel Section */}
          <section className="space-y-6">
            <div className="space-y-1">
              <h2 className="text-h4 font-heading font-bold text-foreground">
                Belajar Seru dengan Zyx Academy
              </h2>
              <p className="text-body-sm text-muted-foreground">
                Akses semua materi persiapan kuliah dan kompetisi sains dalam satu platform.
              </p>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-4 custom-scroll -mx-4 px-4 sm:mx-0 sm:px-0">
              {APP_FEATURES.map((feature, idx) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={idx}
                    className="flex flex-col justify-between w-[240px] shrink-0 p-5 rounded-xl border border-border bg-card shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div>
                      <div className={cn("p-2.5 w-fit rounded-lg border mb-4", feature.bg)}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <h4 className="text-body-base font-heading font-semibold text-foreground mb-1">
                        {feature.title}
                      </h4>
                      <p className="text-body-sm text-muted-foreground">
                        {feature.desc}
                      </p>
                    </div>
                    <Link
                      href="/courses"
                      className="mt-6 text-body-sm font-semibold text-brand-primary hover:text-brand-primary/80 inline-flex items-center gap-1"
                    >
                      Lihat Detail <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Featured / Latest Articles */}
          {latestArticles.length > 0 && (
            <section className="space-y-6">
              <h2 className="text-h3 font-heading font-bold text-foreground">Artikel Terbaru</h2>
              <div className="flex gap-6 overflow-x-auto pb-4 custom-scroll -mx-4 px-4 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-3 lg:gap-6 lg:overflow-x-visible lg:pb-0 lg:px-0">
                {latestArticles.map((article) => (
                  <div key={article.id} className="w-[280px] sm:w-[320px] md:w-[360px] shrink-0 lg:w-full">
                    <ArticleCard article={article} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Sectioned Category Lists */}
          {CATEGORIES.filter((c) => c.value !== null).map((cat) => {
            const catArticles = articlesByCategory(cat.value!);
            if (catArticles.length === 0) return null;

            return (
              <section key={cat.id} className="space-y-6">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h3 className="text-h3 font-heading font-bold text-foreground">
                    {cat.name}
                  </h3>
                  <Link
                    href={`/blog?category=${cat.value}`}
                    className="text-body-sm font-semibold text-brand-primary hover:text-brand-primary/80 inline-flex items-center gap-1"
                  >
                    Lihat Semua <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
                
                <div className="flex gap-6 overflow-x-auto pb-4 custom-scroll -mx-4 px-4 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-3 lg:gap-6 lg:overflow-x-visible lg:pb-0 lg:px-0">
                  {catArticles.map((article) => (
                    <div key={article.id} className="w-[280px] sm:w-[320px] md:w-[360px] shrink-0 lg:w-full">
                      <ArticleCard article={article} />
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

        </main>
      )}
    </div>
  );
}

// Reusable Article Card Component
function ArticleCard({ article }: { article: any }) {
  const isDraft = article.status === "draft";
  return (
    <Link
      href={`/blog/${article.slug}`}
      className="group flex flex-col h-full bg-card border border-border rounded-xl overflow-hidden hover:shadow-md transition-shadow relative"
    >
      {isDraft && (
        <Badge className="absolute top-3 left-3 z-20 bg-status-warning text-status-warning-foreground hover:bg-status-warning/90 rounded-md">
          DRAFT
        </Badge>
      )}
      <div className="aspect-[4/3] w-full bg-muted relative overflow-hidden border-b border-border/50">
        {article.thumbnailUrl ? (
          <img
            src={article.thumbnailUrl}
            alt={article.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted/80">
            <span className="text-muted-foreground font-heading">Zyx Blog</span>
          </div>
        )}
      </div>
      
      <div className="p-5 flex flex-col flex-1 justify-between">
        <div className="space-y-2">
          <h4 className="text-body-base font-heading font-bold text-foreground line-clamp-2 group-hover:text-brand-primary transition-colors leading-snug">
            {article.title}
          </h4>
          <p className="text-body-sm text-muted-foreground line-clamp-3">
            {article.summary}
          </p>
        </div>
        
        <div className="flex items-center gap-4 text-body-sm text-muted-foreground pt-4 mt-4 border-t border-border/50">
          {article.publishedAt && (
            <span className="flex items-center">
              <Calendar className="w-3.5 h-3.5 mr-1.5" />
              {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(article.publishedAt))}
            </span>
          )}
          <span className="flex items-center">
            <Clock className="w-3.5 h-3.5 mr-1.5" />
            {article.readMinutes} min read
          </span>
        </div>
      </div>
    </Link>
  );
}
