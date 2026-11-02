import type { Metadata } from "next";
import { Inter, Lexend } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import { AppToaster } from "@/components/app-toaster";
import { pageTitle, siteOgImage } from "@/lib/site";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { QueryProvider } from "@/components/providers/query-provider";
import { PostHogProvider } from "@/components/providers/posthog-provider";
import { TelemetryBoundary } from "@/components/providers/telemetry-boundary";
import { ThemeProvider } from "next-themes";
import Script from "next/script";
import NextTopLoader from "nextjs-toploader";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getAppLocaleResolution, getAppMessages, getTranslations } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const [{ locale }, t] = await Promise.all([
    getAppLocaleResolution(),
    getTranslations("core"),
  ]);
  const title = pageTitle(t("site.title"));
  const description = t("site.description");
  const siteName = t("site.name");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.zyxacademy.com";
  return {
    metadataBase: new URL(baseUrl),
    title,
    description,
    openGraph: {
      title,
      description,
      url: baseUrl,
      siteName,
      locale: locale === "en" ? "en_US" : "id_ID",
      type: "website",
      images: [{ url: siteOgImage, width: 1200, height: 630, alt: siteName }],
    },
    twitter: { card: "summary_large_image", title, description, images: [siteOgImage] },
    icons: {
      icon: [
        { url: "/brand/zyx-favicon-16.png", sizes: "16x16", type: "image/png" },
        { url: "/brand/zyx-favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/brand/zyx-favicon-48.png", sizes: "48x48", type: "image/png" },
      ],
      apple: [{ url: "/brand/zyx-app-180.png", sizes: "180x180", type: "image/png" }],
    },
  };
}

const inter = Inter({
 subsets: ["latin"],
 variable: "--font-inter",
});

const lexend = Lexend({
 subsets: ["latin"],
 variable: "--font-lexend",
});

export default async function RootLayout({
 children,
}: Readonly<{
 children: React.ReactNode;
}>) {
 const { locale, accountPreference } = await getAppLocaleResolution();
 const messages = await getAppMessages(locale);
 const t = await getTranslations("core");
 return (
 <html lang={locale} suppressHydrationWarning className={`${inter.variable} ${lexend.variable} overflow-x-clip`}>
 <head>
   <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
 </head>
  <body className="font-sans min-h-screen flex flex-col overflow-x-clip">
    <PostHogProvider>
      <QueryProvider>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <LocaleProvider initialLocale={locale} initialMessages={messages} accountPreference={accountPreference}>
        <NextTopLoader color="var(--primary)" showSpinner={false} shadow="0 0 10px var(--primary), 0 0 5px var(--primary)" />
        {process.env.NODE_ENV === "production" && (
          <TelemetryBoundary>
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
          </TelemetryBoundary>
        )}
        <a
        href="#main-content"
        className="bg-background text-foreground focus:ring-ring sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-100 focus:rounded-md focus:px-4 focus:py-2 focus:ring-2"
        >
        {t("skipToMain")}
        </a>
        {children}
        <AppToaster />
        {process.env.NODE_ENV === "production" && (
          <TelemetryBoundary>
            <SpeedInsights />
            <Analytics />
          </TelemetryBoundary>
        )}
        </LocaleProvider>
        </ThemeProvider>
      </QueryProvider>
    </PostHogProvider>
  </body>
 </html>
 );
}
