import type { ReactNode } from "react";
import { Navbar } from "@/components/navbar";
import { SiteMain } from "@/components/site-main";
import { Footer } from "@/components/footer";
import { CommandMenuProvider } from "@/components/command-menu";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <CommandMenuProvider>
      <Navbar />
      <SiteMain>{children}</SiteMain>
      <Footer />
    </CommandMenuProvider>
  );
}
