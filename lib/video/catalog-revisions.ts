import { revisionOf } from "@/lib/admin-mcp/revision";

type Entry = { id: string; updatedAt: Date };

export function videoEntryRevision({ id, updatedAt }: Entry) {
  return revisionOf({ id, updatedAt });
}

export function videoPlaylistRevision(playlist: Entry, videos: Entry[]) {
  return revisionOf([videoEntryRevision(playlist), videos.map(videoEntryRevision).sort()]);
}
