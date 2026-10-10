"use client";

import { useState, useRef, useEffect, useCallback, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export interface ClampedMarqueeProps extends ComponentPropsWithoutRef<"div"> {
  text: string;
  textClassName?: string;
  as?: "div" | "span";
  isParentHovered?: boolean;
}

export function ClampedMarquee({
  text,
  className,
  textClassName,
  as: Component = "div",
  isParentHovered = false,
  ...props
}: ClampedMarqueeProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  const [isLocalHovered, setIsLocalHovered] = useState(false);

  const measure = useCallback(() => {
    if (containerRef.current && textRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const textWidth = textRef.current.scrollWidth;
      const diff = textWidth - containerWidth;
      setOverflow(diff > 2 ? diff : 0);
    }
  }, []);

  useEffect(() => {
    measure();
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      measure();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [measure, text]);

  const handleMouseEnter = () => {
    measure();
    setIsLocalHovered(true);
  };

  const handleMouseLeave = () => {
    setIsLocalHovered(false);
  };

  const isHovered = isParentHovered || isLocalHovered;
  const duration = Math.max(1.8, Math.min(8, overflow / 35));

  return (
    <Component
      ref={containerRef as any}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "min-w-0 max-w-full overflow-hidden text-left select-none",
        Component === "span" && "inline-flex align-middle",
        className
      )}
      title={text}
      {...(props as any)}
    >
      <span
        ref={textRef}
        style={{
          transform: isHovered && overflow > 0 ? `translateX(-${overflow + 8}px)` : "translateX(0)",
          transition: isHovered && overflow > 0 ? `transform ${duration}s cubic-bezier(0.25, 1, 0.5, 1)` : "transform 0.3s ease-out",
        }}
        className={cn(
          "inline-block whitespace-nowrap will-change-transform",
          !isHovered && "truncate max-w-full",
          textClassName
        )}
      >
        {text}
      </span>
    </Component>
  );
}
