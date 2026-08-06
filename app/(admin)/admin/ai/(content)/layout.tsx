import type { ReactNode } from "react";

export default function ContentLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="mx-auto w-full max-w-6xl flex-1 flex flex-col">
        {children}
      </div>
    </div>
  );
}
