import type { Metadata } from "next";
import { assertAdmin } from "@/lib/uploadthing-admin";
import { ASTInspectorClient } from "./ast-inspector-client";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle("Zyx AST Inspector & Debugger"),
  description: "Debug and inspect canonical markdown compilation pipelines.",
};

export default async function ASTInspectorPage() {
  await assertAdmin();
  return (
    <div className="space-y-6">
      <div className="mb-6 text-left">
        <h1 className="font-heading text-h4 font-bold text-foreground">AST Inspector</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Debug dan periksa struktur parser AST dari markdown MTD.
        </p>
      </div>
      <ASTInspectorClient />
    </div>
  );
}
