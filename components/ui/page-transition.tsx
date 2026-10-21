"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";

export function getTransitionConfig(pathname: string | null, reduceMotion: boolean) {
  const isStudent =
    pathname !== null &&
    (pathname.startsWith("/courses") ||
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/calendar") ||
      pathname.startsWith("/feedback") ||
      pathname.startsWith("/leaderboard") ||
      pathname.startsWith("/profile") ||
      pathname.startsWith("/settings"));


  const duration = reduceMotion ? 0 : isStudent ? 0.2 : 0.45;
  const initialY = reduceMotion ? 0 : isStudent ? 6 : 12;

  return { duration, initialY, isStudent };
}

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = Boolean(useReducedMotion());
  const { duration, initialY, isStudent } = getTransitionConfig(pathname, reduceMotion);

  return (
    <motion.div
      key={pathname}
      suppressHydrationWarning
      initial={reduceMotion || isStudent ? false : { opacity: 0, y: initialY }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, ease: "easeOut" }}
      className="min-w-0"
    >
      {children}
    </motion.div>
  );
}
