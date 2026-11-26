export type VideoManagerRole = "admin" | "tutor";
export const videoManagerAccount = "x-native-video-account";
export const videoManagerSession = "x-native-video-session";

const segment = (value: string) => /^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/.test(value);
export function videoManagementPath(role: VideoManagerRole, courseId: string): string | null {
  return (role === "admin" || role === "tutor") && segment(courseId)
    ? `/api/native/course-videos/${role}/${encodeURIComponent(courseId)}` : null;
}

type CatalogRow = { id: string; title: string; description: string | null; revision: string };
export type ManagedVideo = CatalogRow & {
  chapterId: string | null; youtube: string | null; duration: number | null; fileSize: number | null;
};
export type ManagedPlaylist = CatalogRow & { videos: ManagedVideo[] };
export type VideoManagementCatalog = {
  courseId: string; title: string; chapters: { id: string; title: string }[]; playlists: ManagedPlaylist[];
};

export type PlaylistFields = { title: string; description: string | null };
export type VideoFields = PlaylistFields & {
  playlistId: string; chapterId: string | null;
  source: { kind: "keep" } | { kind: "youtube"; video: string };
};
export type ManagedVideoCommand =
  | { action: "new-playlist"; fields: PlaylistFields }
  | { action: "edit-playlist"; id: string; expectedRevision: string; fields: PlaylistFields }
  | { action: "new-video"; fields: VideoFields }
  | { action: "edit-video"; id: string; playlistId: string; expectedRevision: string; fields: VideoFields }
  | { action: "delete-playlist"; id: string; expectedRevision: string; confirmed: true }
  | { action: "delete-video"; id: string; playlistId: string; expectedRevision: string; confirmed: true };
