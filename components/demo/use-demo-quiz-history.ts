"use client";
import { useEffect, useState } from "react";
import type { PublicDemoSnapshot } from "@/lib/demo/snapshot";
import { fictionalQuizHistory, localQuizHistory, type DemoQuizHistoryRow } from "@/lib/demo/assessment/history";
import { useDemoSession } from "./demo-session";
export function useDemoQuizHistory(snapshot: PublicDemoSnapshot): DemoQuizHistoryRow[] {
 const { overlay, ready, generation } = useDemoSession();
 const [local, setLocal] = useState<DemoQuizHistoryRow[]>([]);
 useEffect(() => {
  if (!ready) return;
  setLocal(localQuizHistory(snapshot, overlay, key => localStorage.getItem(key)));
 }, [snapshot, overlay, ready, generation]);
 return [...local, ...fictionalQuizHistory(snapshot)];
}
