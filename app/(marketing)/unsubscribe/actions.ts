"use server";

import { redirect } from "next/navigation";
import { unsubscribeWithEmailToken } from "@/lib/email-preferences/unsubscribe";

export async function confirmEmailUnsubscribeAction(formData: FormData): Promise<void> {
  const token = formData.get("token");
  if (typeof token !== "string" || !token) {
    redirect("/unsubscribe?status=invalid");
  }

  let category: string;
  try {
    category = (await unsubscribeWithEmailToken(token)).category;
  } catch (error) {
    console.error("[confirmEmailUnsubscribeAction]", error);
    redirect("/unsubscribe?status=invalid");
  }
  redirect(`/unsubscribe?status=success&category=${encodeURIComponent(category)}`);
}
