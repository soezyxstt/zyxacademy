import type { Metadata } from "next";
import { Inter, Lexend } from "next/font/google";
import { NextSSRPlugin } from "@uploadthing/react/next-ssr-plugin";
import { extractRouterConfig } from "uploadthing/server";
import "./globals.css";
import { uploadRouter } from "@/app/api/uploadthing/core";
import { AppToaster } from "@/components/app-toaster";
import { DesmosCalculatorScript } from "@/components/desmos-calculator-script";
import { pageTitle, siteDescription } from "@/lib/site";
import { PushPermissionInit } from "@/components/notifications/push-permission-init";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "next-themes";
import { TutorProvider } from "@/components/course/tutor-drawer";
import { CommandMenuProvider } from "@/components/command-menu";
import Script from "next/script";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.zyxacademy.com"),
  title: pageTitle(),
  description: siteDescription,
  openGraph: {
    title: pageTitle(),
    description: siteDescription,
    url: "https://www.zyxacademy.com",
    siteName: "Zyx Academy",
    locale: "id_ID",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
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
 <body className="font-sans min-h-screen flex flex-col overflow-x-clip">
  <QueryProvider>
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
  <NextSSRPlugin routerConfig={extractRouterConfig(uploadRouter)} />
  <DesmosCalculatorScript />
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
  <a
  href="#main-content"
  className="bg-background text-foreground focus:ring-ring sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-100 focus:rounded-md focus:px-4 focus:py-2 focus:ring-2"
  >
  Langsung ke isi utama
  </a>
  <TutorProvider>
   <CommandMenuProvider>
    {children}
   </CommandMenuProvider>
  </TutorProvider>
  <AppToaster />
  {/* Silent FCM permission + token registration ; no UI rendered */}
  <PushPermissionInit />
  <SpeedInsights />
  <Analytics />
  </ThemeProvider>
  </QueryProvider>
  </body>
 </html>
 );
}