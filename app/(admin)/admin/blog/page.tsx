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

export default async function AdminBlogDashboard() {
  const articles = await db.query.blogArticles.findMany({
    orderBy: [desc(blogArticles.createdAt)],
    with: {
      author: true,
    }
  });

  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={PenLine}
        title="Manajemen Blog"
        description="Kelola artikel, berita, dan tips untuk ditampilkan di Zyx Blog."
        actions={
          <Button asChild>
            <Link href="/admin/blog/new">
              <Plus className="size-4" />
              Tulis Artikel
            </Link>
          </Button>
        }
      />

      <AdminTable>
        <table className="w-full text-left text-body-sm">
          <AdminTableHead>
            <tr>
              <th className="px-6 py-4 font-semibold text-foreground">Judul Artikel</th>
              <th className="px-6 py-4 font-semibold text-foreground">Kategori</th>
              <th className="px-6 py-4 font-semibold text-foreground">Status</th>
              <th className="px-6 py-4 font-semibold text-foreground">Penulis</th>
              <th className="px-6 py-4 font-semibold text-foreground">Aksi</th>
            </tr>
          </AdminTableHead>
          <tbody className="divide-y divide-border/40">
            {articles.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                  Belum ada artikel. Mulai tulis artikel pertamamu.
                </td>
              </tr>
            ) : (
              articles.map((article) => (
                <tr key={article.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 font-medium text-foreground max-w-sm truncate">
                    {article.title}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="outline" className="rounded-md capitalize">
                      {article.category.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <Badge 
                      variant={article.status === "published" ? "default" : "secondary"}
                      className={article.status === "published" ? "bg-status-success text-status-success-foreground hover:bg-status-success/90 rounded-md" : "rounded-md"}
                    >
                      {article.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {article.author?.name || "Anonim"}
                  </td>
                  <td className="px-6 py-4 flex items-center gap-2">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/admin/blog/${article.id}/edit`}>
                        <Edit className="size-4" />
                        Sunting
                      </Link>
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/blog/${article.slug}`} target="_blank">
                        <Eye className="size-4" />
                        Lihat
                      </Link>
                    </Button>
                    <ShareDialog
                      slug={article.slug}
                      title={article.title}
                      description={article.summary || ""}
                      trigger={
                        <Button variant="ghost" size="sm">
                          <Share2 className="size-4" />
                          Bagikan
                        </Button>
                      }
                    />
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
