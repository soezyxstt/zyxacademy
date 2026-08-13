/**
 * Google Meet REST API v2 Client Library
 *
 * Provides typed helpers for:
 * 1. OAuth2 token refresh using master host refresh token
 * 2. Meet Space management (creating, reading, updating, ending active conference)
 * 3. Conference Records (history of completed meetings)
 * 4. Participant logs & join/leave timestamped sessions
 * 5. Video Recordings (Google Drive references)
 * 6. Transcripts & spoken dialogue entries
 * 7. Aggregated complete meeting analytics
 */

// ── TYPES & INTERFACES ───────────────────────────────────────────────────────

export interface GoogleMeetSpaceConfig {
  accessType?: "ACCESS_TYPE_UNSPECIFIED" | "OPEN" | "TRUSTED" | "RESTRICTED";
  entryPointAccess?: "ENTRY_POINT_ACCESS_UNSPECIFIED" | "ALL" | "CREATOR_APP_ONLY";
  moderation?: "MODERATION_UNSPECIFIED" | "OFF" | "ON";
}

export interface GoogleMeetSpace {
  name: string; // Resource name: "spaces/{spaceId}"
  meetingUri: string; // e.g. "https://meet.google.com/abc-defg-hij"
  meetingCode: string; // e.g. "abc-defg-hij"
  config?: GoogleMeetSpaceConfig;
  activeConference?: {
    conferenceRecord: string; // e.g. "conferenceRecords/{id}"
  };
}

export interface CreateSpaceOptions {
  accessType?: "OPEN" | "TRUSTED" | "RESTRICTED";
  entryPointAccess?: "ALL" | "CREATOR_APP_ONLY";
  moderation?: "OFF" | "ON";
}

export type GoogleMeetMemberRole = "ROLE_UNSPECIFIED" | "COHOST";

export interface GoogleMeetSpaceMember {
  name?: string;
  email: string;
  role: GoogleMeetMemberRole;
  user?: string;
}

export interface GoogleMeetMemberProvisionResult {
  email: string;
  role: GoogleMeetMemberRole;
  success: boolean;
  error?: string;
}

export interface ConferenceRecord {
  name: string; // e.g. "conferenceRecords/{conferenceRecordId}"
  startTime: string; // ISO 8601 timestamp
  endTime?: string; // ISO 8601 timestamp
  expireTime?: string;
  space: string; // e.g. "spaces/{spaceId}"
}

export interface ListConferenceRecordsResponse {
  conferenceRecords?: ConferenceRecord[];
  nextPageToken?: string;
}

export interface SignedinUser {
  user: string; // Resource name of user or email
  displayName: string;
}

export interface AnonymousUser {
  displayName: string;
}

export interface PhoneUser {
  displayName: string;
}

export interface Participant {
  name: string; // e.g. "conferenceRecords/{id}/participants/{participantId}"
  signedinUser?: SignedinUser;
  anonymousUser?: AnonymousUser;
  phoneUser?: PhoneUser;
  earliestStartTime: string;
  latestEndTime: string;
}

export interface ListParticipantsResponse {
  participants?: Participant[];
  nextPageToken?: string;
}

export interface ParticipantSession {
  name: string; // e.g. "conferenceRecords/{id}/participants/{pId}/participantSessions/{sId}"
  startTime: string;
  endTime: string;
}

export interface ListParticipantSessionsResponse {
  participantSessions?: ParticipantSession[];
  nextPageToken?: string;
}

export interface Recording {
  name: string; // e.g. "conferenceRecords/{id}/recordings/{recordingId}"
  state: "STATE_UNSPECIFIED" | "STARTED" | "ENDED" | "FILE_GENERATED";
  startTime: string;
  endTime: string;
  driveDestination?: {
    file: string; // Google Drive file ID
    exportUri: string; // Google Drive viewing URL
  };
}

export interface ListRecordingsResponse {
  recordings?: Recording[];
  nextPageToken?: string;
}

export interface Transcript {
  name: string; // e.g. "conferenceRecords/{id}/transcripts/{transcriptId}"
  state: "STATE_UNSPECIFIED" | "STARTED" | "ENDED" | "FILE_GENERATED";
  startTime: string;
  endTime: string;
  docsDestination?: {
    document: string; // Google Docs ID
    exportUri: string; // Google Docs viewing URL
  };
}

