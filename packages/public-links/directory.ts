export type PublicLink = {
  id: string;
  title: string;
  url: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  color: string | null;
};

export function groupPublicLinks(links: readonly PublicLink[]) {
  const groups: { label: string; links: PublicLink[] }[] = [];
  const groupMap = new Map<string, PublicLink[]>();
  for (const link of links) {
    const label = link.category || "Umum";
    const bucket = groupMap.get(label);
    if (bucket) {
      bucket.push(link);
    } else {
      groupMap.set(label, [link]);
    }
  }
  for (const [label, items] of groupMap) {
    groups.push({ label, links: items });
  }

  return groups;
}
