import { notFound } from "next/navigation";
import { PublicLinksDirectory } from "@/app/tautan/directory";
import { directoryCases, getDirectoryCase } from "@/packages/public-links/fixtures";
import en from "@/messages/en/marketing.json";
import id from "@/messages/id/marketing.json";

export function generateStaticParams() {
  return Object.keys(directoryCases).map(caseId => ({ caseId }));
}

export default async function DirectoryFixture({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const item = getDirectoryCase(caseId);
  if (!item) notFound();
  return <div className={`directory-reference ${item.theme}`} lang={item.locale} data-directory-case={caseId}>
    <PublicLinksDirectory links={item.links} copy={(item.locale === "en" ? en : id).tautan} />
  </div>;
}
