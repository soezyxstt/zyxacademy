import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/forms-playground", "/demo", "/id/demo", "/en/demo"],
    },
    sitemap: "https://www.zyxacademy.com/sitemap.xml",
  };
}
