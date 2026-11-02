"use client";

import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { useAppLocale } from "@/lib/i18n/client";
import { withAuthLocale } from "@/lib/i18n/auth-locale-url";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> &
  Pick<LinkProps, "replace" | "scroll" | "prefetch"> & {
    href: string;
    children: ReactNode;
  };

/** Adds a bounded locale hint for the auth screens without saving a preference. */
export function LocalizedAuthLink({ href, children, ...props }: Props) {
  const { locale } = useAppLocale();
  return (
    <Link href={withAuthLocale(href, locale)} {...props}>
      {children}
    </Link>
  );
}
