export const meetingFrame = { width: 380, height: 640 } as const;
export const meetingPageRoute = "/meet/[slug]";
export const meetingCaseIds = ["meeting-unavailable", "meeting-ready", "meeting-recovery"] as const;
export type MeetingCaseId = (typeof meetingCaseIds)[number];
export const meetingFixtureTitle = "Kelas Fisika";
export const meetingFixtureUrl = "https://meet.google.com/abc-defg-hij";

export function isMeetingCaseId(value: unknown): value is MeetingCaseId {
  return meetingCaseIds.some(id => id === value);
}

export function meetingFixtureResponse(id: MeetingCaseId, attempt: number) {
  const unavailable = id === "meeting-recovery" && attempt === 1;
  const ready = id === "meeting-ready";
  return new Response(JSON.stringify(ready ? { title: meetingFixtureTitle } : {
    error: unavailable ? "fixture-unavailable" : "meeting-unavailable",
  }), { status: ready ? 200 : unavailable ? 503 : 404, headers: { "Content-Type": "application/json" } });
}
