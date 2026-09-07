import type { Metadata } from "next";
import { Inter, Lexend } from "next/font/google";
import "./globals.css";
import { AppToaster } from "@/components/app-toaster";
import { pageTitle, siteDescription } from "@/lib/site";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { QueryProvider } from "@/components/providers/query-provider";
import { PostHogProvider } from "@/components/providers/posthog-provider";
import { ThemeProvider } from "next-themes";
import Script from "next/script";
import NextTopLoader from "nextjs-toploader";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://www.zyxacademy.com"),
  title: pageTitle(),
  description: siteDescription,
  openGraph: {
    title: pageTitle(),
    description: siteDescription,
    url: "https://www.zyxacademy.com",
    siteName: "Zyx Academy",
    locale: "id_ID",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Zyx Academy",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: pageTitle(),
    description: siteDescription,
    images: ["/og-image.png"],
  },
};

const inter = Inter({
 subsets: ["latin"],
 variable: "--font-inter",
});

const lexend = Lexend({
 subsets: ["latin"],
 variable: "--font-lexend",
});

export default function RootLayout({
 children,
}: Readonly<{
 children: React.ReactNode;
}>) {
 return (
 <html lang="id" suppressHydrationWarning className={`${inter.variable} ${lexend.variable} overflow-x-clip`}>
 <head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.17.0/dist/katex.min.css" crossOrigin="anonymous" />
 </head>
  <body className="font-sans min-h-screen flex flex-col overflow-x-clip">
    <PostHogProvider>
      <QueryProvider>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <NextTopLoader color="var(--primary)" showSpinner={false} shadow="0 0 10px var(--primary), 0 0 5px var(--primary)" />
        {process.env.NODE_ENV === "production" && (
          <>
            <Script
              src="https://www.googletagmanager.com/gtag/js?id=G-ENY8EJ44WD"
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-ENY8EJ44WD');
              `}
            </Script>
          </>
        )}
        <a
        href="#main-content"
        className="bg-background text-foreground focus:ring-ring sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-100 focus:rounded-md focus:px-4 focus:py-2 focus:ring-2"
        >
        Langsung ke isi utama
        </a>
        {children}
        <AppToaster />
        {process.env.NODE_ENV === "production" && (
          <>
            <SpeedInsights />
            <Analytics />
          </>
        )}
        </ThemeProvider>
      </QueryProvider>
    </PostHogProvider>
  </body>
 </html>
 );
}
