"use client";
import { useEffect, type ReactNode } from "react";
import { useTutor } from "@/components/course/tutor-drawer";
export function DemoZyra({ children }: { children: ReactNode }) {
 const { openChat } = useTutor();
 useEffect(() => { openChat(); }, [openChat]);
 return children;
}
