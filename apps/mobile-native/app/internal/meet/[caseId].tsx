import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert } from "react-native";
import { isMeetingCaseId, meetingCaseIds, meetingFixtureResponse, meetingFrame, type MeetingCaseId } from "../../../../../packages/meet/parity-cases";
import { loadPublicMeeting } from "../../../features/meet/client";
import { PublicMeetingScreen } from "../../../features/meet/screen";
import { MarkedPageFrame } from "../../../features/parity/MarkedPageFrame";

export default function InternalMeetingFixture() {
  const { caseId } = useLocalSearchParams();
  if (!isMeetingCaseId(caseId)) return <Redirect href="/" />;
  return <MeetingCase key={caseId} caseId={caseId} />;
}

function MeetingCase({ caseId }: { caseId: MeetingCaseId }) {
  const router = useRouter();
  const [lookup] = useState(() => {
    let attempts = 0;
    return (slug: string, signal: AbortSignal) => loadPublicMeeting(slug, signal, async (_url, { signal }) => {
      await Promise.resolve();
      if (signal?.aborted) throw signal.reason;
      return meetingFixtureResponse(caseId, ++attempts);
    });
  });
  const home = () => router.replace("/");
  return <MarkedPageFrame frame={meetingFrame} index={meetingCaseIds.indexOf(caseId)}>
    <PublicMeetingScreen slug={caseId} locale="id" home={home} back={home} lookup={lookup} insideSafeArea
      openBrowser={async url => { Alert.alert("Browser", url); }} />
  </MarkedPageFrame>;
}
