import type { ReactNode } from "react";
import { Providers } from "./providers";
import "./fixture.css";
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="id" suppressHydrationWarning><head><link rel="icon" href="data:," /></head><body><Providers>{children}</Providers></body></html>;
}
