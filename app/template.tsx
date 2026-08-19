"use client";

import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { usePathname } from "next/navigation";

// Global tracker for initial bundle load to prevent hydration mismatch
let isInitialLoad = true;

// Determine layout group from pathname
function getLayoutGroup(pathname: string): string {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/tutor")) return "tutor";

  const studentPrefixes = [
    "/dashboard",
    "/calendar",
    "/feedback",
    "/leaderboard",
    "/profile",
    "/settings",
    "/courses",
  ];
  if (studentPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return "student";
  }

  return "marketing";
}

export default function RouteTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const currentGroup = getLayoutGroup(pathname);
  
  // Decide whether to animate based on whether it is initial load OR if layout group changed
  const [shouldAnimate, setShouldAnimate] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const prevGroup = window.sessionStorage.getItem("zyx_last_layout_group");

      if (isInitialLoad) {
        // Always play on hard refresh / initial website load
        setShouldAnimate(true);
        isInitialLoad = false;
      } else if (prevGroup !== null && prevGroup === currentGroup) {
        // Skip animation if navigating within the same layout group
        setShouldAnimate(false);
      } else {
        // Trigger animation if moving to a different layout group
        setShouldAnimate(true);
      }

      // Save the current layout group for subsequent navigations
      window.sessionStorage.setItem("zyx_last_layout_group", currentGroup);
    }
  }, [currentGroup]);

  // If we shouldn't animate, render children instantly without any overlay markup
  if (!shouldAnimate) {
    return <>{children}</>;
  }

  return (
    <>
      {/* Root Layer: Manages structural layout and handles cleanup display switch */}
      <motion.div
        key="route-loader-layer"
        className="fixed inset-0 z-99999 flex items-center justify-center pointer-events-none"
        initial={{ display: "flex" }}
        animate={{ transitionEnd: { display: "none" } }}
        transition={{ delay: 1.8 }} // Keeps layer alive until the logo fully finishes
      >
        {/* Background Overlay Layer */}
        <motion.div
          className="absolute inset-0 bg-background backdrop-blur-sm dark:backdrop-blur-md pointer-events-none"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeInOut", delay: 1.3 }}
        />

        {/* Logo Drawing Container */}
        <motion.div
          className="w-45 h-45 md:w-55 md:h-55 flex items-center justify-center bg-transparent relative z-10 select-none"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: "easeInOut", delay: 1.3 }}
        >
          <div className="w-[70%] h-[70%] relative">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 2182 1275"
              fill="none"
              className="w-full h-full"
              style={{ overflow: "visible" }}
            >
              {/* Path 1 (Z) */}
              <motion.path
                d="M820.486 0L1043.32 311.527L561.052 985.764H785.07C1218.92 985.764 1414.6 741.149 1490.45 548.958C1530.06 448.611 1614.41 218.403 1779.69 153.473C1726.56 188.889 1645.61 253.821 1596.7 619.792C1511.51 1257.29 1018.23 1275 675.869 1275H0L705.095 289.236H0V0H820.486Z"
                className="fill-marketing-navy dark:fill-white"
                stroke="var(--brand-primary)"
                strokeWidth={16}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ fillOpacity: 0, strokeOpacity: 1, pathLength: 0 }}
                animate={{ fillOpacity: 1, strokeOpacity: 0, pathLength: 1 }}
                transition={{
                  pathLength: { duration: 0.8, ease: "easeInOut" },
                  fillOpacity: { duration: 0.4, delay: 0.8, ease: "easeInOut" },
                  strokeOpacity: { duration: 0.3, delay: 0.8, ease: "easeInOut" },
                }}
              />

              {/* Path 2 (X) */}
              <motion.path
                d="M1548 389.927L1826.91 0H2181.08L1725.09 637.5L2181.08 1275H1826.91L1584.83 936.551C1624.06 852.061 1646.88 746.292 1646.88 613.889C1646.88 330.556 1729.52 188.89 1782.64 153.473C1617.37 218.403 1594.99 445.66 1555.38 546.007C1531.12 607.48 1494.6 674.317 1441.95 736.797L914.931 0H1269.1L1548 389.927Z"
                className="fill-zx-accent dark:fill-white"
                stroke="var(--zx-accent)"
                strokeWidth={16}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ fillOpacity: 0, strokeOpacity: 1, pathLength: 0 }}
                animate={{ fillOpacity: 1, strokeOpacity: 0, pathLength: 1 }}
                transition={{
                  pathLength: { duration: 0.8, ease: "easeInOut", delay: 0.15 },
                  fillOpacity: { duration: 0.4, delay: 0.95, ease: "easeInOut" },
                  strokeOpacity: { duration: 0.3, delay: 0.95, ease: "easeInOut" },
                }}
              />
            </svg>
          </div>
        </motion.div>
      </motion.div>

      {children}
    </>
  );
}