export interface ListTranscriptsResponse {
  transcripts?: Transcript[];
  nextPageToken?: string;
}

export interface TranscriptEntry {
  name: string; // e.g. "conferenceRecords/{id}/transcripts/{tId}/entries/{entryId}"
  participant: string; // Participant resource name
  text: string;
  languageCode: string;
  startTime: string;
  endTime: string;
}

export interface ListTranscriptEntriesResponse {
  transcriptEntries?: TranscriptEntry[];
  nextPageToken?: string;
}

export interface ComprehensiveParticipantAnalytics {
  participantId: string;
  displayName: string;
  userType: "signedIn" | "anonymous" | "phone";
  userResourceNameOrEmail?: string;
  earliestStartTime: string;
  latestEndTime: string;
  totalDurationSeconds: number;
  sessions: {
    sessionId: string;
    startTime: string;
    endTime: string;
    durationSeconds: number;
  }[];
}

export interface ComprehensiveMeetingAnalytics {
  conferenceRecordId: string;
  spaceName: string;
  startTime: string;
  endTime?: string;
  totalDurationSeconds?: number;
  participantCount: number;
  peakConcurrentParticipants: number;
  participants: ComprehensiveParticipantAnalytics[];
  recordings: {
    recordingId: string;
    startTime: string;
    endTime: string;
    driveExportUri?: string;
  }[];
  transcripts: {
    transcriptId: string;
    startTime: string;
    endTime: string;
    docsExportUri?: string;
    fullText: string;
    entries: {
      entryId: string;
      participantResourceName: string;
      text: string;
      startTime: string;
      endTime: string;
    }[];
  }[];
}

// ── AUTHENTICATION HELPER ─────────────────────────────────────────────────────

/**
 * Exchanges the master `GOOGLE_MEET_REFRESH_TOKEN` for a fresh OAuth2 access token.
 */
export async function getGoogleMeetAccessToken(): Promise<string> {
  const refreshToken =
    process.env.GOOGLE_REFRESH_TOKEN?.trim() ||
    process.env.GOOGLE_MEET_REFRESH_TOKEN?.trim();
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!refreshToken) {
    throw new Error(
      "Missing GOOGLE_REFRESH_TOKEN (or GOOGLE_MEET_REFRESH_TOKEN) in environment variables."
    );
  }
  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables.");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Failed to refresh Google OAuth token (${res.status}): ${errorBody}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token.trim();
}

/**
 * Base HTTP fetch wrapper with OAuth Bearer Token header for Google Meet API.
 */
async function meetApiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const accessToken = await getGoogleMeetAccessToken();
  const url = endpoint.startsWith("https://")
    ? endpoint
    : `https://meet.googleapis.com/v2/${endpoint.replace(/^\//, "")}`;

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (options.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Google Meet API error (${res.status} ${res.statusText}) on ${url}: ${errorText}`);
  }

  return (await res.json()) as T;
}

// ── SPACE MANAGEMENT HELPER FUNCTIONS ────────────────────────────────────────

/**
 * Creates a new Google Meet space under the master Pro account.
 */
export async function createGoogleMeetSpace(
  options?: CreateSpaceOptions
): Promise<GoogleMeetSpace> {
  const body: { config?: GoogleMeetSpaceConfig } = {};
  if (options?.accessType || options?.entryPointAccess || options?.moderation) {
    body.config = {
      ...(options.accessType ? { accessType: options.accessType } : {}),
      ...(options.entryPointAccess ? { entryPointAccess: options.entryPointAccess } : {}),
      ...(options.moderation ? { moderation: options.moderation } : {}),
    };
  }

  const space = await meetApiFetch<GoogleMeetSpace>("spaces", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const meetingCode = space.meetingUri
    ? space.meetingUri.replace(/^https:\/\/meet\.google\.com\//, "")
    : "";

  return {
    ...space,
    meetingCode,
  };
}

/** Adds a preconfigured member through the Meet v2beta member endpoint. */
export async function createGoogleMeetSpaceMember(
  spaceName: string,
  email: string,
  role: GoogleMeetMemberRole
): Promise<GoogleMeetSpaceMember> {
  const accessToken = await getGoogleMeetAccessToken();
  return createGoogleMeetSpaceMemberWithToken(spaceName, email, role, accessToken);
}

async function createGoogleMeetSpaceMemberWithToken(
  spaceName: string,
  email: string,
  role: GoogleMeetMemberRole,
  accessToken: string
): Promise<GoogleMeetSpaceMember> {
  const formattedName = spaceName.startsWith("spaces/") ? spaceName : `spaces/${spaceName}`;
  const res = await fetch(`https://meet.googleapis.com/v2beta/${formattedName}/members`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, role }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Google Meet member API error (${res.status}): ${errorText}`);
  }

  return (await res.json()) as GoogleMeetSpaceMember;
}

