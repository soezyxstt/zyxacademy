import type { ReactNode } from "react";

export default function OpsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      {children}
    </div>
  );
}
