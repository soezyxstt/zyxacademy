/** Canonical persistence identity shared by publication and dependency verification. */
export function productVersionId(id: string, version: number): string {
  return version === 1 ? id : `${id}:v${version}`;
}
