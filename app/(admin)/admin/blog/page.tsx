import { db } from "@/db";
import { blogArticles } from "@/db/schema";
import { desc } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Eye, Share2, PenLine } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ShareDialog } from "@/components/blog/share-widget";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminTable, AdminTableHead } from "@/components/admin/table";
import { getTranslations } from "@/lib/i18n/server";
import { TranslatedText } from "@/components/i18n/translated-text";
import { pageTitle } from "@/lib/site";

export async function generateMetadata() {
  const t = await getTranslations("adminOps");
  return { title: pageTitle(t("blog.title")), description: t("blog.description") };
}

export default async function AdminBlogDashboard() {
  const t = await getTranslations("adminOps");
  const articles = await db.query.blogArticles.findMany({
    orderBy: [desc(blogArticles.createdAt)],
    with: {
      author: true,
    }
  });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={PenLine}
        title={<TranslatedText namespace="adminOps" messageKey="blog.title" />}
        actions={
          <Button asChild>
            <Link href="/admin/blog/new">
              <Plus className="size-4" />
              {t("blogList.write")}
            </Link>
          </Button>
        }
      />

      <AdminTable>
        <table className="w-full text-left text-body-sm">
          <AdminTableHead>
            <tr>
              <th className="px-4 py-3 font-semibold text-foreground">{t("blogList.articleTitle")}</th>
              <th className="px-4 py-3 font-semibold text-foreground">{t("blogList.category")}</th>
              <th className="px-4 py-3 font-semibold text-foreground">{t("blogList.status")}</th>
              <th className="px-4 py-3 font-semibold text-foreground">{t("blogList.author")}</th>
              <th className="px-4 py-3 font-semibold text-foreground">{t("blogList.actions")}</th>
            </tr>
          </AdminTableHead>
          <tbody className="divide-y divide-border/40">
            {articles.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                  {t("blogList.empty")}
                </td>
              </tr>
            ) : (
              articles.map((article) => (
                <tr key={article.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground max-w-[280px] md:max-w-xs truncate" title={article.title}>
                    {article.title}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Badge variant="outline" className="rounded-md capitalize">
                      {t(`blogList.categories.${article.category}`)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Badge 
                      variant={article.status === "published" ? "default" : "secondary"}
                      className={article.status === "published" ? "bg-status-success text-status-success-foreground hover:bg-status-success/90 rounded-md" : "rounded-md"}
                    >
                      {t(`blogList.${article.status === "published" ? "published" : "draft"}`)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {article.author?.name || t("blogList.anonymous")}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/blog/${article.id}/edit`}>
                          <Edit className="size-4" />
                          {t("blogList.edit")}
                        </Link>
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/blog/${article.slug}`} target="_blank">
                          <Eye className="size-4" />
                          {t("blogList.view")}
                        </Link>
                      </Button>
                      <ShareDialog
                        slug={article.slug}
                        title={article.title}
                        description={article.summary || ""}
                        trigger={
                          <Button variant="ghost" size="sm">
                            <Share2 className="size-4" />
                            {t("blogList.share")}
                          </Button>
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </AdminTable>
    </div>
  );
}
