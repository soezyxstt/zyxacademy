import type { MetadataRoute } from "next";
import { getAppLocale, getTranslations } from "@/lib/i18n/server";
import { APP_MANIFEST_ID, APP_MANIFEST_SCOPE, getLocalizedManifestStartUrl } from "@/lib/i18n/manifest";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [locale, t] = await Promise.all([getAppLocale(), getTranslations("core")]);
  return {
    name: "Zyx Academy",
    short_name: "Zyx",
    description: t("site.description"),
    lang: locale,
    id: APP_MANIFEST_ID,
    scope: APP_MANIFEST_SCOPE,
    start_url: getLocalizedManifestStartUrl(locale),
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1a2744",
    icons: [
      {
        src: "/brand/zyx-app-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/zyx-app-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/zyx-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/zyx-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
