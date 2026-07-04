import type { ReactNode } from "react";

export default function ContentLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen py-8">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 flex-1 flex flex-col">
        {children}
      </div>
    </div>
  );
}
