import type { Metadata } from "next";
import { AboutClient } from "./about-client";
import { createMetadata } from "@/lib/site";

export const metadata: Metadata = createMetadata({
  title: "Tentang Kami",
  description:
    "Kami membangun pengalaman belajar yang tenang dan terukur dari TPB hingga jurusan.",
  path: "/about",
});


export default function AboutPage() {
  return <AboutClient />;
}
