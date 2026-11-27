import "katex/dist/katex.min.css";
import { Suspense } from "react";
import { ManagementReferenceProviders } from "./providers";
import AdminFormsPage from "@/app/(admin)/admin/forms/page";
import FormDetail from "@/app/(admin)/admin/forms/[id]/page";
import { DocsIndexView } from "@/components/docs/docs-index-view";
import { DocsArticleView } from "@/components/docs/docs-article-view";
import { getAdminDocs } from "@/lib/docs/admin";
import admin from "@/messages/id/admin.json";
import "./management.css";

export default async function ManagementReference({ searchParams }: { searchParams: Promise<{ screen?: string; theme?: string }> }) {
  const { screen, theme } = await searchParams;
  const docs = getAdminDocs("id");
  const article = docs.find(doc => doc.slug === "blog-dan-tautan")!;
  const content = screen === "docs" ? <DocsIndexView surface="admin" basePath="/management" />
    : screen === "docs-detail" ? <DocsArticleView doc={article} docs={docs} surface="admin" basePath="/management?screen=docs" locale="id" allDocsLabel={admin.docs.allDocs} previousLabel={admin.docs.previous} nextLabel={admin.docs.next} quickLinksLabel={admin.docs.quickLinks} />
      : screen === "form-detail" ? <FormDetail params={Promise.resolve({ id: "form-local" })} />
        : <AdminFormsPage />;
  return <ManagementReferenceProviders>
    <main className={`${theme === "dark" ? "dark" : "light"} min-h-screen bg-background p-4 text-foreground`}>
      <Suspense>{content}</Suspense>
    </main>
  </ManagementReferenceProviders>;
}
