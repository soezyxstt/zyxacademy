import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  presentation?: "default" | "onDark";
  variant?: "horizontal" | "symbol";
}

const logos = {
  horizontal: {
    width: 579,
    height: 72,
    color: "/brand/zyx-logo-horizontal-color.svg",
    reversed: "/brand/zyx-logo-horizontal-reversed.svg",
  },
  symbol: {
    width: 739,
    height: 432,
    color: "/brand/zyx-logo-symbol-color.svg",
    reversed: "/brand/zyx-logo-symbol-reversed.svg",
  },
} as const;

export function Logo({
  className,
  presentation = "default",
  variant = "horizontal",
}: LogoProps) {
  const logo = logos[variant];
  const imageClassName = "h-(--logo-height) w-auto max-w-full shrink-0 select-none object-contain";

  return (
    <span className={cn("inline-flex min-w-0 items-center [--logo-height:2rem]", className)}>
      {presentation === "onDark" ? (
        <Image
          src={logo.reversed}
          alt="Zyx Academy"
          width={logo.width}
          height={logo.height}
          className={imageClassName}
        />
      ) : (
        <>
          <Image
            src={logo.color}
            alt="Zyx Academy"
            width={logo.width}
            height={logo.height}
            className={cn(imageClassName, "dark:hidden")}
          />
          <Image
            src={logo.reversed}
            alt="Zyx Academy"
            width={logo.width}
            height={logo.height}
            className={cn(imageClassName, "hidden dark:block")}
          />
        </>
      )}
    </span>
  );
}
