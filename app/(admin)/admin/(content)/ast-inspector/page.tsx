import type { Metadata } from "next";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { ASTInspectorClient } from "./ast-inspector-client";
import { pageTitle } from "@/lib/site";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Activity } from "lucide-react";

export const metadata: Metadata = {
  title: pageTitle("Zyx AST Inspector & Debugger"),
  description: "Debug and inspect canonical markdown compilation pipelines.",
};

export default async function ASTInspectorPage() {
  await assertAdmin();
  return (
    <div className="space-y-4">
      <AdminPageHeader
        icon={Activity}
        title="AST Inspector"
      />
      <ASTInspectorClient />
    </div>
  );
}
