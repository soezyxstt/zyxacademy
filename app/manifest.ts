import type { MetadataRoute } from "next";
import { siteDescription } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zyx Academy",
    short_name: "Zyx",
    description: siteDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1a2744",
    icons: [
      { src: "/brand/zyx-app-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/zyx-app-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
