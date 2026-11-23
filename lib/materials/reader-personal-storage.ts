/** Private reader data belongs to an authenticated account, never to a shared material key. */
export function readerPersonalStorageKeys(input: { userId?: string; courseId: string; materialId: string; demo: boolean }) {
  if (input.demo) {
    // The demo storage adapter already adds its course/revision session prefix.
    return { notes: `zyx-notes-${input.materialId}`, bookmarks: `zyx-bookmarks-${input.materialId}` };
  }
  if (!input.userId) return null;
  const owner = JSON.stringify([input.userId, input.courseId, input.materialId]);
  return { notes: `zyx-reader:notes:${owner}`, bookmarks: `zyx-reader:bookmarks:${owner}` };
}
