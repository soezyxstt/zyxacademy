import { MarkdownEditor } from "@/components/admin/markdown-editor";
import { AdminPageHeader } from "@/components/admin/page-header";
import { PenLine } from "lucide-react";

export default function NewArticlePage() {
  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={PenLine}
        title="Tulis Artikel"
        backHref="/admin/blog"
      />
      <MarkdownEditor />
    </div>
  );
}
