import type { Metadata } from "next";
import { AboutClient } from "./about-client";
import { createLocalizedMetadata } from "@/lib/site-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return createLocalizedMetadata({ path: "/about", titleKey: "meta.about.title", descriptionKey: "meta.about.description" });
}


export default function AboutPage() {
  return <AboutClient />;
}
