import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CodingFixture } from "./fixture";
export default function CodingFixturePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Suspense><CodingFixture /></Suspense>;
}
