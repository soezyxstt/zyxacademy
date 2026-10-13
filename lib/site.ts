export const siteName = "Zyx Academy";

export const siteDescription =
  "Tutorial dan pembelajaran untuk mahasiswa ITB tahun pertama dan kedua, materi, kuis, dan pendampingan yang terstruktur.";

export function pageTitle(segment?: string) {
  if (!segment) return siteName;
  const trimmed = segment.trim();
  if (trimmed === siteName) return siteName;
  if (trimmed.endsWith(`· ${siteName}`) || trimmed.endsWith(`- ${siteName}`)) return trimmed;
  return `${trimmed} · ${siteName}`;
}

import type { Metadata } from "next";

export interface CreateMetadataOptions {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  type?: "website" | "article";
  noIndex?: boolean;
}

export function createMetadata({
  title,
  description = siteDescription,
  path,
  image = "/og-image.png",
  type = "website",
  noIndex = false,
}: CreateMetadataOptions = {}): Metadata {
  const fullTitle = pageTitle(title);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.zyxacademy.com";
  const canonicalUrl = path
    ? (path.startsWith("http") ? path : `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`)
    : undefined;
  const imageUrl = image.startsWith("http")
    ? image
    : `${baseUrl}${image.startsWith("/") ? "" : "/"}${image}`;

  return {
    title: fullTitle,
    description,
    ...(canonicalUrl ? { alternates: { canonical: canonicalUrl } } : {}),
    openGraph: {
      title: fullTitle,
      description,
      siteName,
      locale: "id_ID",
      type,
      ...(canonicalUrl ? { url: canonicalUrl } : {}),
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: fullTitle,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [imageUrl],
    },
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
  };
}

