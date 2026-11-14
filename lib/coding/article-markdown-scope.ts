export function appendArticleMarkdownScope(parent: string | null, id: string): string {
  return `${parent ?? ""}${id.length}:${id}`;
}

export function markdownPythonId(scope: string, blockId: string): string {
  const value = JSON.stringify([scope, blockId]);
  let first = 2166136261, second = 0x9e3779b9;
  for (let i = 0; i < value.length; i++) {
    first = Math.imul(first ^ value.charCodeAt(i), 16777619);
    second = Math.imul(second ^ value.charCodeAt(i), 2246822519);
  }
  return `markdown-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}
