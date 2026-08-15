import type { ReactNode } from "react";
import { Navbar } from "@/components/navbar";
import { SiteMain } from "@/components/site-main";
import { Footer } from "@/components/footer";
import { env } from "@/lib/env";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar showNotificationPreferences={env.FEATURE_NOTIFICATION_PREFERENCES === "1"} />
      <SiteMain>{children}</SiteMain>
      <Footer />
    </>
  );
}
