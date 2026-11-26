/* eslint-disable @next/next/no-img-element */
import { forwardRef, type ComponentProps } from "react";

type Props = Omit<ComponentProps<"img">, "src"> & {
  src: string | { src: string };
  priority?: boolean;
  fill?: boolean;
  unoptimized?: boolean;
  quality?: number;
};
export default forwardRef<HTMLImageElement, Props>(function FixtureImage({ src, priority: _priority, fill, unoptimized: _unoptimized, quality: _quality, style, alt = "", ...props }, ref) {
  return <img {...props} ref={ref} src={typeof src === "string" ? src : src.src} alt={alt} style={fill ? { ...style, position: "absolute", inset: 0, width: "100%", height: "100%" } : style} />;
});
