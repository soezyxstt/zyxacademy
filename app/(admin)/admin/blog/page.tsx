import { db } from "@/db";
import { blogArticles } from "@/db/schema";
import { desc } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, Eye } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export default async function AdminBlogDashboard() {
  const articles = await db.query.blogArticles.findMany({
    orderBy: [desc(blogArticles.createdAt)],
    with: {
      author: true,
    }
  });

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-h2 font-heading tracking-tight">Manajemen Blog</h1>
          <p className="text-muted-foreground mt-2 text-body-md">Kelola artikel, berita, dan tips untuk ditampilkan di Zyx Blog.</p>
        </div>
        <Button asChild>
          <Link href="/admin/blog/new">
            <Plus className="w-4 h-4 mr-2" />
            Tulis Artikel
          </Link>
        </Button>
      </div>

      <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
        <table className="w-full text-left text-body-sm">
          <thead className="bg-muted/50 border-b border-border/80">
            <tr>
              <th className="px-6 py-4 font-semibold text-foreground">Judul Artikel</th>
              <th className="px-6 py-4 font-semibold text-foreground">Kategori</th>
              <th className="px-6 py-4 font-semibold text-foreground">Status</th>
              <th className="px-6 py-4 font-semibold text-foreground">Penulis</th>
              <th className="px-6 py-4 font-semibold text-foreground">Aksi</th>
            </tr>
          </thead>
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
                        <Edit className="w-4.5 h-4.5 mr-1" />
                        Sunting
                      </Link>
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/blog/${article.slug}`} target="_blank">
                        <Eye className="w-4.5 h-4.5 mr-1" />
                        Lihat
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
