import type { Metadata } from "next";
import { createLocalizedMetadata } from "@/lib/site-metadata";
import PlansClient from "./plans-client";

export async function generateMetadata(): Promise<Metadata> {
  return createLocalizedMetadata({ path: "/plans", titleKey: "meta.plans.title", descriptionKey: "meta.plans.description" });
}


export default function PlansPage() {
  return <PlansClient />;
}
