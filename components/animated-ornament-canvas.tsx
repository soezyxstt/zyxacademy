"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type AnimatedOrnamentVariant = "wave-network" | "constellation" | "orbit";

type AnimatedOrnamentCanvasProps = {
  className?: string;
  variant?: AnimatedOrnamentVariant;
  particleCount?: number;
  symbolSet?: string[];
  waveOpacity?: number;
  particleOpacity?: number;
  lineOpacity?: number;
  tone?: "light" | "dark";
};

const defaultSymbols = ["pi", "sum", "int", "inf", "sqrt", "delta"];

export function AnimatedOrnamentCanvas({
  className,
  variant = "wave-network",
  particleCount = 48,
  symbolSet = defaultSymbols,
  waveOpacity = 0.14,
  particleOpacity = 0.45,
  lineOpacity = 0.08,
  tone = "dark",
}: AnimatedOrnamentCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;

    const ctx = canvasElement.getContext("2d") as CanvasRenderingContext2D;

    let width = 0;
    let height = 0;
    let raf = 0;
    let time = 0;
    const baseColor = tone === "light" ? "42,60,106" : "255,255,255";

    const particles: Array<{ x: number; y: number; vx: number; vy: number; r: number; alpha: number }> = [];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function resize() {
      const rect = canvasElement!.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvasElement!.width = width;
      canvasElement!.height = height;
    }

    function initParticles() {
      particles.length = 0;
      for (let i = 0; i < particleCount; i += 1) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22,
          r: Math.random() * 1.8 + 0.8,
          alpha: Math.random() * particleOpacity + 0.15,
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);
      time += 0.008;

      if (variant === "wave-network" || variant === "orbit") {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(${baseColor},${waveOpacity})`;
        ctx.lineWidth = 1.4;
        for (let x = 0; x <= width; x += 2) {
          const y =
            height * 0.52 +
            Math.sin(x * 0.01 + time * 2.2) * 32 +
            Math.sin(x * 0.004 + time * 1.1) * 14;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        if (variant === "orbit") {
          const radiusX = (width * 0.18 + (i % 9) * 8) * (i % 2 === 0 ? 1 : 0.72);
          const radiusY = (height * 0.46 + (i % 7) * 7) * (i % 2 === 0 ? 0.82 : 1);
          const spin = time * (0.6 + (i % 5) * 0.08) + i;
          p.x = width * 0.5 + Math.cos(spin) * radiusX;
          p.y = height * 0.5 + Math.sin(spin) * radiusY;
        } else {
          p.x += p.vx;
          p.y += p.vy;
        }

        if (p.x <= 0 || p.x >= width) p.vx *= -1;
        if (p.y <= 0 || p.y >= height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${baseColor},${p.alpha})`;
        ctx.fill();

        for (let j = i + 1; j < particles.length; j += 1) {
          const q = particles[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 90) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(${baseColor},${lineOpacity * (1 - dist / 90)})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      ctx.font = '500 18px "Lexend", sans-serif';
      ctx.textAlign = "center";
      for (let i = 0; i < symbolSet.length; i += 1) {
        const x =
          variant === "constellation"
            ? ((i + 1) * width) / (symbolSet.length + 1) + Math.sin(time * 0.6 + i) * 10
            : ((i + 1) * width) / (symbolSet.length + 1);
        const y =
          variant === "orbit"
            ? height * 0.5 + Math.sin(time * 1.3 + i) * (height * 0.44)
            : height * 0.25 + (i % 2 === 0 ? 1 : -1) * Math.sin(time * 1.6 + i) * 16;
        ctx.fillStyle = `rgba(${baseColor},0.18)`;
        ctx.fillText(symbolSet[i] ?? "", x, y);
      }

      if (variant === "constellation") {
        const stars = 26;
        for (let i = 0; i < stars; i += 1) {
          const x = ((i * 193 + 47) % width) + Math.sin(time + i) * 5;
          const y = ((i * 127 + 73) % height) + Math.cos(time * 0.8 + i) * 5;
          const twinkle = 0.2 + (Math.sin(time * 2 + i) + 1) * 0.15;
          ctx.beginPath();
          ctx.arc(x, y, 1.1 + ((i % 3) * 0.4), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${baseColor},${twinkle})`;
          ctx.fill();
        }
      }

      raf = window.requestAnimationFrame(draw);
    }

    resize();
    initParticles();

    if (!reducedMotion) {
      raf = window.requestAnimationFrame(draw);
    } else {
      draw();
      window.cancelAnimationFrame(raf);
    }

    const onResize = () => {
      resize();
      initParticles();
    };

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.cancelAnimationFrame(raf);
    };
  }, [lineOpacity, particleCount, particleOpacity, symbolSet, tone, variant, waveOpacity]);

  return <canvas ref={canvasRef} className={cn("pointer-events-none absolute inset-0 z-0 h-full w-full", className)} aria-hidden />;
}
