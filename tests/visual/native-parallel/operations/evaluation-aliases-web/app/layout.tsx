import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="id"><head><link rel="icon" href="data:," /></head><body>{children}</body></html>;
}
