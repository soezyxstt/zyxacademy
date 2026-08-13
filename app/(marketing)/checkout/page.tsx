import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isDuitkuPaymentEnabled } from "@/lib/payments/duitku";
import { createPlanQuote, isPurchasablePlanKey } from "@/lib/payments/catalog";
import { pageTitle } from "@/lib/site";
import CheckoutClient from "./checkout-client";

export const metadata: Metadata = {
  title: pageTitle("Checkout"),
  description: "Checkout paket belajar Zyx Academy dalam Rupiah melalui Duitku.",
};

type CheckoutSearchParams = {
  plan?: string;
  persons?: string;
  courses?: string;
  other?: string;
};

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<CheckoutSearchParams>;
}) {
  if (!isDuitkuPaymentEnabled()) notFound();

  const params = await searchParams;
  const planKey = params.plan || "";
  if (!isPurchasablePlanKey(planKey)) redirect("/plans");

  const persons = Number(params.persons);
  const otherCoursesCount = Number(params.other || "0");
  const standardCourses = params.courses ? params.courses.split(",").filter(Boolean) : [];
  let quote;
  try {
    quote = createPlanQuote({ planKey, persons, standardCourses, otherCoursesCount });
  } catch {
    redirect("/plans");
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    const next = `/checkout?${new URLSearchParams({
      plan: planKey,
      persons: persons.toString(),
      courses: standardCourses.join(","),
      other: otherCoursesCount.toString(),
    }).toString()}`;
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }

  return (
    <CheckoutClient
      quote={quote}
      standardCourses={standardCourses}
      otherCoursesCount={otherCoursesCount}
      customer={{ name: session.user.name, email: session.user.email }}
    />
  );
}
