import { notFound, redirect } from "next/navigation";
import { env } from "@/lib/env";

/**
 * The campaign is one unified course page; per-subject gateways were folded
 * into /pka. Redirect so previously shared subject links keep working.
 */
export default async function PkaSubjectRedirect() {
  if (env.FEATURE_PKA !== "1") notFound();
  redirect("/pka");
}
