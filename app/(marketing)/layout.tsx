import type { ReactNode } from "react";
import { Footer } from "@/components/footer";
import { DemoAwareMarketingLayout } from "@/components/demo/demo-marketing-layout";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <DemoAwareMarketingLayout footer={<Footer />}>{children}</DemoAwareMarketingLayout>;
}
