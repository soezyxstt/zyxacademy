import "server-only";
import { env } from "@/lib/env";
import { getAllAdminEmails } from "@/lib/google-drive-permissions";
import { getConferenceRecord, getGoogleMeetAccessToken, listMeetingRecordings, listMeetingTranscripts } from "@/lib/google-meet";
import { ManagementFailure, type MeetDriveSyncReceipt } from "@/packages/native-parity/operations/management-contract";
import { ensureMeetDriveEditors, meetDriveArtifactId } from "./drive-artifacts";

export async function syncMeetDriveEditors(id: string): Promise<MeetDriveSyncReceipt> {
  if (env.FEATURE_DRIVE_EDITOR_SYNC !== "1") throw new ManagementFailure("forbidden");
  try {
    const record = await getConferenceRecord(id);
    if (record.name !== `conferenceRecords/${id}`) throw new ManagementFailure("not-found");
  } catch (error) {
    if (error instanceof ManagementFailure) throw error;
    if (error instanceof Error && /^Google Meet API error \(404\b/.test(error.message)) throw new ManagementFailure("not-found");
    return { status: "incomplete", synchronized: 0, pending: 0 };
  }

  async function readArtifacts(kind: "recording" | "transcript") {
    let cursor: string | undefined;
    const artifacts = new Set<string>();
    for (let index = 0; index < 5; index++) {
      const page = kind === "recording"
        ? await listMeetingRecordings(id, 100, cursor).then(out => ({
          destinations: (out.recordings ?? []).map(recording => [recording.driveDestination?.file, recording.driveDestination?.exportUri]),
          cursor: out.nextPageToken,
        }))
        : await listMeetingTranscripts(id, 100, cursor).then(out => ({
          destinations: (out.transcripts ?? []).map(transcript => [transcript.docsDestination?.document, transcript.docsDestination?.exportUri]),
          cursor: out.nextPageToken,
        }));
      for (const [resource, url] of page.destinations) {
        const artifact = meetDriveArtifactId(resource) ?? meetDriveArtifactId(url);
        if (artifact) artifacts.add(artifact);
      }
      cursor = page.cursor;
      if (!cursor) break;
    }
    return { artifacts, remaining: Boolean(cursor) };
  }

  try {
    const [recordings, transcripts] = await Promise.all([readArtifacts("recording"), readArtifacts("transcript")]);
    const files = [...new Set([...recordings.artifacts, ...transcripts.artifacts])];
    const incompleteList = recordings.remaining || transcripts.remaining;
    if (!files.length) return { status: incompleteList ? "incomplete" : "complete", synchronized: 0, pending: 0 };
    const [emails, token] = await Promise.all([getAllAdminEmails({ activeOnly: true }), getGoogleMeetAccessToken()]);
    if (!emails.length) return { status: "incomplete", synchronized: 0, pending: files.length };

    const signal = AbortSignal.timeout(10_000);
    let synchronized = 0;
    for (let i = 0; i < files.length && !signal.aborted; i += 4) {
      const outcomes = await Promise.all(files.slice(i, i + 4).map(file =>
        ensureMeetDriveEditors(file, emails, token, signal).catch(() => false)));
      synchronized += outcomes.filter(Boolean).length;
    }
    const pending = files.length - synchronized;
    return { status: incompleteList || pending ? "incomplete" : "complete", synchronized, pending };
  } catch {
    return { status: "incomplete", synchronized: 0, pending: 0 };
  }
}
