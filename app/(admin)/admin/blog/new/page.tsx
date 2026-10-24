import { MarkdownEditor } from "@/components/admin/markdown-editor";
import { AdminPageHeader } from "@/components/admin/page-header";
import { PenLine } from "lucide-react";
import { TranslatedText } from "@/components/i18n/translated-text";

export default function NewArticlePage() {
  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={PenLine}
        title={<TranslatedText namespace="adminOps" messageKey="blogList.write" />}
        backHref="/admin/blog"
      />
      <MarkdownEditor />
    </div>
  );
}
