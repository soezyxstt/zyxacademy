"use client";
import { useEffect } from "react";
export function FixtureReady() {
  useEffect(() => { document.body.dataset.mcpFixtureReady = "true"; return () => { delete document.body.dataset.mcpFixtureReady; }; }, []);
  return null;
}
