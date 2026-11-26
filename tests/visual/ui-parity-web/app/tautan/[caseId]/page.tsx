import { notFound } from "next/navigation";
import { PublicLinksDirectory } from "@/app/tautan/directory";
import { directoryCases, getDirectoryCase } from "@/packages/public-links/fixtures";
import en from "@/messages/en/marketing.json";
import id from "@/messages/id/marketing.json";

export function generateStaticParams() {
  return Object.keys(directoryCases).map(caseId => ({ caseId }));
}

export default async function DirectoryFixture({ params }: { params: Promise<{ caseId: string }> }) {
  const item = getDirectoryCase((await params).caseId);
  if (!item) notFound();
  return <div className={item.theme} lang={item.locale}>
    <PublicLinksDirectory links={item.links} copy={(item.locale === "en" ? en : id).tautan} />
  </div>;
}
