"use client";

import { useEffect, useState, type ReactNode } from "react";

export function HydratedFixture({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  return <div data-zyra-hydrated={ready}>{children}</div>;
}
