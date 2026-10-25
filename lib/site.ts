export const siteName = "Zyx Academy";

export const siteDescription =
  "Tutorial dan pembelajaran untuk mahasiswa ITB tahun pertama dan kedua, materi, kuis, dan pendampingan yang terstruktur.";

export const siteOgImage = "/brand/zyx-og-1200x630.png";

export function pageTitle(segment?: string) {
  if (!segment) return siteName;
  const trimmed = segment.trim();
  if (trimmed === siteName) return siteName;
  if (trimmed.endsWith(`· ${siteName}`) || trimmed.endsWith(`- ${siteName}`)) return trimmed;
  return `${trimmed} · ${siteName}`;
}

import type { Metadata } from "next";
import type { Locale } from "@/lib/i18n/locale";
import { PUBLIC_LOCALE_ROUTES, localizedPublicPath } from "@/lib/public-locale-routes";

export interface CreateMetadataOptions {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  type?: "website" | "article";
  noIndex?: boolean;
  locale?: Locale;
  translated?: boolean;
}

export function createMetadata({
  title,
  description = siteDescription,
  path,
  image = siteOgImage,
  type = "website",
  noIndex = false,
  locale = "id",
  translated = false,
}: CreateMetadataOptions = {}): Metadata {
  const fullTitle = pageTitle(title);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.zyxacademy.com";
  const localizedPath = path && translated ? localizedPublicPath(locale, path) : null;
  const canonicalPath = localizedPath ?? path;
  const canonicalUrl = canonicalPath
    ? (canonicalPath.startsWith("http") ? canonicalPath : `${baseUrl}${canonicalPath.startsWith("/") ? "" : "/"}${canonicalPath}`)
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
      locale: locale === "en" ? "en_US" : "id_ID",
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
    ...(translated && path && PUBLIC_LOCALE_ROUTES.includes(path as (typeof PUBLIC_LOCALE_ROUTES)[number])
      ? {
          alternates: {
            canonical: canonicalUrl,
            languages: {
              id: `${baseUrl}${localizedPublicPath("id", path)}`,
              en: `${baseUrl}${localizedPublicPath("en", path)}`,
            },
          },
        }
      : canonicalUrl
        ? { alternates: { canonical: canonicalUrl } }
        : {}),
  };
}