/** Adds members independently so one invalid account does not hide all results. */
export async function provisionGoogleMeetSpaceMembers(
  spaceName: string,
  members: { email: string; role: GoogleMeetMemberRole }[]
): Promise<GoogleMeetMemberProvisionResult[]> {
  const uniqueMembers = new Map<string, GoogleMeetMemberRole>();
  for (const member of members) {
    const email = member.email.trim().toLowerCase();
    if (!email) continue;
    const currentRole = uniqueMembers.get(email);
    if (!currentRole || member.role === "COHOST") {
      uniqueMembers.set(email, member.role);
    }
  }

  if (uniqueMembers.size === 0) return [];

  const accessToken = await getGoogleMeetAccessToken();
  const entries = [...uniqueMembers];
  const results: GoogleMeetMemberProvisionResult[] = [];
  const batchSize = 5;

  for (let offset = 0; offset < entries.length; offset += batchSize) {
    const batch = entries.slice(offset, offset + batchSize);
    results.push(
      ...(await Promise.all(
        batch.map(async ([email, role]) => {
          try {
            await createGoogleMeetSpaceMemberWithToken(spaceName, email, role, accessToken);
            return { email, role, success: true };
          } catch (error) {
            return {
              email,
              role,
              success: false,
              error: error instanceof Error ? error.message : "Unknown member provisioning error",
            };
          }
        })
      ))
    );
  }

  return results;
}

/**
 * Retrieves details for a specific Google Meet space.
 * @param spaceName Format: "spaces/{spaceId}" or raw space ID.
 */
