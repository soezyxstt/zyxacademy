export function isMaterialReaderPathname(pathname: string): boolean {
  return /^\/courses\/[^/]+\/material\/[^/]+\/?$/.test(pathname);
}
