import { validDiscussionId } from "../../lib/discussions/policy";

export function discussionDestination(query: Pick<URLSearchParams, "get">) {
  const thread = query.get("thread");
  if (!validDiscussionId(thread)) return null;
  const message = query.get("message");
  return message === null || validDiscussionId(message) ? { thread, message: message ?? undefined } : null;
}

export function discussionWorkspaceHref(path: string, search: URLSearchParams) {
  const query = new URLSearchParams(search);
  query.delete("thread");
  query.delete("message");
  const suffix = query.toString();
  return path + (suffix ? "?" + suffix : "");
}
