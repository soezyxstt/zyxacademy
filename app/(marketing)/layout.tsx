import type { ReactNode } from "react";
import { DemoAwareMarketingLayout } from "@/components/demo/demo-marketing-layout";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <DemoAwareMarketingLayout>{children}</DemoAwareMarketingLayout>;
}
