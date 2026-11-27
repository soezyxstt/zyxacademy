"use server";

import { redirect } from "next/navigation";
import { verifyEmailUnsubscribeToken } from "./email-token";

export async function confirmEmailUnsubscribeAction(formData: FormData) {
  const token = formData.get("token");
  if (typeof token !== "string") redirect("/unsubscribe?status=invalid");
  const { category } = verifyEmailUnsubscribeToken(token);
  redirect(`/unsubscribe?status=success&category=${category}`);
}
