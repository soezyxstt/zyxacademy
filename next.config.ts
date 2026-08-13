import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["puppeteer"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },
  allowedDevOrigins: ["http://localhost:3000", "http://127.0.0.1:3000", "127.0.0.1"],
  async redirects() {
    // Legacy Tutorial PKA microsite URLs; the campaign now lives at
    // /courses/tutorial-pka inside the regular student course shell.
    // Order matters: the most specific patterns must come first.
    return [
      {
        source: "/pka",
        destination: "/courses/tutorial-pka",
        permanent: true,
      },
      {
        source: "/pka/report",
        destination: "/courses/tutorial-pka/laporan",
        permanent: true,
      },
      {
        source: "/pka/:subject/stage/:stage",
        destination: "/courses/tutorial-pka/simulasi/:subject/:stage",
        permanent: true,
      },
      {
        source: "/pka/:subject",
        destination: "/courses/tutorial-pka/simulasi",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
