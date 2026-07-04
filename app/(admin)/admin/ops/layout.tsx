import type { ReactNode } from "react";

export default function OpsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      {children}
    </div>
  );
}
