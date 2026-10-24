"use client";

import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { localizedPublicPath } from "@/lib/public-locale-routes";
import { useAppLocale } from "@/lib/i18n/client";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> &
  Pick<LinkProps, "replace" | "scroll" | "prefetch"> & {
    href: string;
    children: ReactNode;
  };

export function LocalizedPublicLink({ href, children, ...props }: Props) {
  const { locale } = useAppLocale();
  const targetPath = href.split(/[?#]/, 1)[0];
  const localizedPath = localizedPublicPath(locale, targetPath);
  const localizedHref = localizedPath ? `${localizedPath}${href.slice(targetPath.length)}` : href;

  return (
    <Link href={localizedHref} {...props}>
      {children}
    </Link>
  );
}
