import type { ReactNode } from "react";
import "./fixture.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><link rel="icon" href="data:," /></head>
      <body>{children}</body>
    </html>
  );
}
