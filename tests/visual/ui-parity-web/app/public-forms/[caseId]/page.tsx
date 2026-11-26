import { notFound, redirect } from "next/navigation";
import { isPublicFormCaseId, publicFormCases, publicFormFixtureMeeting } from "@/packages/forms/parity-cases";
import { PublicFormReference } from "./viewer";

export function generateStaticParams() {
  return Object.entries(publicFormCases)
    .filter(([, sample]) => sample.status !== "meeting" || process.env.PARITY_WEBVIEW_EXPORT !== "1")
    .map(([caseId]) => ({ caseId }));
}

export default async function PublicFormFixture({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  if (!isPublicFormCaseId(caseId)) notFound();
  const sample = publicFormCases[caseId];
  if (sample.status === "meeting") redirect(publicFormFixtureMeeting);
  return <PublicFormReference id={sample.id} shortEntry={sample.entry === "short"} />;
}
