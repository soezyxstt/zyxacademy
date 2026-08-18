"use client";

import type { ReactNode } from "react";

/**
 * Shared shell for /sign-in and /sign-up.
 *
 * Both routes use the same Google OAuth flow; only copy and default `callbackURL`
 * differ. Interactive state (loading, OAuth errors) lives in GoogleSignInButton.
 */
type AuthMarketingCardProps = {
 title: string;
 description: ReactNode;
 /** From `?error=` after a failed OAuth round-trip ; server-resolved message. */
 urlErrorMessage: string | null;
 children: ReactNode;
 footer: ReactNode;
};

export function AuthMarketingCard({
 title,
 description,
 urlErrorMessage,
 children,
 footer,
}: AuthMarketingCardProps) {
 return (
 <div className="marketing-container flex min-h-[60vh] flex-col items-center justify-center py-16 motion-safe:[animation:landing-fade-up_0.65s_ease-out_both]">
 <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm transition-shadow duration-300 hover:shadow-md">
 <h1 className="text-center font-heading text-h5 font-bold text-foreground">
 {title}
 </h1>
 <div className="mt-2 text-center text-body-sm text-muted-foreground">
 {description}
 </div>
 {urlErrorMessage ? (
 <p
 role="alert"
 className="mt-4 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-body-sm text-status-error"
 >
 {urlErrorMessage}
 </p>
 ) : null}
 {children}
 {footer}
 </div>
 </div>
 );
}
