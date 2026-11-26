import { notFound, redirect } from "next/navigation";
import { MeetingUnavailable } from "@/components/meet/unavailable";
import id from "@/messages/id/marketing.json";
import { isMeetingCaseId, meetingCaseIds, meetingFixtureUrl } from "@/packages/meet/parity-cases";

export function generateStaticParams() {
  return meetingCaseIds.filter(caseId => caseId !== "meeting-ready" || process.env.PARITY_WEBVIEW_EXPORT !== "1")
    .map(caseId => ({ caseId }));
}

export default async function MeetingFixture({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  if (!isMeetingCaseId(caseId)) notFound();
  if (caseId === "meeting-ready") redirect(meetingFixtureUrl);
  return <div lang="id"><MeetingUnavailable title={id.public.meetNotFound} description={id.public.meetUnavailable} home={id.public.home} /></div>;
}
