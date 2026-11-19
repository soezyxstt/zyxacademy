import media from "./public-media.json";

const stagingMediaOrigin = "https://cdn-staging.zyxacademy.com";

/** Only explicitly reviewed repository assets qualify for publication. */
export function publicMediaUrl(asset: keyof typeof media): string {
  const entry = media[asset];
  const origin = process.env.NEXT_PUBLIC_STAGING_MEDIA_ORIGIN;
  if (origin !== stagingMediaOrigin) return `/${entry.path}`;
  return `${origin}/media/${entry.sha256}/${entry.path}`;
}
