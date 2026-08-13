import { MarkdownEditor } from "@/components/admin/markdown-editor";
import { AdminPageHeader } from "@/components/admin/page-header";
import { PenLine } from "lucide-react";

export default function NewArticlePage() {
  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={PenLine}
        title="Tulis Artikel"
        description="Buat artikel baru untuk Zyx Blog."
        backHref="/admin/blog"
      />
      <MarkdownEditor />
    </div>
  );
}