export async function getGoogleMeetSpace(spaceName: string): Promise<GoogleMeetSpace> {
  const formattedName = spaceName.startsWith("spaces/") ? spaceName : `spaces/${spaceName}`;
  const space = await meetApiFetch<GoogleMeetSpace>(formattedName);
  const meetingCode = space.meetingUri
    ? space.meetingUri.replace(/^https:\/\/meet\.google\.com\//, "")
    : "";
  return { ...space, meetingCode };
}

/**
 * Patches/updates configuration for a Google Meet space.
 * @param spaceName Format: "spaces/{spaceId}" or raw space ID.
 * @param updateMask Fields to update e.g. ["config.accessType"]
 * @param config Object containing config updates
 */
export async function patchGoogleMeetSpace(
  spaceName: string,
  updateMask: string[],
  config: GoogleMeetSpaceConfig
): Promise<GoogleMeetSpace> {
  const formattedName = spaceName.startsWith("spaces/") ? spaceName : `spaces/${spaceName}`;
  const query = new URLSearchParams({ updateMask: updateMask.join(",") });

  const space = await meetApiFetch<GoogleMeetSpace>(`${formattedName}?${query.toString()}`, {
    method: "PATCH",
    body: JSON.stringify({ config }),
  });

  const meetingCode = space.meetingUri
    ? space.meetingUri.replace(/^https:\/\/meet\.google\.com\//, "")
    : "";
  return { ...space, meetingCode };
}

/**
 * Ends an active conference in a Google Meet space.
 * @param spaceName Format: "spaces/{spaceId}" or raw space ID.
 */
export async function endGoogleMeetActiveConference(spaceName: string): Promise<void> {
  const formattedName = spaceName.startsWith("spaces/") ? spaceName : `spaces/${spaceName}`;
  await meetApiFetch<object>(`${formattedName}:endActiveConference`, {
    method: "POST",
  });
}

// ── CONFERENCE RECORDS HELPER FUNCTIONS ───────────────────────────────────────

/**
 * Lists past conference records (meeting instances).
 * @param filter Query filter, e.g. `space.name = "spaces/{spaceId}"`
 */
export async function listConferenceRecords(
  filter?: string,
  pageSize = 100,
  pageToken?: string
): Promise<ListConferenceRecordsResponse> {
  const params = new URLSearchParams({ pageSize: pageSize.toString() });
  if (filter) params.set("filter", filter);
  if (pageToken) params.set("pageToken", pageToken);

  return await meetApiFetch<ListConferenceRecordsResponse>(`conferenceRecords?${params.toString()}`);
}

/**
 * Gets details of a specific conference record.
 * @param conferenceRecordId Id or full name e.g. "conferenceRecords/{id}"
 */
export async function getConferenceRecord(
  conferenceRecordId: string
): Promise<ConferenceRecord> {
  const name = conferenceRecordId.startsWith("conferenceRecords/")
    ? conferenceRecordId
    : `conferenceRecords/${conferenceRecordId}`;
  return await meetApiFetch<ConferenceRecord>(name);
}

/**
 * Deletes a specific conference record.
 */
export async function deleteConferenceRecord(
  conferenceRecordId: string
): Promise<void> {
  const name = conferenceRecordId.startsWith("conferenceRecords/")
    ? conferenceRecordId
    : `conferenceRecords/${conferenceRecordId}`;
  await meetApiFetch<object>(name, { method: "DELETE" });
}

// ── PARTICIPANTS & SESSIONS HELPER FUNCTIONS ─────────────────────────────────

/**
 * Lists all participants for a specific conference record.
 */
export async function listMeetingParticipants(
  conferenceRecordId: string,
  pageSize = 100,
  pageToken?: string
): Promise<ListParticipantsResponse> {
  const confId = conferenceRecordId.replace(/^conferenceRecords\//, "");
  const params = new URLSearchParams({ pageSize: pageSize.toString() });
  if (pageToken) params.set("pageToken", pageToken);

  return await meetApiFetch<ListParticipantsResponse>(
    `conferenceRecords/${confId}/participants?${params.toString()}`
  );
}

/**
 * Gets details of a single participant.
 */
export async function getMeetingParticipant(
  conferenceRecordId: string,
  participantId: string
): Promise<Participant> {
  const confId = conferenceRecordId.replace(/^conferenceRecords\//, "");
  const pId = participantId.replace(/^participants\//, "");
  return await meetApiFetch<Participant>(`conferenceRecords/${confId}/participants/${pId}`);
}

/**
 * Lists join/leave timestamped sessions for a specific participant in a meeting.
 */
export async function listParticipantSessions(
  conferenceRecordId: string,
  participantId: string,
  pageSize = 100,
  pageToken?: string
): Promise<ListParticipantSessionsResponse> {
  const confId = conferenceRecordId.replace(/^conferenceRecords\//, "");
  const pId = participantId.replace(/^participants\//, "");
  const params = new URLSearchParams({ pageSize: pageSize.toString() });
  if (pageToken) params.set("pageToken", pageToken);

  return await meetApiFetch<ListParticipantSessionsResponse>(
    `conferenceRecords/${confId}/participants/${pId}/participantSessions?${params.toString()}`
  );
}

/**
 * Gets a specific participant session.
 */
export async function getParticipantSession(
  conferenceRecordId: string,
  participantId: string,
  sessionId: string
): Promise<ParticipantSession> {
  const confId = conferenceRecordId.replace(/^conferenceRecords\//, "");
  const pId = participantId.replace(/^participants\//, "");
  const sId = sessionId.replace(/^participantSessions\//, "");
  return await meetApiFetch<ParticipantSession>(
    `conferenceRecords/${confId}/participants/${pId}/participantSessions/${sId}`
  );
}

// ── RECORDINGS HELPER FUNCTIONS ──────────────────────────────────────────────

/**
 * Lists video recordings associated with a conference record.
 */
export async function listMeetingRecordings(
  conferenceRecordId: string,
  pageSize = 100,
  pageToken?: string
): Promise<ListRecordingsResponse> {
  const confId = conferenceRecordId.replace(/^conferenceRecords\//, "");
  const params = new URLSearchParams({ pageSize: pageSize.toString() });
  if (pageToken) params.set("pageToken", pageToken);

  return await meetApiFetch<ListRecordingsResponse>(
    `conferenceRecords/${confId}/recordings?${params.toString()}`
  );
}

/**
 * Gets metadata of a specific meeting recording.
 */
export async function getMeetingRecording(
  conferenceRecordId: string,
  recordingId: string
): Promise<Recording> {
  const confId = conferenceRecordId.replace(/^conferenceRecords\//, "");
  const rId = recordingId.replace(/^recordings\//, "");
  return await meetApiFetch<Recording>(`conferenceRecords/${confId}/recordings/${rId}`);
}

// ── TRANSCRIPTS HELPER FUNCTIONS ──────────────────────────────────────────────

/**
 * Lists transcript files for a conference record.
 */
export async function listMeetingTranscripts(
  conferenceRecordId: string,
  pageSize = 100,
  pageToken?: string
): Promise<ListTranscriptsResponse> {
  const confId = conferenceRecordId.replace(/^conferenceRecords\//, "");
  const params = new URLSearchParams({ pageSize: pageSize.toString() });
  if (pageToken) params.set("pageToken", pageToken);

  return await meetApiFetch<ListTranscriptsResponse>(
    `conferenceRecords/${confId}/transcripts?${params.toString()}`
  );
}

/**
 * Gets metadata for a specific transcript.
 */
export async function getMeetingTranscript(
  conferenceRecordId: string,
  transcriptId: string
): Promise<Transcript> {
  const confId = conferenceRecordId.replace(/^conferenceRecords\//, "");
  const tId = transcriptId.replace(/^transcripts\//, "");
  return await meetApiFetch<Transcript>(`conferenceRecords/${confId}/transcripts/${tId}`);
}

/**
 * Lists spoken dialogue entries with timestamps for a transcript.
 */
export async function listTranscriptEntries(
  conferenceRecordId: string,
  transcriptId: string,
  pageSize = 100,
  pageToken?: string
): Promise<ListTranscriptEntriesResponse> {
  const confId = conferenceRecordId.replace(/^conferenceRecords\//, "");
  const tId = transcriptId.replace(/^transcripts\//, "");
  const params = new URLSearchParams({ pageSize: pageSize.toString() });
  if (pageToken) params.set("pageToken", pageToken);

  return await meetApiFetch<ListTranscriptEntriesResponse>(
    `conferenceRecords/${confId}/transcripts/${tId}/entries?${params.toString()}`
  );
}

/**
 * Gets a specific transcript entry.
 */
export async function getTranscriptEntry(
  conferenceRecordId: string,
  transcriptId: string,
  entryId: string
): Promise<TranscriptEntry> {
  const confId = conferenceRecordId.replace(/^conferenceRecords\//, "");
  const tId = transcriptId.replace(/^transcripts\//, "");
  const eId = entryId.replace(/^entries\//, "");
  return await meetApiFetch<TranscriptEntry>(
    `conferenceRecords/${confId}/transcripts/${tId}/entries/${eId}`
  );
}

// ── AGGREGATED COMPREHENSIVE SUMMARY HELPER ──────────────────────────────────

/**
 * Fetches all details (conference metadata, participants with join/leave durations,
 * video recordings, and full transcript dialogue) into a single aggregated report.
 */
export async function getCompleteMeetingAnalytics(
  conferenceRecordId: string
): Promise<ComprehensiveMeetingAnalytics> {
  const confId = conferenceRecordId.replace(/^conferenceRecords\//, "");

  // 1. Conference Record details
  const record = await getConferenceRecord(confId);

  let totalDurationSeconds: number | undefined;
  if (record.startTime && record.endTime) {
    totalDurationSeconds = Math.round(
      (new Date(record.endTime).getTime() - new Date(record.startTime).getTime()) / 1000
    );
  }

  // 2. Participants & Sessions
  const participantsRes = await listMeetingParticipants(confId);
  const rawParticipants = participantsRes.participants || [];

  const participants: ComprehensiveParticipantAnalytics[] = await Promise.all(
    rawParticipants.map(async (p) => {
      const pId = p.name.split("/").pop() || "";
      const sessionsRes = await listParticipantSessions(confId, pId);
      const rawSessions = sessionsRes.participantSessions || [];

      const sessions = rawSessions.map((s) => {
        const sId = s.name.split("/").pop() || "";
        const dur = Math.round(
          (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 1000
        );
        return {
          sessionId: sId,
          startTime: s.startTime,
          endTime: s.endTime,
          durationSeconds: dur,
        };
      });

      const totalSec = sessions.reduce((acc, curr) => acc + curr.durationSeconds, 0);

      let userType: "signedIn" | "anonymous" | "phone" = "anonymous";
      let displayName = p.anonymousUser?.displayName || "Unknown Participant";
      let userResourceNameOrEmail: string | undefined;

      if (p.signedinUser) {
        userType = "signedIn";
        displayName = p.signedinUser.displayName;
        userResourceNameOrEmail = p.signedinUser.user.includes("@")
          ? p.signedinUser.user
          : undefined;
      } else if (p.phoneUser) {
        userType = "phone";
        displayName = p.phoneUser.displayName;
      }

      return {
        participantId: pId,
        displayName,
        userType,
        userResourceNameOrEmail,
        earliestStartTime: p.earliestStartTime,
        latestEndTime: p.latestEndTime,
        totalDurationSeconds: totalSec,
        sessions,
      };
    })
  );

  // Calculate Peak Concurrent Participants
  const sessionEvents: { time: number; delta: number }[] = [];
  for (const p of participants) {
    for (const s of p.sessions) {
      if (s.startTime) sessionEvents.push({ time: new Date(s.startTime).getTime(), delta: 1 });
      if (s.endTime) sessionEvents.push({ time: new Date(s.endTime).getTime(), delta: -1 });
    }
  }
  sessionEvents.sort((a, b) => a.time - b.time || a.delta - b.delta);
  let currentConcurrency = 0;
  let peakConcurrentParticipants = 0;
  for (const event of sessionEvents) {
    currentConcurrency += event.delta;
    if (currentConcurrency > peakConcurrentParticipants) {
      peakConcurrentParticipants = currentConcurrency;
    }
  }
  if (peakConcurrentParticipants === 0 && participants.length > 0) {
    peakConcurrentParticipants = participants.length;
  }

  // 3. Recordings
  const recordingsRes = await listMeetingRecordings(confId);
  const rawRecordings = recordingsRes.recordings || [];
  const recordings = rawRecordings.map((r) => {
    let driveExportUri = r.driveDestination?.exportUri;
    if (!driveExportUri && r.driveDestination?.file) {
      driveExportUri = `https://drive.google.com/file/d/${r.driveDestination.file}/view`;
    }
    return {
      recordingId: r.name.split("/").pop() || "",
      startTime: r.startTime,
      endTime: r.endTime,
      driveExportUri,
    };
  });

  // 4. Transcripts
  const transcriptsRes = await listMeetingTranscripts(confId);
  const rawTranscripts = transcriptsRes.transcripts || [];

  const transcripts = await Promise.all(
    rawTranscripts.map(async (t) => {
      const tId = t.name.split("/").pop() || "";
      const entriesRes = await listTranscriptEntries(confId, tId);
      const rawEntries = entriesRes.transcriptEntries || [];

      const entries = rawEntries.map((e) => ({
        entryId: e.name.split("/").pop() || "",
        participantResourceName: e.participant,
        text: e.text,
        startTime: e.startTime,
        endTime: e.endTime,
      }));

      const fullText = entries.map((e) => e.text).join(" ");
      let docsExportUri = t.docsDestination?.exportUri;
      if (!docsExportUri && t.docsDestination?.document) {
        docsExportUri = `https://docs.google.com/document/d/${t.docsDestination.document}/edit`;
      }

      return {
        transcriptId: tId,
        startTime: t.startTime,
        endTime: t.endTime,
        docsExportUri,
        fullText,
        entries,
      };
    })
  );

  return {
    conferenceRecordId: confId,
    spaceName: record.space,
    startTime: record.startTime,
    endTime: record.endTime,
    totalDurationSeconds,
    participantCount: participants.length,
    peakConcurrentParticipants,
    participants,
    recordings,
    transcripts,
  };
}
